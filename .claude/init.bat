@echo off
echo ==========================================
echo Happy Coder - Development Environment Init
echo ==========================================

echo [1/5] Checking Node.js...
node --version
if %errorlevel% neq 0 (
    echo [Error] Node.js not found
    exit /b 1
)

echo [2/5] Checking Yarn...
yarn --version
if %errorlevel% neq 0 (
    echo [Error] Yarn not found
    exit /b 1
)

echo [3/5] Installing dependencies...
if exist node_modules (
    echo [Skip] node_modules exists
) else (
    yarn install
)

echo [4/5] Building CLI...
cd packages\happy-cli
if exist dist (
    echo [Skip] CLI already built
) else (
    yarn build
)
cd ..\..

echo [5/5] Type checking...
yarn workspace happy typecheck

echo ==========================================
echo Environment initialized!
echo ==========================================
pause
