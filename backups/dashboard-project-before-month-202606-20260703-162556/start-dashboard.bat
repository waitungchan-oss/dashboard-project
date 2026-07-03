@echo off
setlocal
cd /d "%~dp0"

if exist "%SystemRoot%\py.exe" (
    "%SystemRoot%\py.exe" -3 "%~dp0serve.py"
    goto :end
)

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 "%~dp0serve.py"
    goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
    python "%~dp0serve.py"
    goto :end
)

where python3 >nul 2>nul
if %errorlevel%==0 (
    python3 "%~dp0serve.py"
    goto :end
)

echo.
echo Python 3 was not found.
echo Please install Python 3, then run this file again.
echo.
pause

:end
endlocal
