$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspace = [IO.Path]::GetFullPath((Join-Path $project '..'))
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$stage = Join-Path $tempRoot ('cursor-dynamic-package-' + [Guid]::NewGuid().ToString('N'))
$archive = Join-Path $workspace 'Cursor动态翻译-2.0.1.zip'
try {
  $core = Join-Path $stage 'cursor-zh-cn'
  New-Item -ItemType Directory -Path $core -Force | Out-Null
  foreach ($name in @('src', 'dictionary')) { Copy-Item -LiteralPath (Join-Path $project $name) -Destination $core -Recurse }
  foreach ($name in @('package.json', 'LICENSE', 'README.md')) { Copy-Item -LiteralPath (Join-Path $project $name) -Destination $core }
  $dependency = Join-Path $core 'node_modules/acorn'
  New-Item -ItemType Directory -Path (Join-Path $dependency 'dist') -Force | Out-Null
  foreach ($name in @('package.json', 'LICENSE', 'dist/acorn.js')) {
    Copy-Item -LiteralPath (Join-Path $project "node_modules/acorn/$name") -Destination (Join-Path $dependency $name)
  }
  $engine = Join-Path $stage 'dynamic-engine'
  New-Item -ItemType Directory -Path (Join-Path $engine 'models') -Force | Out-Null
  foreach ($name in @('server.py', 'download_model.py', 'MODEL-LICENSE.md')) {
    Copy-Item -LiteralPath (Join-Path $workspace "dynamic-engine/$name") -Destination $engine
  }
  Copy-Item -LiteralPath (Join-Path $workspace 'dynamic-engine/models/translate-en_zh-1_9.argosmodel') -Destination (Join-Path $engine 'models')
  foreach ($name in @('dynamic-launch.ps1','启用动态翻译.cmd','卸载动态翻译.cmd','查看动态翻译状态.cmd','准备本机翻译引擎.ps1','动态翻译使用说明.md')) {
    Copy-Item -LiteralPath (Join-Path $workspace $name) -Destination $stage
  }
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
  [IO.Compression.ZipFile]::CreateFromDirectory($stage, $archive)
  Write-Host "Created: $archive"
} finally {
  $resolved = [IO.Path]::GetFullPath($stage)
  if ($resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($resolved).StartsWith('cursor-dynamic-package-') -and
      (Test-Path -LiteralPath $resolved)) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
