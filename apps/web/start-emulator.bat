@echo off
cd /d "%~dp0"
echo Spoustim Android emulator...
echo.
node scripts/start-android-emulator.js
echo.
echo (Emulator bezi na pozadi. Okno emulatoru se muze otevrit za chvili.)
pause
