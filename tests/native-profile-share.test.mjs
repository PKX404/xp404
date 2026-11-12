import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('native profile uses local recorded activity, user-entered keywords and liked media',()=>{
 const app=read('android-native/app/src/main/java/com/pkx404/xpartynative/MainActivity.java');
 const store=read('android-native/app/src/main/java/com/pkx404/xpartynative/NativeProfileStore.java');
 const page=read('android-native/app/src/main/java/com/pkx404/xpartynative/NativeProfilePage.java');
 assert.match(app,/new NativeProfileStore\(getPreferences\(MODE_PRIVATE\)\)/);
 assert.match(app,/profilePage\.show\(screen,nickname\)/);
 assert.match(app,/profileStore\.recordOpened\(source\)/);
 assert.match(app,/profileStore\.setLiked\(source,liked\)/);
 assert.match(app,/captureProfileWatchTime\(\)/);
 assert.match(page,/Recently opened/);
 assert.match(page,/Liked videos/);
 assert.match(page,/Top sources/);
 assert.match(page,/Interests & keywords/);
 assert.match(page,/Private local activity/);
 assert.match(page,/Clear history/);
 assert.match(store,/private static final String WATCH/);
 assert.match(store,/getPreferences|SharedPreferences/);
 assert.match(store,/if\(key\.equals\(lastRecorded\)\)return/);
 assert.doesNotMatch(app,/You can watch as a guest\./);
});
test('room Share is a visible native action with OS chooser and working room code',()=>{
 const app=read('android-native/app/src/main/java/com/pkx404/xpartynative/MainActivity.java');
 assert.match(app,/shareIcon=xpIcon\("share",this::shareRoom\)/);
 assert.match(app,/shareIcon\.setContentDescription\("Share room invite"\)/);
 assert.match(app,/roomHeader\.addView\(shareIcon/);
 assert.match(app,/Intent\.ACTION_SEND/);
 assert.match(app,/Room code: /);
 assert.match(app,/Intent\.createChooser/);
 assert.match(app,/pendingProfileSource/);
});
test('sideload install safety and existing chat/SoundCloud features remain present',()=>{
 const manifest=read('android-native/app/src/main/AndroidManifest.xml');
 const app=read('android-native/app/src/main/java/com/pkx404/xpartynative/MainActivity.java');
 assert.doesNotMatch(manifest,/BIND_NOTIFICATION_LISTENER_SERVICE|NotificationListenerService|READ_SMS/);
 assert.match(app,/updateChatReactions/);
 assert.match(app,/ProviderLink\.embedded\(sourceType\)/);
});
