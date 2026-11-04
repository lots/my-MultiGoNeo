@echo off
setlocal
set "D=C:\Users\ILLEGEAR\Dropbox\AI_Go\Sabaki_mini\leelaz-0.15-w64\lz"
cd /d "%D%"
"%D%\leelaz.exe" -g -w "%D%\weights_elf.txt" %*
