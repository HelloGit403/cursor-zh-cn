param(
  [ValidateSet('preview', 'apply', 'restore', 'status')][string]$Action = 'preview',
  [string]$AppRoot = '',
  [switch]$NoPause
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$exitCode = 0
try {
  $candidates = @()
  if ($AppRoot) { $candidates = @($AppRoot) }
  else {
    $cursorCommand = Get-Command cursor -ErrorAction SilentlyContinue
    if ($cursorCommand) { $candidates += Join-Path (Split-Path $cursorCommand.Source) '..' }
    $candidates += @('D:/cursor/resources/app', "$env:LOCALAPPDATA/Programs/cursor/resources/app", "$env:ProgramFiles/Cursor/resources/app")
    foreach ($process in @(Get-Process Cursor -ErrorAction SilentlyContinue)) {
      if ($process.Path) { $candidates += Join-Path (Split-Path $process.Path) 'resources/app' }
    }
  }
  $resolvedRoot = $null
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $candidate 'product.json')) {
      $resolvedRoot = [IO.Path]::GetFullPath($candidate)
      break
    }
  }
  if (!$resolvedRoot) { throw '未找到 Cursor 安装目录。可用 -AppRoot 参数指定 resources/app 路径。' }
  $runtimePath = [IO.Path]::GetFullPath((Join-Path $resolvedRoot '../../Cursor.exe'))
  if (!(Test-Path -LiteralPath $runtimePath)) { throw "未找到 Cursor 运行环境：$runtimePath" }
  $cliPath = Join-Path $PSScriptRoot 'cursor-zh-cn/src/chat-cli.js'
  if (!(Test-Path -LiteralPath $cliPath)) { throw '工具文件不完整。请先完整解压汉化压缩包，然后运行。' }
  $savedRunAsNode = $env:ELECTRON_RUN_AS_NODE
  try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    & $runtimePath $cliPath $Action $resolvedRoot | Out-Host
    $exitCode = $LASTEXITCODE
  } finally { $env:ELECTRON_RUN_AS_NODE = $savedRunAsNode }
} catch {
  Write-Host ('操作失败：' + $_.Exception.Message) -ForegroundColor Red
  $exitCode = 1
}
if (!$NoPause) { [void](Read-Host '按 Enter 关闭此窗口') }
exit $exitCode
