// Android v31.5: packaged interface must use the deployed HTTPS backend.
// A blank URL falls back to file:// in Android WebView and cannot open /ws.
window.XPARTY_CONFIG = { backendUrl: 'https://xp404.onrender.com' };
