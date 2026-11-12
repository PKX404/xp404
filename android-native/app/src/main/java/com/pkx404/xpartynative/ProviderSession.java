package com.pkx404.xpartynative;

import android.app.Activity;
import android.app.AlertDialog;
import org.json.JSONObject;

/**
 * Safe external-provider companion.
 *
 * Android's getActiveSessions() requires notification-listener access to inspect
 * other apps' media sessions. XParty does not request that sensitive permission
 * in sideloaded builds. Embedded and local playback are handled independently.
 */
final class ProviderSession {
  interface Events {
    void status(String text);
    void linked();
    void localChange(boolean playing,double seconds,String intent);
  }

  private final Activity activity;
  private final Events events;

  ProviderSession(Activity activity, Events events){
    this.activity=activity;
    this.events=events;
  }

  void clear(){}

  void link(String type,String roomTitle){
    events.status("External provider sync requires sensitive notification access and is disabled");
    new AlertDialog.Builder(activity)
      .setTitle("External playback sync unavailable")
      .setMessage("For your privacy, XParty does not request access to notifications from other apps. This means automatic linking and control of "+ProviderLink.name(type)+" playback is unavailable in this build. XParty room chat and in-app video playback are not affected.")
      .setPositiveButton("OK",null)
      .show();
  }

  long seekableDuration(){return -1;}
  long position(){return -1;}
  void apply(JSONObject playback){}
}
