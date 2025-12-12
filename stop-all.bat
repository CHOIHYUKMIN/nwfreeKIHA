@echo off
chcp 65001 >nul
echo ========================================
echo   건강검진 시스템 전체 중지
echo   (개발 서버 + 공개 URL 터널)
echo ========================================
echo.
echo 🛑 모든 서버를 중지합니다...
echo.

set /a COUNT=0

REM 포트 3000을 사용하는 프로세스 찾기
echo [1] 포트 3000 (개발 서버) 확인 중...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    set PID3000=%%a
    set /a COUNT+=1
    echo    ✓ 발견 (PID: %%a)
)

REM Node.js 프로세스 (터널 등) 찾기
echo [2] Node.js 프로세스 (터널 등) 확인 중...
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /NH 2^>nul') do (
    set NODEPROC=%%a
    set /a COUNT+=1
    echo    ✓ 발견 (PID: %%a)
)

echo.

if %COUNT% GTR 0 (
    echo 총 %COUNT%개의 프로세스를 발견했습니다.
    echo.
    echo 모든 프로세스를 종료하시겠습니까? (Y/N)
    choice /C YN /M "종료하시겠습니까"
    if %ERRORLEVEL% EQU 1 (
        echo.
        echo 🔹 모든 Node.js 프로세스를 종료하는 중...
        taskkill /F /IM node.exe >nul 2>&1
        if %ERRORLEVEL% EQU 0 (
            echo ✅ 모든 서버가 성공적으로 중지되었습니다.
        ) else (
            echo ⚠️  서버 중지 중 오류가 발생했습니다.
            echo     관리자 권한으로 다시 실행해보세요.
        )
    ) else (
        echo.
        echo ℹ️  서버 중지를 취소했습니다.
    )
) else (
    echo ℹ️  실행 중인 서버가 없습니다.
)

echo.
echo ========================================
pause
