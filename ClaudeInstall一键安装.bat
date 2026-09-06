@echo off
chcp 65001 >nul
title ClaudeInstall Installer v0.2
echo.
echo  ============================================
echo    ClaudeInstall Installer v0.2
echo    Auto install Node + Git + Claude Code + DeepSeek
echo    Runs 100%% locally, uploads nothing
echo  ============================================
echo.

rem ---- lock cwd to script dir (admin run resets cwd to System32) ----
cd /d "%~dp0"

rem ---- silent mode: called by exe wizard with --silent or env CI_SILENT=1 ----
rem     silent = no pause, no UAC re-elevation (Inno already admin)
rem     install.js ignores unknown --silent arg, no side effect
set "SILENT="
if defined CI_SILENT set "SILENT=1"
echo %* | findstr /i /c:"--silent" >nul && set "SILENT=1"

rem ---- request admin rights (npm -g needs write to system dir) ----
net session >nul 2>&1
if errorlevel 1 (
  if defined SILENT (
    echo  [X] Admin right required. Right-click this file and "Run as administrator".
    exit /b 1
  )
  echo.
  echo  [!] Admin right is needed to install Claude Code.
  echo      Requesting authorization - click "Yes" in the popup window...
  rem  re-launch elevated, pass all args through
  if "%~1"=="" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  ) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
  )
  if errorlevel 1 echo  [X] Not authorized. Right-click this file and "Run as administrator".
  echo.
  if not defined SILENT pause
  exit /b
)
echo  [OK] Admin right ready

rem ---- detect Node.js (PATH or full path) ----
set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if defined NODE_EXE goto :node_found
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if defined NODE_EXE goto :node_found
echo  [!] Node.js not found, downloading and installing (about 30MB)...
call :install_node
if errorlevel 1 goto :node_install_failed
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
goto :node_found
:node_install_failed
echo.
echo  [X] Node.js auto-install failed. Install manually then re-run:
echo      China mirror: https://npmmirror.com/mirrors/node/
echo      Official:     https://nodejs.org
echo.
if not defined SILENT pause
exit /b 1
:node_found
echo  [OK] Node.js ready

rem ---- Node version floor check (Claude Code needs 18+) ----
rem     old Node installed -> upgrade it too, else claude runs broken
rem     PowerShell reads major version; errorlevel 1 = needs upgrade
rem     NOTE: in cmd, ^ is escape char, so no regex anchors via -Command;
rem     use TrimStart/Split instead
"%NODE_EXE%" --version > "%TEMP%\ci_node_ver.txt" 2>&1
set /p NODE_VER=<"%TEMP%\ci_node_ver.txt"
del "%TEMP%\ci_node_ver.txt" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$v='%NODE_VER%'.TrimStart('v'); if($v){ $major=[int]$v.Split('.')[0]; if($major -lt 18){ exit 1 } else { exit 0 } } else { exit 1 }" >nul 2>&1
if not errorlevel 1 goto :node_ver_ok
echo  [!] Node.js %NODE_VER% is too old (need 18+), auto-upgrading...
call :install_node
if not errorlevel 1 goto :node_upgraded
echo.
echo  [X] Node.js upgrade failed. Get latest LTS from https://nodejs.org then re-run.
echo.
if not defined SILENT pause
exit /b 1
:node_upgraded
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
echo  [OK] Node.js upgraded
:node_ver_ok

echo.
echo  ---- Core install: Git / Claude Code / config ----
echo.

rem ---- if Node was just installed, its dir is not on PATH of this window ----
rem     prepend it so install.js can find npm/node
if "%NODE_EXE%"=="node" goto :node_path_done
if not exist "%NODE_EXE%" goto :node_path_done
for %%E in ("%NODE_EXE%") do set "NODE_DIR=%%~dpE"
echo %PATH% | findstr /i /c:"%NODE_DIR%" >nul || set "PATH=%NODE_DIR%;%PATH%"
:node_path_done

