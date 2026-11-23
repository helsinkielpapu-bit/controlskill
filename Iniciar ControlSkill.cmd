@echo off
rem Abre ControlSkill en local con doble clic: API (puerto 4100) y web (puerto 5173), cada una en su ventana.
rem Para apagarlo, cierra esas dos ventanas. Todo corre solo en este PC (127.0.0.1).
cd /d "%~dp0"
title ControlSkill

where npm >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js ^(npm^). Cierra esta ventana, abre una nueva o reinicia el PC e intentalo de nuevo.
  pause
  exit /b 1
)

netstat -ano | findstr /r /c:"127.0.0.1:4100 .*LISTENING" >nul
if errorlevel 1 (
  start "ControlSkill - API (no cerrar)" /min cmd /k npm run dev -w @controlskill/api
) else (
  echo La API ya estaba encendida.
)

netstat -ano | findstr /r /c:"127.0.0.1:5173 .*LISTENING" >nul
if errorlevel 1 (
  start "ControlSkill - Web (no cerrar)" /min cmd /k npm run dev -w @controlskill/web
) else (
  echo La web ya estaba encendida.
)

echo Abriendo ControlSkill en el navegador...
timeout /t 6 /nobreak >nul
start "" http://127.0.0.1:5173
exit /b 0
