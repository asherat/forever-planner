@echo off
cd /d "%~dp0"
echo Updating Forever Planner...
git pull
echo.
echo Done. Reload the planner tab in Chrome.
pause