@echo off
rem SaqBol: bot runs in a loop and restarts itself if it crashes. Do not start twice.
title SaqBol bot
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
:loop
echo [%date% %time%] SaqBol bot starting
.venv\Scripts\python.exe bot.py >> bot.log 2>&1
echo [%date% %time%] bot stopped, restart in 5 seconds
timeout /t 5 /nobreak >nul
goto loop
