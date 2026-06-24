@echo off
title TapForge local server
echo Starting TapForge at http://localhost:8000  (close this window to stop)
start "" http://localhost:8000
python -m http.server 8000 2>nul
if errorlevel 1 py -m http.server 8000 2>nul
if errorlevel 1 npx --yes serve -l 8000
pause
