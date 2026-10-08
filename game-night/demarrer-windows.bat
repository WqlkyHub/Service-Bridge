@echo off
chcp 65001 >nul
title La Manette d'Or - serveur de soiree
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js n'est pas installe sur cet ordinateur.
  echo   Installez-le depuis https://nodejs.org ^(version LTS^), puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)

if not exist "soiree.json" (
  copy "soiree-depart.json" "soiree.json" >nul
  echo   Soiree initialisee avec les joueurs et les defis.
)

node server.js
echo.
echo   Le serveur est arrete.
pause
