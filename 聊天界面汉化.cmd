@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0chat-localize.ps1" -Action apply
exit /b %errorlevel%
