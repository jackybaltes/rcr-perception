$ErrorActionPreference = "Stop"

$repositoryRoot = $PSScriptRoot
$outputDirectory = Join-Path $repositoryRoot "Outputs\samples"
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

Push-Location $repositoryRoot
try {
    $configurations = @(
        @{ Name = "zero_volumes"; VolumeCount = 0 },
        @{ Name = "three_volumes"; VolumeCount = 3 }
    )

    foreach ($configuration in $configurations) {
        $prefix = Join-Path $outputDirectory "$($configuration.Name)_"
        $arguments = @(
            "ThreeJS/cli.mjs",
            "--seed", "0",
            "--volumes", "$($configuration.VolumeCount)",
            "--holds", "30",
            "--wall-width", "3",
            "--wall-height", "1.4",
            "--camera-height", "0.7",
            "--camera-distance", "1",
            "--requests", "50",
            "--prefix", $prefix
        )

        & node @arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Scene generation failed for $($configuration.Name) (exit code $LASTEXITCODE)."
        }
    }
}
finally {
    Pop-Location
}
