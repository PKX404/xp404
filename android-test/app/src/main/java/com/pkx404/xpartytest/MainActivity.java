package com.pkx404.xpartytest;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.text.InputType;
import org.json.JSONObject;
import android.widget.FrameLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Arrays;

/**
 * APK test harness for the Xparty Render site.
 * WebView fallback video != the existing production Android native decoder.
 */
public final class MainActivity extends Activity {
    private static final String HOME = "https://xp404.onrender.com/";
    private static final String HOST = "xp404.onrender.com";
    private static final int MEDIA_PERMISSIONS = 2001;
    private static final int NOTIFY_PERMISSION = 2002;
    private static final int SELECT_FILE = 2003;
    private static final String CHANNEL = "xparty-test";
    private WebView web;
    private FrameLayout root;
    private FrameLayout browserContainer;
    private WebView browser;
    private EditText browserAddress;
    private View browserFullscreen;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private TextView splash;
    private PermissionRequest pendingMedia;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private boolean allowed(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && HOST.equalsIgnoreCase(uri.getHost());
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(9,9,18));
        getWindow().setNavigationBarColor(Color.rgb(9,9,18));
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(8,9,17));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = web.getSettings();
        settings.setUserAgentString(settings.getUserAgentString()+" XpartyBrowser/1");
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (request.isForMainFrame() && "xpartybrowser".equalsIgnoreCase(url.getScheme())
                        && "open".equalsIgnoreCase(url.getHost()) && allowed(Uri.parse(view.getUrl()))) {
                    String destination = url.getQueryParameter("url");
                    if (destination != null && publicWebsite(Uri.parse(destination))) showBrowser(destination);
                    return true;
                }
                if (allowed(url)) return false;
                try {
                    Intent open = new Intent(Intent.ACTION_VIEW, request.getUrl());
                    startActivity(open);
                } catch (Exception ignored) {}
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (allowed(Uri.parse(url))) splash.setVisibility(View.GONE);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermission(request));
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.setType("*/*");
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.putExtra(Intent.EXTRA_MIME_TYPES,
                            new String[]{"image/*","video/*","audio/*","application/octet-stream"});
                    startActivityForResult(intent, SELECT_FILE);
                    return true;
                } catch (Exception error) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        splash = new TextView(this);
        splash.setBackgroundColor(Color.BLACK);
        splash.setText("xparty");
        splash.setTextColor(Color.WHITE);
        splash.setTextSize(42);
        splash.setTypeface(null, android.graphics.Typeface.BOLD);
        splash.setGravity(Gravity.CENTER);
        root.addView(splash, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        web.loadUrl(HOME);
        handler.postDelayed(() -> { if (splash != null) splash.setVisibility(View.GONE); }, 16000);
        requestNotificationPermission();
    }

    private void handleWebPermission(PermissionRequest request) {
        if (!allowed(request.getOrigin())) { request.deny(); return; }
        ArrayList<String> needs = new ArrayList<>();
        boolean mediaRequested = false;
        for (String type : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(type)) {
                mediaRequested = true;
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                    needs.add(Manifest.permission.RECORD_AUDIO);
            } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(type)) {
                mediaRequested = true;
                if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                    needs.add(Manifest.permission.CAMERA);
            } else { request.deny(); return; }
        }
        if (!mediaRequested) { request.deny(); return; }
        if (needs.isEmpty()) { request.grant(request.getResources()); return; }
        if (pendingMedia != null) pendingMedia.deny();
        pendingMedia = request;
        requestPermissions(needs.toArray(new String[0]), MEDIA_PERMISSIONS);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFY_PERMISSION);
        } else showReturnNotification();
    }

    private void showReturnNotification() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(
            new NotificationChannel(CHANNEL, "Xparty Test", NotificationManager.IMPORTANCE_LOW));
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent intent = PendingIntent.getActivity(this, 1, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification note = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Xparty Test")
            .setContentText("Tap to return to your room")
            .setContentIntent(intent)
            .setOngoing(false)
            .setAutoCancel(true)
            .build();
        manager.notify(31, note);
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == MEDIA_PERMISSIONS && pendingMedia != null) {
            PermissionRequest current = pendingMedia;
            pendingMedia = null;
            boolean granted = results.length == permissions.length;
            for (int result : results) granted &= result == PackageManager.PERMISSION_GRANTED;
            if (granted && allowed(current.getOrigin())) current.grant(current.getResources());
            else current.deny();
        }
        if (request == NOTIFY_PERMISSION) showReturnNotification();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == SELECT_FILE && fileCallback != null) {
            Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
            fileCallback.onReceiveValue(uri != null ? new Uri[]{uri} : null);
            fileCallback = null;
        }
    }


    // Only public HTTPS destinations can be opened in the separate browser.
    // Never expose an addJavascriptInterface bridge to an arbitrary website.
    private boolean publicWebsite(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())
                || uri.getUserInfo() != null) return false;
        String host = uri.getHost();
        if (host == null || host.length() > 253) return false;
        host = host.toLowerCase(java.util.Locale.ROOT).replaceAll("\\.$", "");
        if (!host.contains(".") || host.matches("[0-9.]+")
                || host.contains(":") || host.endsWith(".local")
                || host.endsWith(".internal") || host.endsWith(".test")
                || host.endsWith(".invalid") || host.endsWith(".onion")
                || host.equals("localhost") || uri.getPort() > 0 && uri.getPort() != 443)
            return false;
        return uri.toString().length() <= 2048;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private Button browserButton(String title, Runnable click) {
        Button button = new Button(this);
        button.setText(title);
        button.setTextColor(Color.WHITE);
        button.setTextSize(12);
        button.setAllCaps(false);
        button.setOnClickListener(v -> click.run());
        return button;
    }

    private void browseToAddress() {
        if (browserAddress == null) return;
        String value = browserAddress.getText().toString().trim();
        if (!value.contains("://")) value = "https://" + value;
        Uri uri = Uri.parse(value);
        if (publicWebsite(uri)) browser.loadUrl(uri.toString());
        else browserAddress.setError("Use a public HTTPS address");
    }

    // Native, Chromium-based browsing is independent from the existing room
    // WebView; it does not reload the room or pretend website playback is synced.
    private void createBrowser() {
        if (browserContainer != null) return;
        browserContainer = new FrameLayout(this);
        browserContainer.setBackgroundColor(Color.rgb(8,9,16));
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setBackgroundColor(Color.rgb(12,15,24));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.addView(browserButton("‹", () -> { if(browser.canGoBack())browser.goBack(); }),
                new LinearLayout.LayoutParams(dp(39), dp(49)));
        toolbar.addView(browserButton("›", () -> { if(browser.canGoForward())browser.goForward(); }),
                new LinearLayout.LayoutParams(dp(39), dp(49)));
        toolbar.addView(browserButton("↻", () -> browser.reload()),
                new LinearLayout.LayoutParams(dp(39), dp(49)));
        browserAddress = new EditText(this);
        browserAddress.setSingleLine(true);
        browserAddress.setSelectAllOnFocus(true);
        browserAddress.setTextSize(13);
        browserAddress.setTextColor(Color.WHITE);
        browserAddress.setHintTextColor(0xffb4bed2);
        browserAddress.setHint("https://");
        browserAddress.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        browserAddress.setOnEditorActionListener((v, actionId, event) -> {
            browseToAddress();browserAddress.clearFocus();return true;
        });
        toolbar.addView(browserAddress,new LinearLayout.LayoutParams(0, dp(49), 1));
        toolbar.addView(browserButton("Go", this::browseToAddress),
                new LinearLayout.LayoutParams(dp(47),dp(49)));
        column.addView(toolbar,new LinearLayout.LayoutParams(-1,dp(49)));

        LinearLayout actions = new LinearLayout(this);
        actions.addView(browserButton("Play in room", () -> {
            String url = browser.getUrl();
            if (url != null && publicWebsite(Uri.parse(url))) {
                web.evaluateJavascript("window.dispatchEvent(new CustomEvent('xparty:browser-share',{detail:{url:"
                    + JSONObject.quote(url) + "}}))",null);
                closeBrowser();
            }
        }),new LinearLayout.LayoutParams(0,dp(42),1));
        actions.addView(browserButton("Back to XParty", this::closeBrowser),
                new LinearLayout.LayoutParams(0,dp(42),1));
        column.addView(actions,new LinearLayout.LayoutParams(-1,dp(42)));

        browser = new WebView(this);
        browser.setBackgroundColor(Color.BLACK);
        browser.getSettings().setJavaScriptEnabled(true);
        browser.getSettings().setDomStorageEnabled(true);
        browser.getSettings().setMediaPlaybackRequiresUserGesture(false);
        browser.getSettings().setAllowFileAccess(false);
        browser.getSettings().setAllowContentAccess(false);
        browser.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        browser.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return request.isForMainFrame() && !publicWebsite(request.getUrl());
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (browserAddress != null && publicWebsite(Uri.parse(url))) browserAddress.setText(url);
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                request.deny(); // Third-party sites never receive XParty microphone/camera permissions.
            }
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (browserFullscreen != null) {callback.onCustomViewHidden();return;}
                browserFullscreen=view;fullscreenCallback=callback;
                root.addView(view,new FrameLayout.LayoutParams(-1,-1));
            }
            @Override public void onHideCustomView() { closeBrowserFullscreen(); }
        });
        column.addView(browser,new LinearLayout.LayoutParams(-1,0,1));
        browserContainer.addView(column,new FrameLayout.LayoutParams(-1,-1));
        browserContainer.setVisibility(View.GONE);
        root.addView(browserContainer,new FrameLayout.LayoutParams(-1,-1));
    }

    private void showBrowser(String url) {
        if (!publicWebsite(Uri.parse(url))) return;
        createBrowser();
        browserContainer.setVisibility(View.VISIBLE);
        browser.onResume();
        browserAddress.setText(url);
        if (!url.equals(browser.getUrl())) browser.loadUrl(url);
    }

    private void closeBrowserFullscreen() {
        if (browserFullscreen == null) return;
        root.removeView(browserFullscreen);
        browserFullscreen = null;
        WebChromeClient.CustomViewCallback callback = fullscreenCallback;
        fullscreenCallback = null;
        if(callback != null) callback.onCustomViewHidden();
    }

    private void closeBrowser() {
        closeBrowserFullscreen();
        if (browserContainer != null) browserContainer.setVisibility(View.GONE);
        if (browser != null) browser.onPause();
    }

    @Override public void onBackPressed() {
        if (browserFullscreen != null) { closeBrowserFullscreen(); return; }
        if (browserContainer != null && browserContainer.getVisibility() == View.VISIBLE) {
            if (browser.canGoBack()) browser.goBack(); else closeBrowser();
            return;
        }
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (pendingMedia != null) { pendingMedia.deny(); pendingMedia = null; }
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        handler.removeCallbacksAndMessages(null);
        closeBrowserFullscreen();
        if (browser != null) { browser.destroy(); browser = null; }
        browserContainer = null;
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
