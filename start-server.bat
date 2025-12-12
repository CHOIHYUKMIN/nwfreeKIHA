@echo off
chcp 65001 >nul
echo ========================================
echo   건강검진 시스템 서버 시작
echo ========================================
echo.
echo 🚀 서버를 시작합니다...
echo.
echo 📌 서버 중지 방법:
echo    - Ctrl + C 키를 누르세요
echo    - 또는 stop-server.bat 파일을 실행하세요
echo.
echo ========================================
echo.

npm run dev
