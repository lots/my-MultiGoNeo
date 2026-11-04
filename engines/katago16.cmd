@echo off
setlocal
set "D=C:\Users\ILLEGEAR\Dropbox\AI_Go\c_katago\katago\katago_opencl"
cd /d "%D%"
"%D%\katago.exe" gtp -model "C:\Users\ILLEGEAR\Dropbox\AI_Go\c_katago\katago\weights\b28fd3.bin.gz" -config "C:\Users\ILLEGEAR\Dropbox\AI_Go\c_katago\katago\katago_configs\default_gtp.cfg" %*
