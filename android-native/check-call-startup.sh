#!/usr/bin/env bash
set -eu
app=com.pkx404.xpartynative.micfix2
adb install android-native/app/build/outputs/apk/release/app-universal-release.apk
adb shell pm grant "$app" android.permission.RECORD_AUDIO
adb shell pm grant "$app" android.permission.CAMERA
for mode in mic camera; do
  adb shell am force-stop "$app"
  adb logcat -c
  adb shell am start -W -n "$app/com.pkx404.xpartynative.MainActivity" --ez xparty_native_mic_selftest true --es media "$mode"
  passed=false
  for attempt in $(seq 1 30); do
    if adb logcat -d -s XPartyMicProbe:I | grep -F "ALIVE after $mode startup: true"; then
      passed=true
      break
    fi
    sleep 1
  done
  if ! "$passed"; then
    adb logcat -d -s XPartyMicProbe:V XPartyCallV2:V rtc:E jni_zero:V chromium:E AndroidRuntime:E libc:F DEBUG:F
    exit 1
  fi
  adb shell pidof "$app"
done
