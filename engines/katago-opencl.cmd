@echo off
setlocal
set "D=C:\Users\ILLEGEAR\Documents\Weiqi\katago_upgrade_test\katago-v1.18.1-opencl-windows-x64"
cd /d "%D%"
"%D%\katago.exe" gtp -model "C:\Users\ILLEGEAR\Dropbox\AI_Go\c_katago\katago\weights\b28fd3.bin.gz" -config "C:\Users\ILLEGEAR\Documents\Weiqi\katago_upgrade_test\katago-v1.18.1-opencl-windows-x64\default_gtp.cfg" %*
