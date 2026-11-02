param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string]$SubmissionsDirectory,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$OutputExcel
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$submissionRoot = (Resolve-Path -LiteralPath $SubmissionsDirectory).Path
$solutionsDirectory = Join-Path $submissionRoot "solutions"
if (-not (Test-Path -LiteralPath $solutionsDirectory -PathType Container)) {
    throw "The expected solutions directory was not found: $solutionsDirectory"
}

$solutionNamePattern = '^(real|synth)_.+_[0-9]+\.json$'
$referenceFiles = @(
    Get-ChildItem -LiteralPath $solutionsDirectory -File -Recurse |
        Where-Object { $_.Name -match $solutionNamePattern }
)
if ($referenceFiles.Count -eq 0) {
    throw "No solution JSON files matching '$solutionNamePattern' were found in $solutionsDirectory"
}

$solutionNames = @(
    $referenceFiles |
        Select-Object -ExpandProperty Name -Unique |
        Sort-Object
)
$referencePaths = @{}
foreach ($solutionName in $solutionNames) {
    $referencePaths[$solutionName] = (
        $referenceFiles |
            Where-Object Name -eq $solutionName |
            Sort-Object -Property FullName |
            Select-Object -First 1
    ).FullName
}

$teamDirectories = @(
    Get-ChildItem -LiteralPath $submissionRoot -Directory |
        Where-Object { $_.Name -ne "solutions" } |
        Sort-Object -Property Name
)
if ($teamDirectories.Count -eq 0) {
    throw "No team directories were found alongside $solutionsDirectory"
}

if ([string]::IsNullOrWhiteSpace($OutputExcel)) {
    $OutputExcel = Join-Path $submissionRoot "scores.xlsx"
}

$scoreTasks = [System.Collections.Generic.List[object]]::new()
$teamResults = [System.Collections.Generic.List[object]]::new()
foreach ($teamDirectory in $teamDirectories) {
    $teamFiles = @(
        Get-ChildItem -LiteralPath $teamDirectory.FullName -File -Recurse |
            Where-Object { $_.Extension -ieq ".json" }
    )
    $filesByName = @{}
    foreach ($teamFile in $teamFiles) {
        if (-not $filesByName.ContainsKey($teamFile.Name)) {
            $filesByName[$teamFile.Name] = [System.Collections.Generic.List[object]]::new()
        }
        $filesByName[$teamFile.Name].Add($teamFile)
    }

    $matchingCount = 0
    $missingSolutions = [System.Collections.Generic.List[string]]::new()
    $errors = [System.Collections.Generic.List[string]]::new()
    $scores = @{}
    $teamPaths = @{}

    foreach ($solutionName in $solutionNames) {
        if (-not $filesByName.ContainsKey($solutionName)) {
            $missingSolutions.Add($solutionName)
            continue
        }

        $matchingCount++
        $candidateFiles = @($filesByName[$solutionName] | Sort-Object -Property FullName)
        $teamPaths[$solutionName] = $candidateFiles[0].FullName
        $candidateHashes = @(
            $candidateFiles |
                ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } |
                Select-Object -Unique
        )
        if ($candidateHashes.Count -gt 1) {
            $errors.Add("$solutionName (duplicate files have different content)")
            continue
        }

        $scoreTasks.Add([PSCustomObject]@{
            Team          = $teamDirectory.Name
            Solution      = $solutionName
            ReferencePath = $referencePaths[$solutionName]
            TestPath      = $candidateFiles[0].FullName
        })
    }

    $teamResults.Add([PSCustomObject]@{
        Team             = $teamDirectory.Name
        MatchingSolutions = $matchingCount
        MissingSolutions = $missingSolutions -join "; "
        Errors           = $errors -join "; "
        Scores           = $scores
        TeamPaths        = $teamPaths
    })
}

