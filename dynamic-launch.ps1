param([ValidateSet('install','uninstall','status')][string]$Action='install', [switch]$NoPause)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$exitCode = 0
try {
  $candidates = @('D:/cursor/resources/app', "$env:LOCALAPPDATA/Programs/cursor/resources/app", "$env:ProgramFiles/Cursor/resources/app")
  $cursorCommand = Get-Command cursor -ErrorAction SilentlyContinue
  if ($cursorCommand) { $candidates = @((Join-Path (Split-Path $cursorCommand.Source) '..')) + $candidates }
  $appRoot = $candidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'product.json') } | Select-Object -First 1
  if (!$appRoot) { throw '未找到 Cursor 安装目录。' }
  $appRoot = [IO.Path]::GetFullPath($appRoot)
  $runtimePath = [IO.Path]::GetFullPath((Join-Path $appRoot '../../Cursor.exe'))
  $cli = Join-Path $PSScriptRoot 'cursor-zh-cn/src/dynamic-cli.js'
  $savedRunAsNode = $env:ELECTRON_RUN_AS_NODE
  try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    & $runtimePath $cli $Action $appRoot | Out-Host
    $exitCode = $LASTEXITCODE
  } finally { $env:ELECTRON_RUN_AS_NODE = $savedRunAsNode }
} catch { Write-Host ('操作失败：' + $_.Exception.Message) -ForegroundColor Red; $exitCode = 1 }
if (!$NoPause) { [void](Read-Host '按 Enter 关闭窗口') }
exit $exitCode