"%NODE_EXE%" "%~dp0scripts\install.js" %*
echo.
if defined SILENT exit /b %errorlevel%
echo  Done. Press any key to close.
pause >nul
exit /b 0

rem ================= subroutine: auto-install Node.js =================
rem     v0.2.1: fixed version (npmmirror + nodejs.org both HEAD 200),
rem     download via system curl.exe with live progress bar (PS fallback if no curl),
rem     install with msiexec /qb (shows progress window instead of black screen)
:install_node
set "TMP_DIR=%TEMP%\ClaudeInstall"
if not exist "%TMP_DIR%" mkdir "%TMP_DIR%"
set "DEST=%TMP_DIR%\node.msi"
set "NODE_URL1=https://registry.npmmirror.com/-/binary/node/v22.20.0/node-v22.20.0-x64.msi"
set "NODE_URL2=https://nodejs.org/dist/v22.20.0/node-v22.20.0-x64.msi"
rem  clear any half-downloaded file from a previous interrupted run
if exist "%DEST%" del "%DEST%" 2>nul
where curl >nul 2>nul
if errorlevel 1 goto :node_dl_powershell
echo  [1/3] Downloading Node.js v22.20.0 (about 30MB)...
echo  Progress bar below - wait for it to finish (mirror source):
curl.exe -fL --connect-timeout 20 --retry 3 --retry-delay 2 -o "%DEST%" "%NODE_URL1%"
if not errorlevel 1 goto :node_downloaded
echo  [1/3] Mirror failed, trying official nodejs.org...
curl.exe -fL --connect-timeout 20 --retry 3 --retry-delay 2 -o "%DEST%" "%NODE_URL2%"
if not errorlevel 1 goto :node_downloaded
echo.
echo  [X] Node.js download failed from both sources.
echo      Install manually: China mirror https://npmmirror.com/mirrors/node/
echo      Official: https://nodejs.org  then re-run this installer.
exit /b 1

:node_dl_powershell
echo  [1/3] curl not found, downloading Node.js via PowerShell...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $d=Join-Path $env:TEMP 'ClaudeInstall'; if(-not (Test-Path $d)){New-Item -ItemType Directory -Path $d | Out-Null}; try { Invoke-WebRequest -Uri 'https://registry.npmmirror.com/-/binary/node/v22.20.0/node-v22.20.0-x64.msi' -OutFile (Join-Path $d 'node.msi') -UseBasicParsing -TimeoutSec 600 } catch { Write-Host ('  mirror failed: '+$_.Exception.Message); exit 1 }"
if errorlevel 1 exit /b 1

:node_downloaded
if not exist "%DEST%" goto :node_dl_missing
echo  [2/3] Verifying Node.js installer signature...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=Get-AuthenticodeSignature -LiteralPath '%DEST%'; if($s.Status -eq 'Valid'){exit 0}else{Write-Host ('  signature status: '+$s.Status); exit 1}"
if errorlevel 1 goto :node_sign_bad
echo  [2/3] Signature OK. Installing - a small progress window may appear:
msiexec /i "%DEST%" /qb /norestart /l*v "%TMP_DIR%\node_install.log"
if errorlevel 1 goto :node_install_failed_sub
if exist "%ProgramFiles%\nodejs\node.exe" goto :node_ok
echo  [X] node.exe not found after install.
exit /b 1

:node_sign_bad
echo.
echo  [X] Node.js installer signature is NOT valid.
echo      The downloaded file may have been tampered with.
echo      Install manually: https://nodejs.org  or  https://npmmirror.com/mirrors/node/
exit /b 1

:node_ok
echo  [3/3] Node.js v22.20.0 installed.
exit /b 0

:node_dl_missing
echo  [X] Downloaded file is missing. Install Node.js manually then re-run.
exit /b 1

:node_install_failed_sub
echo  [X] Node.js install did not complete. Install manually: https://npmmirror.com/mirrors/node/
exit /b 1
