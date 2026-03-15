@echo off
setlocal
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"

if not exist "%NODE_EXE%" (
  echo Node.js tidak ditemukan di "%NODE_EXE%".
  echo Install Node.js LTS terlebih dahulu: https://nodejs.org/
  exit /b 1
)

"%NODE_EXE%" "%~dp0node_modules\electron\cli.js" .
