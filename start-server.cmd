@echo off
rem Starts the signaling server for online rooms (double-click, or run from any terminal).
rem Runs node directly, so PowerShell's script policy (npm.ps1) can't block it.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

rem Node 22.18 or newer runs the server's TypeScript directly.
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)"
if errorlevel 1 (
  echo Your Node.js is too old to run the server. Install Node 22.18 or newer ^(LTS^) from https://nodejs.org.
  node -v
  pause
  exit /b 1
)

if not exist "node_modules\ws" (
  echo Installing packages ^(first run only^)...
  call npm.cmd install
  if errorlevel 1 (
    echo npm install failed; see the messages above.
    pause
    exit /b 1
  )
)

node server/index.ts
pause
