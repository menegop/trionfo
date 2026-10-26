@echo off
setlocal
cd /d "%~dp0"
set PORT=8000
set LANIP=
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /R /C:"IPv4.*:"') do (
  if not defined LANIP set "LANIP=%%A"
)
set "LANIP=%LANIP: =%"
echo.
echo Trionfo Ferrarese
echo ------------------
echo Questo PC : http://localhost:%PORT%
if defined LANIP echo Rete locale: http://%LANIP%:%PORT%
echo.
echo Server in ascolto su 0.0.0.0:%PORT%
echo Premi Ctrl+C per fermarlo.
echo.
start "" "http://localhost:%PORT%"
python -m http.server %PORT% --bind 0.0.0.0
pause
