@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dynamic-launch.ps1" -Action uninstall
exit /b %errorlevel%
