@echo off
REM -- Ahmad Bot Deploy for Windows --
REM Usage:
REM   deploy.bat              full deploy zip
REM   deploy.bat --src-only   source + dist
REM   deploy.bat --dist-only  just dist + dashboard (fastest)
setlocal enabledelayedexpansion

set MODE=%~1
if "%MODE%"=="" set MODE=full

echo.
echo === Ahmad Bot Deploy ===
echo Mode: %MODE%
echo.

REM -- 1. Build --
echo [1/3] Building TypeScript...
call npm run build
if errorlevel 1 (
  echo BUILD FAILED. Fix errors and try again.
  pause
  exit /b 1
)
echo OK - Build complete
echo.

REM -- 2. Clean stale files --
if exist "dist\useCases\nameCheckIn.js" (
  echo [2/3] Removing stale nameCheckIn.js...
  del /q "dist\useCases\nameCheckIn.js"
  echo OK - Stale files cleaned
) else (
  echo [2/3] No stale files found
)

REM -- 3. Create zip --
for /f %%i in ('powershell -command "Get-Date -Format yyyyMMdd-HHmmss"') do set TS=%%i
set ZIP_NAME=ahmad-deploy-%TS%.zip

echo [3/3] Packaging...

if "%MODE%"=="--dist-only" (
  powershell -Command "Compress-Archive -Path dist,dashboard,package.json -DestinationPath '%ZIP_NAME%' -Force"
) else (
  powershell -Command "Compress-Archive -Path src,dist,dashboard,package.json,tsconfig.json,.env.example -DestinationPath '%ZIP_NAME%' -Force"
)

if exist "%ZIP_NAME%" (
  echo OK - Created %ZIP_NAME%
) else (
  echo FAILED - Could not create zip
  pause
  exit /b 1
)

echo.
echo === Upload Instructions ===
echo 1. Go to https://botkeep.cloud - your bot - File Manager
echo 2. Delete these old files ^(if they exist^):
echo      src\useCases\nameCheckIn.ts
echo      dist\useCases\nameCheckIn.js
echo 3. Upload + extract %ZIP_NAME% to the project root
echo 4. Restart the server in Botkeep
echo.
echo Done! File: %ZIP_NAME%
pause
