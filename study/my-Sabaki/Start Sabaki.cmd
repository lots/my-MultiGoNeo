@echo off
rem  Double-click launcher for a development build of Sabaki.
rem
rem  Why the flags below:
rem   * --user-data-dir : Sabaki writes settings.json while merely LOADING
rem     src/setting.js, so an unwritable %APPDATA%\Sabaki aborts startup with
rem     "EPERM ... settings.json" and no window. Keeping app data inside the
rem     repo sidesteps that entirely.
rem   * --no-sandbox    : on this machine Chromium's own sandbox fails during
rem     init and the process dies with 0xC0000003 (STATUS_BREAKPOINT) before any
rem     JavaScript runs. Try plain first, fall back automatically.
rem
rem  Everything is logged to startup-log.txt, and the window stays open.
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "EXE=node_modules\electron\dist\electron.exe"
set "DATA=%~dp0dev-data"
set "LOG=%~dp0startup-log.txt"
break > "%LOG%"
echo Sabaki launcher - %DATE% %TIME% >> "%LOG%"
echo cwd: %CD% >> "%LOG%"

if not exist "%EXE%" (
  echo [error] Electron is not installed. >> "%LOG%"
  echo Electron is not installed. Run these first:
  echo     npm ci --ignore-scripts
  echo     node node_modules\electron\install.js
  goto :report
)

if not exist "bundle.js" (
  echo [bundle] building bundle.js ... >> "%LOG%"
  echo Building bundle.js, please wait ...
  call npm run bundle >> "%LOG%" 2>&1
)

if not exist "%DATA%" mkdir "%DATA%" >nul 2>&1

echo Launching Sabaki ...
echo   app data: %DATA%
echo   log     : %LOG%
echo.
echo A window should appear. If a dialog appears instead, read it, then close it.
echo Close the Sabaki window to come back here.
echo.

echo [run 1] electron . ^(sandboxed^) >> "%LOG%"
"%EXE%" . "--user-data-dir=%DATA%" >> "%LOG%" 2>&1
set "RC=!errorlevel!"
echo [run 1] exit=!RC! >> "%LOG%"

if not "!RC!"=="0" (
  echo Run 1 failed "^(exit !RC!^)" - retrying with --no-sandbox ...
  echo.
  echo [run 2] electron . --no-sandbox >> "%LOG%"
  "%EXE%" . --no-sandbox "--user-data-dir=%DATA%" >> "%LOG%" 2>&1
  set "RC=!errorlevel!"
  echo [run 2] exit=!RC! >> "%LOG%"
)

:report
echo.
echo ================= startup-log.txt =================
type "%LOG%"
echo ==================================================
echo.
echo Log saved to: %LOG%
pause
