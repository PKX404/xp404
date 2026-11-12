import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('native SoundCloud selector and official widget adapter are fully connected',()=>{
  const link=read('android-native/app/src/main/java/com/pkx404/xpartynative/ProviderLink.java');
  const picker=read('android-native/app/src/main/java/com/pkx404/xpartynative/NativeSourceSheet.java');
  const player=read('android-native/app/src/main/assets/providers/provider-room.html');
  const adapter=read('public/xparty/providers.js');
  const app=read('android-native/app/src/main/java/com/pkx404/xpartynative/MainActivity.java');
  assert.match(link,/case "soundcloud": return "SoundCloud";/);
  assert.match(link,/id="https:\/\/soundcloud\.com\/"\+user\+"\/"\+track;/);
  assert.match(link,/"soundcloud"\.equals\(type\)/);
  assert.match(picker,/case 6:showService\("soundcloud"\)/);
  assert.match(picker,/Paste a public SoundCloud track URL/);
  assert.match(player,/createSoundCloudPlayer/);
  assert.match(player,/type==='soundcloud'\?createSoundCloudPlayer/);
  assert.match(adapter,/https:\/\/w\.soundcloud\.com\/player\/api\.js/);
  assert.match(adapter,/seekTo',time\*1000/);
  assert.match(app,/ProviderLink\.embedded\(sourceType\)/);
  assert.match(app,/window\.xpartySync/);
});

test('native chat reactions are separate clickable chips and message layout groups avatars',()=>{
  const app=read('android-native/app/src/main/java/com/pkx404/xpartynative/MainActivity.java');
  assert.match(app,/updateChatReactions\(LinearLayout stack/);
  assert.match(app,/setOnClickListener\(v->\{[\s\S]*?"message-reaction"/);
  assert.match(app,/sequence%2==1/);
  assert.match(app,/bubble=text\("",14,WHITE,false\)/);
  assert.doesNotMatch(app,/label\.append\(first\?"\\n":"  "\)/);
});

test('sideload-sensitive notification listener remains removed',()=>{
  const manifest=read('android-native/app/src/main/AndroidManifest.xml');
  assert.doesNotMatch(manifest,/BIND_NOTIFICATION_LISTENER_SERVICE|NotificationListenerService/);
});
