@echo off
chcp 65001 >nul
echo ========================================
echo   건강검진 시스템 서버 중지
echo ========================================
echo.
echo 🛑 서버를 중지합니다...
echo.

REM 포트 3000을 사용하는 프로세스 찾기
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    set PID=%%a
    goto :found
)

:found
if defined PID (
    echo 포트 3000에서 실행 중인 프로세스 발견 (PID: %PID%)
    echo.
    echo 서버를 종료하시겠습니까? (Y/N)
    choice /C YN /M "종료하시겠습니까"
    if %ERRORLEVEL% EQU 1 (
        echo.
        echo 서버를 종료하는 중...
        taskkill /F /PID %PID% >nul 2>&1
        if %ERRORLEVEL% EQU 0 (
            echo ✅ 서버가 성공적으로 중지되었습니다.
        ) else (
            echo ⚠️  서버 중지 중 오류가 발생했습니다.
            echo     관리자 권한으로 다시 실행해보세요.
        )
    ) else (
        echo.
        echo ℹ️  서버 중지를 취소했습니다.
    )
) else (
    echo ℹ️  포트 3000에서 실행 중인 서버가 없습니다.
)

echo.
echo ========================================
pause
