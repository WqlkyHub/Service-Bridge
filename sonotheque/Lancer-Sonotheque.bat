@echo off
chcp 65001 >nul
title Sonotheque
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto :pasdenode

if exist "node_modules\electron\dist\electron.exe" goto :lancer

echo.
echo  Premier lancement : installation des composants, quelques minutes, une seule fois.
echo.
call npm install --no-audit --no-fund
if errorlevel 1 goto :erreur

echo.
echo  Telechargement du moteur de l'application, environ 120 Mo...
echo.
call node node_modules\electron\install.js
if errorlevel 1 goto :erreur
if not exist "node_modules\electron\dist\electron.exe" goto :erreur

:lancer
echo  Ouverture de la Sonotheque...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0

:pasdenode
echo.
echo  Node.js n'est pas installe.
echo  Installe la version LTS depuis https://nodejs.org puis relance ce fichier.
echo.
start "" https://nodejs.org
pause
exit /b 1

:erreur
echo.
echo  ------------------------------------------------------------
echo  L'installation a echoue. Verifie ta connexion internet, puis
echo  relance ce fichier. Si ca recommence, fais une capture de
echo  cette fenetre et envoie-la.
echo  ------------------------------------------------------------
pause
exit /b 1
