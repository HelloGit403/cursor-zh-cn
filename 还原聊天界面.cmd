@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0chat-localize.ps1" -Action restore
exit /b %errorlevel%
