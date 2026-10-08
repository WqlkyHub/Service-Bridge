@echo off
chcp 65001 >nul
title Sonotheque - diagnostic
cd /d "%~dp0"
echo.
echo  Diagnostic de la Sonotheque : les messages de l'application s'affichent ci-dessous.
echo  Si elle ne s'ouvre pas, fais une capture de cette fenetre et envoie-la.
echo.
echo  Node.js :
call node --version
echo.
if not exist "node_modules\electron\dist\electron.exe" (
  echo  Le moteur de l'application n'est pas installe : lance d'abord Lancer-Sonotheque.bat
  pause
  exit /b 1
)
"%~dp0node_modules\electron\dist\electron.exe" "%~dp0." --enable-logging
echo.
echo  L'application s'est fermee. Code de sortie : %errorlevel%
echo  Journal des erreurs : %APPDATA%\Sonothèque\erreurs.log
echo.
pause
