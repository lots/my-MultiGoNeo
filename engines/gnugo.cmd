@echo off
setlocal
set "D=C:\Users\ILLEGEAR\Dropbox\AI_Go\gnugo"
cd /d "%D%"
"%D%\gnugo.exe" --mode gtp %*
