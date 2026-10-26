@echo off
setlocal
cd /d "%~dp0"
set "PROJECT=%~1"
if "%PROJECT%"=="" set "PROJECT=%~dp0.."
set "CHECKPOINT=%~2"
if "%CHECKPOINT%"=="" set "CHECKPOINT=current"
if /I "%CHECKPOINT%"=="best" goto valid_checkpoint
if /I "%CHECKPOINT%"=="current" goto valid_checkpoint
echo ERRORE: secondo parametro deve essere current o best.
pause
exit /b 1
:valid_checkpoint
if not exist "%PROJECT%\.venv\Scripts\python.exe" (
 echo.
 echo Cartella progetto Python non trovata: %PROJECT%
 echo Esempio: ESPORTA_V14_PER_PAGES.bat "C:\Users\tuo_utente\PycharmProjects\trionfo" current
 pause
 exit /b 1
)
if not exist "%PROJECT%\checkpoints_v14_epsilon_v3\%CHECKPOINT%.pt" (
 echo Checkpoint mancante: %PROJECT%\checkpoints_v14_epsilon_v3\%CHECKPOINT%.pt
 pause
 exit /b 1
)
echo Esporto il checkpoint %CHECKPOINT% nella cartella models di GitHub Pages...
cd /d "%PROJECT%"
"%PROJECT%\.venv\Scripts\python.exe" "%~dp0tools\export_v14_onnx.py" --checkpoint "%PROJECT%\checkpoints_v14_epsilon_v3\%CHECKPOINT%.pt" --out "%~dp0models\trionfo_v14.onnx"
if errorlevel 1 (
 echo ERRORE durante esportazione V14.
 pause
 exit /b 1
)
echo OK. Ora esegui PREPARA_GITHUB_PAGES.bat.
pause
