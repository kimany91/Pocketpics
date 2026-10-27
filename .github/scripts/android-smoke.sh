#!/usr/bin/env bash
# Lance l'APK dans l'émulateur, ouvre les écrans un par un (liens pocketpics://…)
# et relève les plantages : captures d'écran et journal (logcat) dans smoke/.
set -u
APP=com.pocketpics.app
mkdir -p smoke
adb install -r app.apk
adb logcat -c
adb shell monkey -p "$APP" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 30
adb exec-out screencap -p > smoke/00-accueil.png
alive() { [ -n "$(adb shell pidof "$APP" | tr -d '\r')" ]; }
alive && echo "LANCEMENT: ok" || echo "LANCEMENT: PLANTÉ"
for route in solo multi quests friends ranks emotes rates avatar "(tabs)/collection" "(tabs)/profile"; do
  alive || { adb shell monkey -p "$APP" -c android.intent.category.LAUNCHER 1 >/dev/null; sleep 20; }
  adb shell am start -W -a android.intent.action.VIEW -d "pocketpics://${route#\(tabs\)/}" "$APP" >/dev/null
  sleep 15
  name=$(echo "$route" | tr -c 'a-z0-9\n' '_')
  adb exec-out screencap -p > "smoke/$name.png"
  if alive; then echo "ÉCRAN $route: ok"; else echo "ÉCRAN $route: PLANTÉ"; fi
done
adb logcat -d > smoke/logcat.txt
echo "===== erreurs du journal ====="
grep -n -E "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS.*(Error|error|Exception)|JavascriptException|libc .*Fatal signal|SIGSEGV|SIGABRT|Abort message|backtrace:|#0[0-9] pc" smoke/logcat.txt | head -150
echo "===== contexte des plantages ====="
grep -n -A 40 "FATAL EXCEPTION" smoke/logcat.txt | head -200
grep -n -A 30 "Fatal signal" smoke/logcat.txt | head -120
exit 0
