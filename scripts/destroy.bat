@echo off
REM Convenience wrapper around scripts/destroy.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0destroy.ps1" %*
