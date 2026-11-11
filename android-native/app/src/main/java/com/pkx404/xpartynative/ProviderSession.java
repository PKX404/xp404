package com.pkx404.xpartynative;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Intent;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.SystemClock;
import android.provider.Settings;
import org.json.JSONObject;

final class ProviderSession {
  interface Events {
    void status(String text);
    void linked();
    void localChange(boolean playing,double seconds,String intent);
  }
  private final Activity activity;
  private final Events events;
  private MediaController selected;
  private String title="";
  private int generation;
  private long quietUntil;
  private PlaybackState previous;
  private final MediaController.Callback callback=new MediaController.Callback(){
    @Override public void onSessionDestroyed(){clear();events.status("Provider session ended");}
    @Override public void onPlaybackStateChanged(PlaybackState next){
      PlaybackState old=previous;previous=next;
      if(selected==null||next==null||old==null||!title.equals(title(selected))||SystemClock.elapsedRealtime()<quietUntil)return;
      int state=next.getState();
      if(state!=PlaybackState.STATE_PLAYING&&state!=PlaybackState.STATE_PAUSED)return;
      long ms=position();if(ms<0)return;
      boolean play=state==PlaybackState.STATE_PLAYING;
      if(state!=old.getState()&&(old.getState()==PlaybackState.STATE_PAUSED||old.getState()==PlaybackState.STATE_PLAYING)){
        events.localChange(play,ms/1000.0,play?"play":"pause");
      }else if(state==old.getState()&&old.getPosition()>=0&&old.getLastPositionUpdateTime()>0){
        double predicted=old.getPosition()+(play?(SystemClock.elapsedRealtime()-old.getLastPositionUpdateTime())*old.getPlaybackSpeed():0);
        if(Math.abs(predicted-ms)>2400)events.localChange(play,ms/1000.0,"seek");
      }
    }
  };
  ProviderSession(Activity activity, Events events){this.activity=activity;this.events=events;}
  void clear(){generation++;if(selected!=null)selected.unregisterCallback(callback);selected=null;previous=null;title="";}
  private static String title(MediaController control){
    MediaMetadata m=control.getMetadata();
    if(m==null)return "";
    CharSequence title=m.getDescription().getTitle(),subtitle=m.getDescription().getSubtitle();
    return title==null?"":title.toString()+(subtitle==null?"":" · "+subtitle);
  }
  void link(String type,String roomTitle){
    int request=generation;
    String pkg="netflix".equals(type)?"com.netflix.mediaclient":"com.amazon.avod.thirdpartyclient";
    try {
      MediaSessionManager manager=activity.getSystemService(MediaSessionManager.class);
      for(MediaController control:manager.getActiveSessions(new ComponentName(activity,SessionAccess.class))){
        if(!pkg.equals(control.getPackageName()))continue;
        String found=title(control);
        if(found.isEmpty()||control.getPlaybackState()==null)continue;
        new AlertDialog.Builder(activity).setTitle("Link this playback?")
          .setMessage("Room selection · "+roomTitle+"\nPlaying in "+ProviderLink.name(type)+" · "+found+"\n\nLink only if these are the same movie or episode.")
          .setNegativeButton("Cancel",null).setPositiveButton("Link",(d,w)->{
            if(request!=generation||!found.equals(title(control)))return;
            clear();selected=control;title=found;previous=control.getPlaybackState();control.registerCallback(callback);events.linked();
          }).show();
        return;
      }
      events.status("Start the selected title in "+ProviderLink.name(type)+", then return and tap Link playback.");
    }catch(SecurityException denied){
      new AlertDialog.Builder(activity).setTitle("Allow media controls?")
        .setMessage("Android requires notification access to control another app’s media session. XParty uses playback state and title only. You can keep using room chat without granting access.")
        .setNegativeButton("Cancel",null).setPositiveButton("Open settings",(d,w)->{
          try{activity.startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));}
          catch(Exception e){events.status("Notification access settings unavailable.");}
        }).show();
    }
  }
  long seekableDuration(){
    if(selected==null||selected.getMetadata()==null||selected.getPlaybackState()==null)return -1;
    if((selected.getPlaybackState().getActions()&PlaybackState.ACTION_SEEK_TO)==0)return -1;
    return selected.getMetadata().getLong(MediaMetadata.METADATA_KEY_DURATION);
  }
  long position(){
    PlaybackState state=selected==null?null:selected.getPlaybackState();
    if(state==null||state.getPosition()<0)return -1;
    long ms=state.getPosition();
    if(state.getState()==PlaybackState.STATE_PLAYING&&state.getLastPositionUpdateTime()>0)
      ms+=Math.round(Math.max(0,SystemClock.elapsedRealtime()-state.getLastPositionUpdateTime())*state.getPlaybackSpeed());
    return ms;
  }
  void apply(JSONObject playback){
    if(selected==null||playback==null)return;
    try{
      if(!title.equals(title(selected))){clear();events.status("Title changed · link the current episode again");return;}
      PlaybackState s=selected.getPlaybackState();
      if(s==null){clear();events.status("Playback session ended");return;}
      boolean play=playback.optBoolean("playing");
      long target=(long)(playback.optDouble("position")*1000);
      if(play)target+=Math.max(0,System.currentTimeMillis()-playback.optLong("updatedAt",System.currentTimeMillis()));
      long position=position(),actions=s.getActions();
      MediaController.TransportControls controls=selected.getTransportControls();
      boolean seek=(actions&PlaybackState.ACTION_SEEK_TO)!=0;
      if(position>=0&&seek&&Math.abs(target-position)>2200){quietUntil=SystemClock.elapsedRealtime()+1500;controls.seekTo(target);}
      boolean playing=s.getState()==PlaybackState.STATE_PLAYING;
      if(play!=playing){
        long action=play?PlaybackState.ACTION_PLAY:PlaybackState.ACTION_PAUSE;
        if((actions&(action|PlaybackState.ACTION_PLAY_PAUSE))==0){events.status("Provider has disabled this playback control");return;}
        quietUntil=SystemClock.elapsedRealtime()+1500;
        if(play)controls.play();else controls.pause();
      }
      events.status(seek?"Linked · use XParty controls":"Linked · provider controls seeking");
    }catch(RuntimeException e){clear();events.status("Playback session unavailable · link again");}
  }
}
