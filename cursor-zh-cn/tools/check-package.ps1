param([string]$Package = (Join-Path $PSScriptRoot '../../cursor-zh-cn-1.1.0.vsix'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$checkDir = Join-Path $tempRoot ('cursor-zh-vsix-' + [Guid]::NewGuid().ToString('N'))
try {
  [IO.Compression.ZipFile]::ExtractToDirectory([IO.Path]::GetFullPath($Package), $checkDir)
  node (Join-Path $PSScriptRoot 'smoke.js') (Join-Path $checkDir 'extension')
  if ($LASTEXITCODE -ne 0) { throw 'VSIX smoke test failed' }
} finally {
  $resolved = [IO.Path]::GetFullPath($checkDir)
  if ($resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($resolved).StartsWith('cursor-zh-vsix-') -and
      (Test-Path -LiteralPath $resolved)) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
