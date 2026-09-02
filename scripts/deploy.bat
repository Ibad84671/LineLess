@echo off
REM Convenience wrapper around scripts/deploy.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
