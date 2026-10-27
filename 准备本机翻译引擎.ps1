param([string]$PythonPath='')
$ErrorActionPreference = 'Stop'
$engineRoot = Join-Path $PSScriptRoot 'dynamic-engine'
$venv = Join-Path $engineRoot '.venv'
if (!$PythonPath) {
  $uvRoot = Join-Path $env:APPDATA 'uv/python'
  if (Test-Path -LiteralPath $uvRoot) {
    $candidate = Get-ChildItem -LiteralPath $uvRoot -Directory | Where-Object Name -Like 'cpython-3.11*' | Select-Object -First 1
    if ($candidate) { $PythonPath = Join-Path $candidate.FullName 'python.exe' }
  }
}
if (!$PythonPath) { throw '请通过 -PythonPath 指定 Python 3.10 到 3.13 的 python.exe 路径。' }
if (!(Test-Path -LiteralPath (Join-Path $venv 'Scripts/python.exe'))) {
  & $PythonPath -m venv $venv
  if ($LASTEXITCODE -ne 0) { throw '创建 Python 环境失败。' }
}
$python = Join-Path $venv 'Scripts/python.exe'
& $python -m pip install ctranslate2==4.8.3 sentencepiece==0.2.2
if ($LASTEXITCODE -ne 0) { throw '安装翻译依赖失败。' }
& $python (Join-Path $engineRoot 'download_model.py')
if ($LASTEXITCODE -ne 0) { throw '准备翻译模型失败。' }
Write-Host '本机翻译引擎已准备好，可以运行“启用动态翻译.cmd”。'
