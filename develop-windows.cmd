@echo off
chcp 65001 >nul
cd /d "%~dp0"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js와 npm이 필요합니다. Node.js LTS 설치 후 터미널을 다시 열어주세요.
  pause
  exit /b 1
)
if not exist "node_modules\.package-lock.json" (
  call npm.cmd ci
  if errorlevel 1 goto failed
)
call npm.cmd run assets
if errorlevel 1 goto failed
call npm.cmd run dev -- --host 127.0.0.1 --port 5173 --open
exit /b 0
:failed
 echo 준비 중 오류가 발생했습니다. 위 오류 내용을 확인해주세요.
 pause
 exit /b 1
