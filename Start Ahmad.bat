@echo off
cd /d "%~dp0"
if not exist data mkdir data
where php >nul 2>nul || (echo PHP was not found. Install PHP or add it to PATH. & pause & exit /b 1)
start "Ostad Ahmad Bot" cmd /k "php bin\poll.php >> data\bot.log 2>&1"
start "Ostad Ahmad Dashboard" cmd /k "php -S 127.0.0.1:8765 -t dashboard"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8765/
