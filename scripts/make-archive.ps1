$ErrorActionPreference = 'Stop'
$source = 'c:\Users\slixx\Documents\katinabasil\Katina-tickets'
$destination = 'c:\Users\slixx\Documents\katinabasil\katina-tickets-backup.zip'
$staging = Join-Path $env:TEMP 'katina-tickets-staging'

if (Test-Path $staging) {
  Remove-Item $staging -Recurse -Force
}
New-Item -ItemType Directory -Path $staging -Force | Out-Null

function Copy-FilteredItem {
  param([string]$Path, [string]$TargetRoot)

  $name = Split-Path $Path -Leaf
  if ($name -in @('node_modules', '.git', '.next', 'dist', 'build', 'coverage')) {
    return
  }

  if ($name -eq '.env' -or $name -like '.env.*' -or $name -like '*.env') {
    if ($name -ne '.env.example') {
      return
    }
  }

  if (Test-Path $Path -PathType Container) {
    $target = Join-Path $TargetRoot $name
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Get-ChildItem $Path -Force | ForEach-Object {
      Copy-FilteredItem -Path $_.FullName -TargetRoot $target
    }
    return
  }

  Copy-Item -Path $Path -Destination (Join-Path $TargetRoot $name) -Force
}

Get-ChildItem $source -Force | ForEach-Object {
  Copy-FilteredItem -Path $_.FullName -TargetRoot $staging
}

if (Test-Path $destination) {
  Remove-Item $destination -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $destination)

Remove-Item $staging -Recurse -Force

Get-Item $destination | Select-Object FullName, Length