$manifestPath = $null
try {
    if ($scoreTasks.Count -gt 0) {
        $manifestPath = Join-Path ([System.IO.Path]::GetTempPath()) "score1-$([guid]::NewGuid().ToString('N')).json"
        $manifest = @(
            $scoreTasks | ForEach-Object {
                [PSCustomObject]@{
                    team          = $_.Team
                    solution      = $_.Solution
                    referencePath = $_.ReferencePath
                    testPath      = $_.TestPath
                }
            }
        )
        $manifestJson = ConvertTo-Json -InputObject $manifest -Depth 4
        [System.IO.File]::WriteAllText(
            $manifestPath,
            $manifestJson,
            [System.Text.UTF8Encoding]::new($false)
        )

        $scoreScript = Join-Path $PSScriptRoot "ThreeJS\score.mjs"
        $scoreOutput = & node $scoreScript $manifestPath
        if ($LASTEXITCODE -ne 0) {
            throw "Three.js scoring failed with exit code $LASTEXITCODE."
        }
        $scoredSolutions = @($scoreOutput -join "`n" | ConvertFrom-Json)
        foreach ($scoredSolution in $scoredSolutions) {
            $teamResult = $teamResults | Where-Object Team -eq $scoredSolution.team | Select-Object -First 1
            if ($null -eq $teamResult) {
                throw "The scoring simulator returned an unknown team: $($scoredSolution.team)"
            }
            $teamResult.Scores[$scoredSolution.solution] = [double]$scoredSolution.score
        }
    }
}
finally {
    if ($null -ne $manifestPath -and (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        Remove-Item -LiteralPath $manifestPath -Force
    }
}

$sortedTeamResults = @($teamResults | Sort-Object -Property Team)
$OutputExcel = [System.IO.Path]::GetFullPath($OutputExcel)
if ([System.IO.Path]::GetExtension($OutputExcel) -ine ".xlsx") {
    throw "The output report must use the .xlsx extension: $OutputExcel"
}

$outputDirectory = Split-Path -Parent $OutputExcel
if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$worksheetRows = [System.Collections.Generic.List[object]]::new()
$hyperlinkRelationships = [System.Collections.Generic.List[object]]::new()
$header = [System.Collections.Generic.List[object]]::new()
$header.Add([PSCustomObject]@{ Kind = "Text"; Value = "Solution"; TargetPath = $null })
foreach ($teamResult in $sortedTeamResults) {
    $header.Add([PSCustomObject]@{ Kind = "Text"; Value = "$($teamResult.Team) JSON"; TargetPath = $null })
    $header.Add([PSCustomObject]@{ Kind = "Text"; Value = "$($teamResult.Team) Score"; TargetPath = $null })
}
$header.Add([PSCustomObject]@{ Kind = "Text"; Value = ""; TargetPath = $null })
$header.Add([PSCustomObject]@{ Kind = "Text"; Value = "Head-to-head team"; TargetPath = $null })
foreach ($teamResult in $sortedTeamResults) {
    $header.Add([PSCustomObject]@{ Kind = "Text"; Value = $teamResult.Team; TargetPath = $null })
}
$worksheetRows.Add($header)

$rowCount = [math]::Max($solutionNames.Count, $sortedTeamResults.Count)
for ($rowIndex = 0; $rowIndex -lt $rowCount; $rowIndex++) {
    $row = [System.Collections.Generic.List[object]]::new()
    if ($rowIndex -lt $solutionNames.Count) {
        $solutionName = $solutionNames[$rowIndex]
        $row.Add([PSCustomObject]@{
            Kind = "Link"; Value = $solutionName; TargetPath = $referencePaths[$solutionName]
        })

        foreach ($teamResult in $sortedTeamResults) {
            if (-not $teamResult.TeamPaths.ContainsKey($solutionName)) {
                $row.Add([PSCustomObject]@{ Kind = "Text"; Value = ""; TargetPath = $null })
                $row.Add([PSCustomObject]@{ Kind = "Text"; Value = "MISSING"; TargetPath = $null })
                continue
            }

            $teamPath = $teamResult.TeamPaths[$solutionName]
            $row.Add([PSCustomObject]@{
                Kind = "Link"; Value = [System.IO.Path]::GetFileName($teamPath); TargetPath = $teamPath
            })
            if ($teamResult.Errors -match [regex]::Escape("$solutionName (duplicate files have different content)")) {
                $row.Add([PSCustomObject]@{ Kind = "Text"; Value = "CONFLICT"; TargetPath = $null })
            }
            elseif ($teamResult.Scores.ContainsKey($solutionName)) {
                $row.Add([PSCustomObject]@{
                    Kind = "Number"
                    Value = [math]::Round($teamResult.Scores[$solutionName], 6)
                    TargetPath = $null
                })
            }
            else {
                throw "No score or duplicate-file error was recorded for $solutionName in team $($teamResult.Team)."
            }
        }
    }
    else {
        $row.Add([PSCustomObject]@{ Kind = "Text"; Value = ""; TargetPath = $null })
        foreach ($teamResult in $sortedTeamResults) {
            $row.Add([PSCustomObject]@{ Kind = "Text"; Value = ""; TargetPath = $null })
            $row.Add([PSCustomObject]@{ Kind = "Text"; Value = ""; TargetPath = $null })
        }
    }

    $row.Add([PSCustomObject]@{ Kind = "Text"; Value = ""; TargetPath = $null })
    if ($rowIndex -lt $sortedTeamResults.Count) {
        $rowTeam = $sortedTeamResults[$rowIndex]
        $row.Add([PSCustomObject]@{ Kind = "Text"; Value = $rowTeam.Team; TargetPath = $null })
        foreach ($columnTeam in $sortedTeamResults) {
            if ($rowTeam.Team -eq $columnTeam.Team) {
                $row.Add([PSCustomObject]@{ Kind = "Text"; Value = "N/A"; TargetPath = $null })
                continue
            }

            $wins = 0
            foreach ($solutionName in $solutionNames) {
                if ($rowTeam.Scores.ContainsKey($solutionName) `
                    -and $columnTeam.Scores.ContainsKey($solutionName) `
                    -and $rowTeam.Scores[$solutionName] -gt $columnTeam.Scores[$solutionName]) {
                    $wins++
                }
            }
            $row.Add([PSCustomObject]@{ Kind = "Number"; Value = $wins; TargetPath = $null })
        }
    }
    else {
        $row.Add([PSCustomObject]@{ Kind = "Text"; Value = ""; TargetPath = $null })
        foreach ($teamResult in $sortedTeamResults) {
            $row.Add([PSCustomObject]@{ Kind = "Text"; Value = ""; TargetPath = $null })
        }
    }
    $worksheetRows.Add($row)
}

$totals = [System.Collections.Generic.List[object]]::new()
$totals.Add([PSCustomObject]@{ Kind = "Text"; Value = "TEAM TOTALS"; TargetPath = $null })
foreach ($teamResult in $sortedTeamResults) {
    $totals.Add([PSCustomObject]@{ Kind = "Text"; Value = ""; TargetPath = $null })
    $totals.Add([PSCustomObject]@{
        Kind = "Number"
        Value = if ($teamResult.Scores.Count -gt 0) {
            [math]::Round((($teamResult.Scores.Values | Measure-Object -Sum).Sum), 6)
        }
        else {
            ""
        }
        TargetPath = $null
    })
}
$totals.Add([PSCustomObject]@{ Kind = "Text"; Value = ""; TargetPath = $null })
$totals.Add([PSCustomObject]@{ Kind = "Text"; Value = ""; TargetPath = $null })
foreach ($teamResult in $sortedTeamResults) {
    $totals.Add([PSCustomObject]@{ Kind = "Text"; Value = ""; TargetPath = $null })
}
$worksheetRows.Add($totals)

function ConvertTo-XmlText([string]$Value) {
    if ($null -eq $Value) {
        return ""
    }
    return [System.Security.SecurityElement]::Escape($Value)
}

function Get-ExcelColumnName([int]$ColumnNumber) {
    $name = ""
    while ($ColumnNumber -gt 0) {
        $remainder = ($ColumnNumber - 1) % 26
        $name = [char](65 + $remainder) + $name
        $ColumnNumber = [math]::Floor(($ColumnNumber - 1) / 26)
    }
    return $name
}

$worksheetXml = [System.Text.StringBuilder]::new()
[void]$worksheetXml.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
[void]$worksheetXml.Append('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">')
[void]$worksheetXml.Append('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>')
[void]$worksheetXml.Append('<sheetFormatPr defaultRowHeight="18"/><cols>')
$maxColumn = 0
foreach ($row in $worksheetRows) {
    $maxColumn = [math]::Max($maxColumn, $row.Count)
}
for ($column = 1; $column -le $maxColumn; $column++) {
    $spacerColumn = 2 + 2 * $sortedTeamResults.Count
    $headToHeadLabelColumn = $spacerColumn + 1
    $width = if ($column -eq 1) { 34 }
        elseif ($column -le (1 + 2 * $sortedTeamResults.Count)) { 24 }
        elseif ($column -eq $spacerColumn) { 3 }
        elseif ($column -eq $headToHeadLabelColumn) { 22 }
        else { 16 }
    [void]$worksheetXml.Append("<col min=`"$column`" max=`"$column`" width=`"$width`" customWidth=`"1`"/>")
}
[void]$worksheetXml.Append('</cols><sheetData>')
for ($rowIndex = 0; $rowIndex -lt $worksheetRows.Count; $rowIndex++) {
    $excelRow = $rowIndex + 1
    [void]$worksheetXml.Append("<row r=`"$excelRow`">")
    $row = $worksheetRows[$rowIndex]
    for ($columnIndex = 0; $columnIndex -lt $row.Count; $columnIndex++) {
        $cell = $row[$columnIndex]
        if ($cell.Kind -eq "Text" -and [string]::IsNullOrEmpty([string]$cell.Value)) {
            continue
        }

        $cellReference = "$(Get-ExcelColumnName ($columnIndex + 1))$excelRow"
        if ($cell.Kind -eq "Number") {
            $numberText = [System.Convert]::ToString($cell.Value, [System.Globalization.CultureInfo]::InvariantCulture)
            [void]$worksheetXml.Append("<c r=`"$cellReference`"><v>$numberText</v></c>")
        }
        else {
            $style = ""
            if ($cell.Kind -eq "Link") {
                $style = ' s="1"'
                $relationshipId = "rId$($hyperlinkRelationships.Count + 1)"
                $workbookDirectoryUri = [System.Uri]::new("$outputDirectory$([System.IO.Path]::DirectorySeparatorChar)")
                $targetUri = [System.Uri]::new($cell.TargetPath)
                $relativeTarget = $workbookDirectoryUri.MakeRelativeUri($targetUri).ToString()
                $hyperlinkRelationships.Add([PSCustomObject]@{
                    Id = $relationshipId
                    Cell = $cellReference
                    Target = $relativeTarget
                })
            }
            $escapedValue = ConvertTo-XmlText ([string]$cell.Value)
            [void]$worksheetXml.Append("<c r=`"$cellReference`" t=`"inlineStr`"$style><is><t xml:space=`"preserve`">$escapedValue</t></is></c>")
        }
    }
    [void]$worksheetXml.Append('</row>')
}
[void]$worksheetXml.Append('</sheetData>')
if ($hyperlinkRelationships.Count -gt 0) {
    [void]$worksheetXml.Append('<hyperlinks>')
    foreach ($link in $hyperlinkRelationships) {
        [void]$worksheetXml.Append("<hyperlink ref=`"$($link.Cell)`" r:id=`"$($link.Id)`"/>")
    }
    [void]$worksheetXml.Append('</hyperlinks>')
}
[void]$worksheetXml.Append('</worksheet>')

$contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>'
$packageRelationshipsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'
$workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Scores" sheetId="1" r:id="rId1"/></sheets></workbook>'
$workbookRelationshipsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>'
$stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF0563C1"/><u/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'

Add-Type -AssemblyName System.IO.Compression
$fileStream = [System.IO.File]::Open(
    $OutputExcel,
    [System.IO.FileMode]::Create,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
)
try {
    $archive = [System.IO.Compression.ZipArchive]::new(
        $fileStream,
        [System.IO.Compression.ZipArchiveMode]::Create,
        $false
    )
    try {
        $packageParts = [ordered]@{
            "[Content_Types].xml" = $contentTypesXml
            "_rels/.rels" = $packageRelationshipsXml
            "xl/workbook.xml" = $workbookXml
            "xl/_rels/workbook.xml.rels" = $workbookRelationshipsXml
            "xl/styles.xml" = $stylesXml
            "xl/worksheets/sheet1.xml" = $worksheetXml.ToString()
        }
        if ($hyperlinkRelationships.Count -gt 0) {
            $sheetRelationships = [System.Text.StringBuilder]::new()
            [void]$sheetRelationships.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
            [void]$sheetRelationships.Append('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">')
            foreach ($link in $hyperlinkRelationships) {
                $target = ConvertTo-XmlText $link.Target
                [void]$sheetRelationships.Append("<Relationship Id=`"$($link.Id)`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink`" Target=`"$target`" TargetMode=`"External`"/>")
            }
            [void]$sheetRelationships.Append('</Relationships>')
            $packageParts["xl/worksheets/_rels/sheet1.xml.rels"] = $sheetRelationships.ToString()
        }

        foreach ($part in $packageParts.GetEnumerator()) {
            $entry = $archive.CreateEntry($part.Key, [System.IO.Compression.CompressionLevel]::Optimal)
            $entryStream = $entry.Open()
            try {
                $writer = [System.IO.StreamWriter]::new($entryStream, [System.Text.UTF8Encoding]::new($false))
                try {
                    $writer.Write($part.Value)
                }
                finally {
                    $writer.Dispose()
                }
            }
            finally {
                $entryStream.Dispose()
            }
        }
    }
    finally {
        $archive.Dispose()
    }
}
finally {
    $fileStream.Dispose()
}

Write-Host "Total solutions: $($solutionNames.Count)"
$teamResults |
    Select-Object Team, MatchingSolutions,
        @{ Name = "ScoredSolutions"; Expression = { $_.Scores.Count } },
        @{ Name = "TotalSolutions"; Expression = { $solutionNames.Count } },
        @{ Name = "TotalScore"; Expression = {
            if ($_.Scores.Count -gt 0) {
                [math]::Round((($_.Scores.Values | Measure-Object -Sum).Sum), 6)
            }
            else {
                $null
            }
        } } |
    Format-Table -AutoSize |
    Out-Host
Write-Host "Excel report written to: $OutputExcel"
