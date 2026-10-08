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
if exist "node_modules\electron\checksums.json" goto :moteur
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto :erreur

:moteur
call :installer_moteur
if errorlevel 1 goto :erreur
if not exist "node_modules\electron\dist\electron.exe" goto :erreur

:lancer
echo  Ouverture de la Sonotheque...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0

rem ---------------------------------------------------------------------------
rem Telecharge le moteur Electron avec les outils de Windows (curl, puis PowerShell),
rem verifie son empreinte officielle, puis l'installe dans node_modules\electron\dist.

:installer_moteur
set "EVER="
for /f "usebackq delims=" %%v in (`node -p "require('./node_modules/electron/package.json').version"`) do set "EVER=%%v"
if "%EVER%"=="" exit /b 1
set "EARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "EARCH=arm64"
set "ENAME=electron-v%EVER%-win32-%EARCH%.zip"
set "EZIP=%TEMP%\%ENAME%"
set "EURL=https://github.com/electron/electron/releases/download/v%EVER%/%ENAME%"

echo.
echo  Telechargement du moteur de l'application, version %EVER%, environ 120 Mo...
echo.
curl.exe -L --fail --retry 3 --progress-bar -o "%EZIP%" "%EURL%"
if not errorlevel 1 goto :verifier
echo.
echo  Nouvel essai avec PowerShell, patience...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%EURL%' -OutFile '%EZIP%'"
if errorlevel 1 exit /b 1

:verifier
node "%~dp0outils\verifier-moteur.cjs" "%EZIP%" "%ENAME%"
if errorlevel 1 exit /b 1

echo  Installation du moteur...
if exist "node_modules\electron\dist" rmdir /s /q "node_modules\electron\dist"
mkdir "node_modules\electron\dist"
tar -xf "%EZIP%" -C "node_modules\electron\dist"
if not errorlevel 1 goto :chemin
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force -LiteralPath '%EZIP%' -DestinationPath 'node_modules\electron\dist'"
if errorlevel 1 exit /b 1

:chemin
rem path.txt doit contenir exactement "electron.exe", sans retour a la ligne.
<nul set /p ="electron.exe" > "node_modules\electron\path.txt"
del "%EZIP%" >nul 2>nul
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
echo  L'installation a echoue. Fais une capture de cette fenetre
echo  et envoie-la : le message ci-dessus dit ce qui bloque.
echo  ------------------------------------------------------------
pause
exit /b 1
