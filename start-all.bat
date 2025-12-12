@echo off
chcp 65001 >nul
echo ========================================
echo   건강검진 시스템 전체 시작
echo   (개발 서버 + 공개 URL 터널)
echo ========================================
echo.
echo 🚀 개발 서버와 터널을 시작합니다...
echo.
echo 📌 서버 정보:
echo    - 로컬 서버: http://localhost:3000
echo    - 공개 URL: https://nwfreepilot.loca.lt
echo.
echo 📌 서버 중지 방법:
echo    - 각 창에서 Ctrl + C 키를 누르세요
echo    - 또는 stop-all.bat 파일을 실행하세요
echo.
echo ========================================
echo.

echo 🔹 개발 서버를 새 창에서 시작합니다...
start "건강검진 시스템 - 개발 서버" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul

echo 🔹 공개 URL 터널을 새 창에서 시작합니다...
start "건강검진 시스템 - 공개 URL 터널" cmd /k "npm run tunnel"

echo.
echo ✅ 모든 서버가 시작되었습니다!
echo.
echo 📊 잠시 후 브라우저에서 접속하세요:
echo    http://localhost:3000
echo.
pause
