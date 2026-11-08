# XParty Remote — Bluetooth HID preview

This is a separate Android phone app for controlling the **existing XParty tablet app** using Android's Bluetooth HID Device API (introduced in Android 9 / API 28).

The phone impersonates a standard Bluetooth keyboard and mouse. **No receiver APK, root, Internet, or backend changes are required.** The tablet must be able to pair with a Bluetooth keyboard/mouse. Some OEM phones do not support the HID Device profile: if registration fails, this app cannot control the tablet over Bluetooth.

## First use
1. Install XParty Remote on the Android **phone** (Android 9+); leave the existing XParty app on your **tablet** unchanged.
2. Turn on Bluetooth and accept Nearby Devices permissions.
3. Tap **Activate remote**, then **Make phone discoverable**.
4. Open your **tablet Bluetooth settings** and pair with your phone, if it is offered as an input device.
5. Back on your phone, tap **Refresh paired tablets**, then choose the tablet.
6. Open XParty on the tablet. Move its pointer using the touchpad; tap the search field; type the channel name and tap **Send text** or **Enter**. Select a channel with the touchpad.

Remote keys work at the tablet's operating-system level, so direct one-tap next/previous Live TV channel selection **is not guaranteed** until the main XParty app adds dedicated keyboard shortcuts. Playback/media keys also depend on the tablet player's support for system media keys.

## Supported commands
- Cursor move, left click, right click
- Directional keys, Enter, Escape/Back, Tab, Space, F
- Type basic English letters, numbers and punctuation into the focused tablet field
- Play/pause, next/previous track, speaker volume and mute (consumer HID)

No personal data or keystrokes are transmitted over the Internet. Bluetooth HID is used solely for paired tablet communication. Registration ends when this app is backgrounded or closed; keep it foreground.

## Build
Use JDK 17, Android SDK 35 and Gradle 8.10.2:
`cd bluetooth-remote && gradle --no-daemon :app:assembleDebug`

Generated APK: `bluetooth-remote/app/build/outputs/apk/debug/app-debug.apk`.

Debug APK is test-signed, not a production release. It has not been physically tested with the user's devices.
