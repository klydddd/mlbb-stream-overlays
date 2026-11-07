@echo off
setlocal EnableExtensions
title MLBB Stats Reader
rem ------------------------------------------------------------------
rem  Double-click this file to run the in-game stats reader
rem  (backend\ingame_stats_bot.py) on Windows. The first run installs
rem  everything it needs into backend\.stats-venv (takes a few minutes).
rem ------------------------------------------------------------------

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "VENV=%BACKEND%\.stats-venv"
set "VPY=%VENV%\Scripts\python.exe"
rem Bump this when the package list below changes, so old installs update themselves.
set "SETUP_VERSION=1"
set "PACKAGES=opencv-python numpy mss pygetwindow pywin32 websocket-client fastapi uvicorn[standard]"
set "PYTHONUTF8=1"

if not exist "%BACKEND%\ingame_stats_bot.py" (
    echo.
    echo  This file must stay in the main project folder, next to the "backend" folder.
    echo  Move it back there and try again.
    goto :fail
)

rem ================= one-time setup =================
set "NEED_SETUP="
if not exist "%VPY%" set "NEED_SETUP=1"
if not exist "%VENV%\setup-%SETUP_VERSION%.txt" set "NEED_SETUP=1"
if not defined NEED_SETUP goto :menu

echo.
echo  First-time setup: installing what the stats reader needs.
echo  This takes a few minutes and needs internet. Please wait...
echo.

call :find_python
if not defined PY goto :no_python

if not exist "%VPY%" (
    %PY% -m venv "%VENV%"
    if errorlevel 1 goto :setup_failed
)
"%VPY%" -m pip install --upgrade pip --disable-pip-version-check -q
"%VPY%" -m pip install --disable-pip-version-check %PACKAGES%
if errorlevel 1 goto :setup_failed
echo done> "%VENV%\setup-%SETUP_VERSION%.txt"
echo.
echo  Setup finished.

rem ================= menu =================
:menu
cls
echo.
echo  =========================================
echo     MLBB STATS READER
echo  =========================================
echo.
if exist "%VENV%\calibrated.txt" (
    echo   Boxes are set up on this PC.
) else (
    echo   FIRST TIME? Choose 1 first to mark where the numbers are.
)
echo.
echo   1  Set up the boxes  - first time, or if the stream layout changed
echo   2  Start reading stats
echo   3  Start reading stats with a preview window - to check it works
echo   4  Quit
echo.
set "CHOICE="
set /p "CHOICE=  Type a number and press Enter: "
if "%CHOICE%"=="1" goto :calibrate
if "%CHOICE%"=="2" goto :run
if "%CHOICE%"=="3" goto :run_debug
if "%CHOICE%"=="4" exit /b 0
goto :menu

:calibrate
cls
echo.
echo  SET UP THE BOXES
echo  ----------------
echo  1. Make sure the MLBB spectator view is open with a match on screen.
echo  2. Pick that window from the list below by typing its number.
echo  3. A picture opens. Drag a box around the whole top stats bar, press Enter.
echo  4. Then for each number it names, drag a box around just the digits, press Enter.
echo     No such number on screen? Just press Enter to skip it.
echo  5. At the end a preview shows the numbers in white. Press any key to close it.
echo.
pushd "%BACKEND%"
"%VPY%" ingame_stats_bot.py calibrate
set "RESULT=%ERRORLEVEL%"
popd
if "%RESULT%"=="0" (
    echo done> "%VENV%\calibrated.txt"
    echo.
    echo  Boxes saved. Now choose 2 to start reading stats.
) else (
    echo.
    echo  Setup did not finish. Read the message above, then try again.
)
echo.
pause
goto :menu

:run_debug
set "EXTRA=--debug"
goto :run_common

:run
set "EXTRA="

:run_common
if not exist "%VENV%\calibrated.txt" (
    echo.
    echo  The boxes are not set up on this PC yet. Choose 1 first.
    echo.
    pause
    goto :menu
)
cls
call :ensure_server
echo.
echo  Open the controller in your browser and copy its address from the top bar.
echo  It looks like: http://localhost:8080/controller.html?room=abc123
echo  Paste it below - right-click pastes in this window - then press Enter.
echo.
echo  To STOP reading later: close this window.
echo.
pushd "%BACKEND%"
"%VPY%" ingame_stats_bot.py run %EXTRA%
popd
echo.
echo  The stats reader stopped.
pause
goto :menu

rem ================= helpers =================

:ensure_server
rem The overlays talk through the local server on port 8080. Start it if it is not running.
rem (Skipped when WS_URL points the reader at a server somewhere else.)
if defined WS_URL exit /b 0
call :server_up
if not errorlevel 1 (
    echo  Overlay server is running.
    exit /b 0
)
echo  Starting the overlay server in a new window. Leave that window open.
start "MLBB overlay server - keep this window open" /D "%BACKEND%\server" "%VPY%" -m uvicorn server:app --port 8080 --host 0.0.0.0
for /l %%i in (1,1,15) do (
    timeout /t 1 /nobreak >nul
    call :server_up
    if not errorlevel 1 (
        echo  Overlay server is running.
        exit /b 0
    )
)
echo  The overlay server did not start. Check its window for an error message.
exit /b 1

:server_up
"%VPY%" -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/health', timeout=2)" >nul 2>&1
exit /b %ERRORLEVEL%

:find_python
rem Prefer the "py" launcher (comes with python.org and winget installs), then "python".
rem The "python" that only opens the Microsoft Store fails the test below, so it is skipped.
set "PY="
py -3.12 -c "import sys" >nul 2>&1 && set "PY=py -3.12" && exit /b 0
py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>&1 && set "PY=py -3" && exit /b 0
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>&1 && set "PY=python" && exit /b 0
exit /b 1

:no_python
echo  Python is not installed on this computer, and the stats reader needs it.
echo.
where winget >nul 2>&1
if errorlevel 1 goto :no_python_manual
set "ANSWER="
set /p "ANSWER=  Install Python now? Type Y and press Enter: "
if /i not "%ANSWER%"=="Y" goto :no_python_manual
winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
echo.
echo  When the install has finished, CLOSE this window and double-click
echo  Start-Stats-Reader.bat again to continue the setup.
goto :fail

:no_python_manual
echo  Install Python 3.12 from https://www.python.org/downloads/
echo  During install, TICK the box "Add python.exe to PATH".
echo  Then double-click Start-Stats-Reader.bat again.
goto :fail

:setup_failed
echo.
echo  Setup failed. Check your internet connection and try again.
echo  If it keeps failing, send a photo of this window to whoever set up the stream.
goto :fail

:fail
echo.
pause
exit /b 1
