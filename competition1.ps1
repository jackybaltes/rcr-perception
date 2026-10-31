$ErrorActionPreference = "Stop"

$repositoryRoot = $PSScriptRoot
$outputDirectory = Join-Path $repositoryRoot "Outputs\competition1"
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

Push-Location $repositoryRoot
try {
    $configurations = @(
        @{ Name = "synth_zero_volumes"; Mode = "synth"; VolumeCount = 0 },
        @{ Name = "synth_three_volumes"; Mode = "synth"; VolumeCount = 3 },
        @{ Name = "real_zero_volumes"; Mode = "real"; VolumeCount = 0 },
        @{ Name = "real_three_volumes"; Mode = "real"; VolumeCount = 3 }
    )

    foreach ($configuration in $configurations) {
        $prefix = Join-Path $outputDirectory "$($configuration.Name)_"
        $arguments = @(
            "ThreeJS/cli.mjs",
            "--seed", "0",
            "--mode", $configuration.Mode,
            "--volumes", "$($configuration.VolumeCount)",
            "--holds", "30",
            "--wall-width", "3",
            "--wall-height", "1.4",
            "--camera-height", "0.7",
            "--camera-distance", "1",
            "--requests", "10",
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
