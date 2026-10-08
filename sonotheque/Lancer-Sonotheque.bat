@echo off
chcp 65001 >nul
title Sonotheque
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js n'est pas installe.
  echo  Installe la version LTS depuis https://nodejs.org puis relance ce fichier.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules\electron\dist (
  echo.
  echo  Premier lancement : installation des composants ^(environ 2 minutes, une seule fois^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  L'installation a echoue. Verifie ta connexion internet puis relance ce fichier.
    pause
    exit /b 1
  )
)

start "" /min cmd /c "npm start"
