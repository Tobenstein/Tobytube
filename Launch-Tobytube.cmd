@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo.
  echo TobyTube needs Node.js before it can start.
  echo Double-click Migrate-Tobytube-To-Windows.cmd first.
  echo.
  pause
  exit /b 1
)

node.exe scripts\start-service.mjs
if errorlevel 1 (
  echo.
  echo TobyTube could not start. Please leave this window open and report the message above.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:8092/"
endlocal
