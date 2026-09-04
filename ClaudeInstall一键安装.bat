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
:install_node
set "TMP_DIR=%TEMP%\ClaudeInstall"
if not exist "%TMP_DIR%" mkdir "%TMP_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$dir=Join-Path $env:TEMP 'ClaudeInstall';" ^
  "if(-not (Test-Path $dir)){New-Item -ItemType Directory -Path $dir | Out-Null};" ^
  "$dest=Join-Path $dir 'node.msi';" ^
  "$sources=@('https://registry.npmmirror.com/-/binary/node/latest-v22.x/','https://nodejs.org/dist/latest-v22.x/');" ^
  "$file=$null;" ^
  "foreach($src in $sources){" ^
  "  try{" ^
  "    Write-Host ('  [download] check version: '+$src);" ^
  "    $html=(Invoke-WebRequest -Uri $src -UseBasicParsing -TimeoutSec 30).Content;" ^
  "    $m=[regex]::Matches($html,'node-v(\d+\.\d+\.\d+)-x64\.msi');" ^
  "    if($m.Count -eq 0){continue};" ^
  "    $best=($m | ForEach-Object { $_.Groups[1].Value } | Sort-Object { [version]$_ } -Descending)[0];" ^
  "    $file='node-v'+$best+'-x64.msi';" ^
  "    Write-Host ('  [download] '+$file);" ^
  "    Invoke-WebRequest -Uri ($src+$file) -OutFile $dest -UseBasicParsing -TimeoutSec 600;" ^
  "    Write-Host '  [download] done';" ^
  "    break;" ^
  "  } catch { Write-Host ('  [download] source failed: '+$_.Exception.Message); }" ^
  "}" ^
  "if(-not $file -or -not (Test-Path $dest)){ Write-Host 'ERROR: cannot download Node'; exit 1 };" ^
  "Write-Host '  An authorization window will pop up - click Yes to install Node.js';" ^
  "Start-Process msiexec -ArgumentList ('/i \"'+$dest+'\" /qn /norestart') -Verb RunAs -Wait;" ^
  "$nodeExe=Join-Path $env:ProgramFiles 'nodejs\node.exe';" ^
  "if(Test-Path $nodeExe){ Write-Host '  Node.js installed'; exit 0 } else { Write-Host 'ERROR: node.exe not found after install'; exit 1 }"
exit /b %errorlevel%
