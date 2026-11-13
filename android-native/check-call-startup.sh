#!/usr/bin/env bash
set -euo pipefail
app=com.pkx404.xpartynative.playbackqa055
apk=android-native/app/build/outputs/apk/release/app-universal-release.apk
adb install "$apk"
adb install -r "$apk"
adb shell pm grant "$app" android.permission.RECORD_AUDIO
adb shell pm grant "$app" android.permission.CAMERA
test_apk=$(find android-native/app/build/outputs/apk/androidTest -name '*.apk' | head -1)
adb install -r "$test_apk"
runner=$(adb shell pm list instrumentation | tr -d '\r' | sed -n 's/^instrumentation:\([^ ]*RoomUiCheck\).*/\1/p' | head -1)
test -n "$runner"
for mode in mic camera bridge room; do
  adb shell am force-stop "$app"
  adb shell am instrument -w -e media "$mode" "$runner" | tee /tmp/xp-probe
  if [[ $mode == room ]]; then grep -F 'PASS provider routes and chat' /tmp/xp-probe; else grep -F "PASS $mode activation" /tmp/xp-probe; fi
done
adb shell am force-stop "$app"
adb shell am start -W -n "$app/com.pkx404.xpartynative.MainActivity"
adb shell dumpsys meminfo "$app" | grep -E 'TOTAL PSS|TOTAL RSS|TOTAL ' | head
