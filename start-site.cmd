@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0"
set "ACMER_NODE="
for %%N in (node.exe) do set "ACMER_NODE=%%~$PATH:N"
if not defined ACMER_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "ACMER_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined ACMER_NODE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "ACMER_NODE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined ACMER_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "ACMER_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined ACMER_NODE (
 echo Node.js was not found. Install Node.js LTS, then reopen the terminal.
 goto failed
)
for %%N in ("%ACMER_NODE%") do set "PATH=%%~dpN;%PATH%"
echo Node runtime: %ACMER_NODE%
"%ACMER_NODE%" --version
if not exist ".env" (
 echo Missing .env. Configure the local database connection first.
 goto failed
)
if not exist "node_modules\vite\bin\vite.js" (
 echo Missing dependencies. Run npm install with a standard Node.js installation first.
 goto failed
)
if "%~1"=="--check" (
 echo Startup prerequisites found.
 popd
 exit /b 0
)
echo Building the website...
"%ACMER_NODE%" node_modules\vite\bin\vite.js build
if errorlevel 1 goto failed
echo Keep this window open. Visit http://127.0.0.1:3000/
echo Press Ctrl+C to stop the website.
"%ACMER_NODE%" --env-file=.env src\backend\server.js
if errorlevel 1 goto failed
popd
exit /b 0
:failed
echo Startup failed. If port 3000 is already in use, check whether the site is already running.
pause
popd
exit /b 1
