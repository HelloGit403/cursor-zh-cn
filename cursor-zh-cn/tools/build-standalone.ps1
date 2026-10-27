$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspace = [IO.Path]::GetFullPath((Join-Path $project '..'))
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$stage = Join-Path $tempRoot ('cursor-zh-package-' + [Guid]::NewGuid().ToString('N'))
$package = Join-Path $workspace 'Cursor聊天界面汉化-1.1.0.zip'
try {
  $core = Join-Path $stage 'cursor-zh-cn'
  New-Item -ItemType Directory -Path $core -Force | Out-Null
  foreach ($name in @('src', 'dictionary')) { Copy-Item -LiteralPath (Join-Path $project $name) -Destination $core -Recurse }
  foreach ($name in @('package.json', 'README.md', 'LICENSE')) { Copy-Item -LiteralPath (Join-Path $project $name) -Destination $core }
  $acorn = Join-Path $core 'node_modules/acorn'
  New-Item -ItemType Directory -Path (Join-Path $acorn 'dist') -Force | Out-Null
  foreach ($name in @('package.json', 'LICENSE', 'dist/acorn.js')) {
    Copy-Item -LiteralPath (Join-Path $project "node_modules/acorn/$name") -Destination (Join-Path $acorn $name)
  }
  foreach ($name in @('chat-localize.ps1', '聊天界面汉化.cmd', '还原聊天界面.cmd', '预览聊天界面汉化.cmd', '使用步骤.md')) {
    Copy-Item -LiteralPath (Join-Path $workspace $name) -Destination $stage
  }
  if (Test-Path -LiteralPath $package) { Remove-Item -LiteralPath $package }
  [IO.Compression.ZipFile]::CreateFromDirectory($stage, $package)
  Write-Host "Created: $package"
} finally {
  $resolved = [IO.Path]::GetFullPath($stage)
  if ($resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($resolved).StartsWith('cursor-zh-package-') -and
      (Test-Path -LiteralPath $resolved)) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
