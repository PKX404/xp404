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
import android.widget.FrameLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Arrays;

/**
 * APK test harness for the Xparty Render site.
 * WebView fallback video != the existing production Android native decoder.
 */
public final class MainActivity extends Activity {
    private static final String HOME = "https://xp4040.onrender.com/";
    private static final String HOST = "xp4040.onrender.com";
    private static final int MEDIA_PERMISSIONS = 2001;
    private static final int NOTIFY_PERMISSION = 2002;
    private static final int SELECT_FILE = 2003;
    private static final String CHANNEL = "xparty-test";
    private WebView web;
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
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(8,9,17));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (allowed(request.getUrl())) return false;
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

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (pendingMedia != null) { pendingMedia.deny(); pendingMedia = null; }
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        handler.removeCallbacksAndMessages(null);
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
