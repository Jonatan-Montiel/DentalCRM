#!/bin/bash
# Prueba la app en un emulador y guarda capturas y errores (rama apk-log) para diagnosticar.
set -x
OUT=/tmp/out; mkdir -p $OUT
adb install -r dentalcrm.apk > $OUT/install.txt 2>&1
adb logcat -c
adb shell am start -W -n mx.dentalcrm.app/.MainActivity > $OUT/start.txt 2>&1
sleep 15
adb exec-out screencap -p > $OUT/1-login.png
# PIN de administrador del modo demo
adb shell uiautomator dump /sdcard/u.xml >/dev/null 2>&1; adb pull /sdcard/u.xml $OUT/u.xml >/dev/null 2>&1
b=$(grep -o 'password="true"[^>]*bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' $OUT/u.xml | head -1 | grep -o '\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]' | tr -d '[]' | tr ',' ' ')
set -- $b; [ -n "$1" ] && adb shell input tap $(( ($1+$3)/2 )) $(( ($2+$4)/2 ))
sleep 1; adb shell input text 1234; adb shell input keyevent 66
sleep 6
adb exec-out screencap -p > $OUT/2-inicio.png
adb shell input keyevent 4; sleep 2
adb shell pidof mx.dentalcrm.app > $OUT/pid.txt 2>&1 || echo "NO CORRE" > $OUT/pid.txt
adb logcat -d > $OUT/logcat-todo.txt
grep -E "AndroidRuntime|FATAL|DentalCRM|DCUpd|chromium|Console" $OUT/logcat-todo.txt | grep -v WindowManager | head -200 > $OUT/errores.txt
exit 0
