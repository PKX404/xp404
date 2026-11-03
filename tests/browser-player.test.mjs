import test from 'node:test';
import assert from 'node:assert/strict';
import {safeBrowserURL} from '../public/xparty/browser-player.js';
import {parseProviderLink} from '../public/xparty/providers.js';

globalThis.location = {hostname:'xp404.onrender.com'};

test('browser accepts secure public websites only', () => {
  assert.equal(safeBrowserURL('example.org/watch'), 'https://example.org/watch');
  assert.equal(safeBrowserURL('https://archive.org/details/sample'), 'https://archive.org/details/sample');
  assert.equal(safeBrowserURL('https://example.com:443/movie'), 'https://example.com/movie');
});
test('browser rejects local targets, dangerous protocols and credentials', () => {
  for (const url of [
    '', 'http://example.org', 'javascript:alert(1)', 'data:text/html,hello',
    'file:///etc/passwd', 'https://127.0.0.1/', 'https://[::1]/',
    'https://localhost/', 'https://localhost./', 'https://foo.local/',
    'https://private.internal/', 'https://bad.test/', 'https://user:pass@example.org/',
    'https://example.org:8443/', 'https://xp404.onrender.com/room',
    'https://example.org/'+'x'.repeat(2050),
  ]) assert.equal(safeBrowserURL(url), null, url);
});
test('shared room links stay restricted to existing supported media providers', () => {
  assert.equal(parseProviderLink(safeBrowserURL('https://example.org/watch')), null);
  assert.equal(parseProviderLink(safeBrowserURL('https://example.org/video.mp4')).type, 'direct');
  assert.equal(parseProviderLink(safeBrowserURL('https://example.org/live.m3u8')).type, 'iptv');
  assert.equal(parseProviderLink(safeBrowserURL('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).type, 'youtube');
});
