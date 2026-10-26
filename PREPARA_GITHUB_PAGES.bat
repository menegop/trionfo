@echo off
setlocal
cd /d "%~dp0"
echo =========================================================
echo TRIONFO FERRARESE - preparazione GitHub Pages + Android
 echo =========================================================
echo Scarica i file ONNX WebAssembly per usarli anche offline.
echo Per copiare anche un ONNX: trascinalo su questo BAT.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0PREPARA_GITHUB_PAGES.ps1" -ModelPath "%~1"
if errorlevel 1 (
 echo.
 echo ERRORE durante la preparazione. Leggi il messaggio sopra.
 pause
 exit /b 1
)
echo.
echo Preparazione terminata. Leggi README_PUBBLICAZIONE.md
pause
