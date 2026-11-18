@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js가 필요합니다. https://nodejs.org 에서 LTS 버전을 설치해주세요.
  echo 설치 후 이 창을 닫고 start-windows.cmd를 다시 실행해주세요.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo dist 폴더를 찾지 못했습니다. 압축 파일 전체를 먼저 해제해주세요.
  pause
  exit /b 1
)
node scripts\serve-built.mjs --open
pause
