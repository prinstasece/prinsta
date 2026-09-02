@echo off
title Printsta Local Print Agent
echo Starting Printsta Local Print Agent...
cd /d "%~dp0"
if not exist node_modules (
    echo [System] First-time setup: installing dependencies...
    call npm install --silent
)
node agent.js
pause
