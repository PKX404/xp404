# Android WebView calls these methods reflectively by their original JS names.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
# Keep native PeerConnectionFactory JNI entry points and observer interfaces;
# the WebRTC library also supplies its own consumer rules.
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**
# Preserve nested JSON use and Android parcel reflection as supplied by dependencies.
-keepattributes Signature,*Annotation*,InnerClasses,EnclosingMethod
# OkHttp may optionally load environments not bundled with Android.
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# WebRTC resolves these bootstrap helpers by class and method name in JNI_OnLoad.
-keep class org.jni_zero.** { *; }

# Release instrumentation exercises these exact production entry points.
-keep class com.pkx404.xpartynative.NativeCallController { *; }
-keep class com.pkx404.xpartynative.NativeCallController$Events { *; }
-keep class com.pkx404.xpartynative.ProviderLink { *; }
-keepclassmembers class com.pkx404.xpartynative.MainActivity {
  public void message(org.json.JSONObject);
  private android.webkit.WebView youtube;
  private void showLobby();
  private void showProfileHome();
}
