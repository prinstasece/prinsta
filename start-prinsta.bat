@echo off
title Prinsta Startup
echo ================================
echo   Starting Prinsta App...
echo ================================

echo [1/2] Starting MongoDB...
start "MongoDB" cmd /k ""C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" --dbpath "C:\data\db""

echo Waiting for MongoDB to start...
timeout /t 3 /nobreak > nul

echo [2/2] Starting Backend Server...
start "Prinsta Backend" cmd /k "cd /d C:\prinsta-2-main\backend && npm start"

echo ================================
echo   Done! Opening browser...
echo ================================
timeout /t 4 /nobreak > nul
start http://localhost:3000

exit
