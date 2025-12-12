@echo off
REM 빠른 서버 강제 종료 (확인 없이 즉시 종료)
chcp 65001 >nul
echo 🛑 서버를 강제 종료합니다...
taskkill /F /IM node.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ 서버가 종료되었습니다.
) else (
    echo ℹ️  실행 중인 서버가 없습니다.
)
timeout /t 2 /nobreak >nul
