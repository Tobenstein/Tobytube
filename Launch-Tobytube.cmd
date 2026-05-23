@echo off
cd /d "%~dp0"
"C:\Users\robpe\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\start-service.mjs
if errorlevel 1 pause
