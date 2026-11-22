@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is unavailable. Please open README.md.
  pause
  exit /b 1
)
node scripts\desktop.mjs open
if errorlevel 1 pause
