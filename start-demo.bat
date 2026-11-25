@echo off
title VeriSphere Fast Demo Launcher
echo =======================================================
echo          VeriSphere Fast Production Demo Launcher
echo =======================================================
echo.

echo [SETUP] Killing any processes on ports 3000 and 4000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 :4000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo [SETUP] Ports cleared.
echo.

if not exist "apps\web\.next\BUILD_ID" (
    echo [BUILD] Building optimized production frontend for instant tab switching...
    call pnpm --filter web build
    if errorlevel 1 (
        echo [ERROR] Frontend build failed.
        pause
        exit /b 1
    )
) else (
    echo [BUILD] Pre-built production frontend found (instant tab switches enabled!).
)
echo.

echo [1/2] Starting Backend API Server (Port 4000)...
start "VeriSphere API" cmd /k "pnpm --filter api dev"

echo [2/2] Starting Frontend Next.js Server in Production Mode (Port 3000)...
start "VeriSphere Web" cmd /k "pnpm --filter web start"

echo.
echo -------------------------------------------------------
echo  Both servers are starting in separate windows!
echo  Production mode eliminates dev compilation lag (<50ms tab switches).
echo -------------------------------------------------------
echo.
echo  Frontend:  http://localhost:3000
echo  Backend:   http://localhost:4000/health
echo =======================================================
pause
