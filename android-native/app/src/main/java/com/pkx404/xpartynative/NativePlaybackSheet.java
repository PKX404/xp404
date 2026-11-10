package com.pkx404.xpartynative;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.exoplayer.ExoPlayer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Native dark XParty playback settings with actual Media3 quality and track controls. */
final class NativePlaybackSheet {
  interface Actions {
    void playback();
    void scale();
    void fullscreen();
    void like();
    void resync();
    void openSource();
    void immersive(boolean enabled);
    void notice(String s);
  }
  private final Activity activity;
  private final ExoPlayer player;
  private final Actions actions;
  private final android.content.SharedPreferences prefs;
  private final AudioManager audio;
  private Dialog dialog;
  private View skinTarget;
  private final Handler skinHandler=new Handler(Looper.getMainLooper());
  private final Runnable skinUpdate=new Runnable(){
    @Override public void run(){
      if(skinTarget==null||dialog==null||!dialog.isShowing())return;
      skinTarget.invalidate();skinHandler.postDelayed(this,145);
    }
  };
  private static final int BG=0xFF171123,CARD=0xFF252035,PURPLE=0xFF9E86CE,WHITE=0xFFF7F4FF,MUTED=0xFFB9ADCB;
  NativePlaybackSheet(Activity activity,ExoPlayer player,Actions actions){
    this.activity=activity;this.player=player;this.actions=actions;
    this.prefs=activity.getPreferences(Context.MODE_PRIVATE);
    this.audio=(AudioManager)activity.getSystemService(Context.AUDIO_SERVICE);
  }
  private int dp(int d){return Math.round(d*activity.getResources().getDisplayMetrics().density);}
  private TextView label(String s,int size,int color,boolean bold){
    TextView t=new TextView(activity);t.setText(s);t.setTextSize(size);t.setTextColor(color);
    if(bold)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return t;
  }
  private GradientDrawable shape(int bg,int radius){
    GradientDrawable d=new GradientDrawable();d.setColor(bg);d.setCornerRadius(dp(radius));
    d.setStroke(dp(1),0xFF574969);return d;
  }
  private void add(LinearLayout parent,View v,int margin){
    LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(margin);parent.addView(v,lp);
  }
  private TextView control(String text,Runnable command){
    TextView v=label(text,12,WHITE,true);v.setGravity(Gravity.CENTER);
    v.setMinHeight(dp(46));v.setPadding(dp(8),dp(11),dp(8),dp(11));
    v.setBackground(shape(CARD,14));v.setOnClickListener(x->command.run());return v;
  }
  private void row(LinearLayout root,String[] texts,Runnable[] commands){
    LinearLayout lane=new LinearLayout(activity);
    for(int i=0;i<texts.length;i++){
      TextView button=control(texts[i],commands[i]);
      LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(51),1);
      if(i>0)lp.leftMargin=dp(7);
      lane.addView(button,lp);
    }
    add(root,lane,9);
  }
  private void heading(LinearLayout root,String title,String description){
    TextView head=label(title,13,PURPLE,true);
    head.setPadding(dp(2),dp(13),0,dp(5));add(root,head,2);
    if(description!=null&&!description.isEmpty())
      add(root,label(description,11,MUTED,false),10);
  }
  void show(String sourceType,String name,boolean isPlaying){
    if(dialog!=null)dialog.dismiss();
    dialog=new Dialog(activity);
    dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
    LinearLayout root=new LinearLayout(activity);root.setOrientation(LinearLayout.VERTICAL);
    root.setPadding(dp(16),dp(18),dp(16),dp(19));
    root.setBackground(NativeImmersiveBackdrop.panelBackground());skinTarget=root;
    TextView handle=label("━━━━",15,0xFF746887,true);handle.setGravity(Gravity.CENTER);add(root,handle,6);
    add(root,label("Playback Settings",22,WHITE,true),3);
    add(root,label(name==null||name.isEmpty()?"No media selected":name,13,MUTED,false),11);
    ScrollView scroll=new ScrollView(activity);scroll.setFillViewport(true);
    scroll.setVerticalScrollBarEnabled(false);
    LinearLayout contents=new LinearLayout(activity);contents.setOrientation(LinearLayout.VERTICAL);
    scroll.addView(contents);
    root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
    heading(contents,"PLAYBACK CONTROLS",null);
    row(contents,new String[]{"▶  Play / Pause","↻  Resync"},new Runnable[]{
      actions::playback,actions::resync});
    row(contents,new String[]{"⛶  Fullscreen","↔  Video fit"},new Runnable[]{
      actions::fullscreen,actions::scale});
    row(contents,new String[]{"♡  Like","▣  Sources"},new Runnable[]{
      actions::like,()->{dismiss();actions.openSource();}});

    heading(contents,"SOUND","Device playback volume; call audio is controlled separately.");
    int max=Math.max(1,audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
    TextView volume=label("Playback volume  "+Math.round(100f*audio.getStreamVolume(AudioManager.STREAM_MUSIC)/max)+"%",12,WHITE,true);
    add(contents,volume,3);
    SeekBar slider=new SeekBar(activity);slider.setMax(100);
    slider.setProgress(Math.round(100f*audio.getStreamVolume(AudioManager.STREAM_MUSIC)/max));
    slider.setProgressTintList(ColorStateList.valueOf(PURPLE));
    slider.setThumbTintList(ColorStateList.valueOf(0xFFCCB6FF));
    slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
      @Override public void onProgressChanged(SeekBar bar,int value,boolean fromUser){
        volume.setText("Playback volume  "+value+"%");
        if(fromUser)audio.setStreamVolume(AudioManager.STREAM_MUSIC,value*max/100,0);
      }
      @Override public void onStartTrackingTouch(SeekBar b){}
      @Override public void onStopTrackingTouch(SeekBar b){}
    });add(contents,slider,7);

    heading(contents,"VIDEO","Choose quality, languages and subtitles when the channel provides tracks.");
    row(contents,new String[]{"Video quality","Audio language","Subtitles"},
      new Runnable[]{()->showQuality(sourceType),this::showLanguages,this::showSubtitles});
    row(contents,new String[]{"Retry picture","Playback details"},
      new Runnable[]{()->{player.prepare();actions.notice("Video renderer reinitialized.");},
        ()->new AlertDialog.Builder(activity).setTitle("Media information")
          .setMessage("Provider: "+sourceType+"\nState: "+player.getPlaybackState()+"\nBuffered: "+player.getBufferedPosition()/1000+" seconds\nEngine: AndroidX Media3 (native)")
          .setPositiveButton("Close",null).show()});

    heading(contents,"ROOM APPEARANCE","Native immersive ambient color follows compatible playing video.");
    boolean immersive=prefs.getBoolean("immersive_background",true);
    TextView ambient=control(immersive?"IMMERSIVE BACKGROUND   ON":"IMMERSIVE BACKGROUND   OFF",()->{
      boolean enabled=!prefs.getBoolean("immersive_background",true);
      prefs.edit().putBoolean("immersive_background",enabled).apply();
      actions.immersive(enabled);
      actions.notice(enabled?"Immersive color enabled":"Immersive color disabled");
    });add(contents,ambient,15);

    TextView note=label("Video calling, host controls and chat remain available while playing.",11,MUTED,false);
    add(contents,note,9);
    TextView done=control("BACK TO ROOM",this::dismiss);add(root,done,0);
    dialog.setContentView(root);
    Window window=dialog.getWindow();
    if(window!=null){
      window.setBackgroundDrawableResource(android.R.color.transparent);
      window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
      window.setDimAmount(.47f);window.setGravity(Gravity.BOTTOM);
    }
    dialog.show();
    skinHandler.removeCallbacks(skinUpdate);skinHandler.post(skinUpdate);
    dialog.setOnDismissListener(d->{skinTarget=null;skinHandler.removeCallbacks(skinUpdate);});
    if(window!=null)window.setLayout(WindowManager.LayoutParams.MATCH_PARENT,
      Math.round(activity.getResources().getDisplayMetrics().heightPixels*.82f));
  }
  private void showQuality(String type){
    if(!("iptv".equals(type)||"direct".equals(type)||"local".equals(type))){
      actions.notice("YouTube quality is controlled by the official YouTube player.");return;
    }
    String[] names={"Auto / highest available","1080p","720p","480p","360p"};
    int[] heights={Integer.MAX_VALUE,1080,720,480,360};
    new AlertDialog.Builder(activity).setTitle("Native video quality")
      .setItems(names,(d,which)->{
        int height=heights[which];
        TrackSelectionParameters.Builder settings=player.getTrackSelectionParameters().buildUpon();
        if(height==Integer.MAX_VALUE)settings.setMaxVideoSize(Integer.MAX_VALUE,Integer.MAX_VALUE);
        else settings.setMaxVideoSize(Math.round(height*16/9f),height);
        player.setTrackSelectionParameters(settings.build());
        actions.notice(names[which]+" selected. Actual quality depends on available stream variants.");
      }).show();
  }
  private void showLanguages(){
    Map<String,String> languages=available(C.TRACK_TYPE_AUDIO);
    if(languages.isEmpty()){actions.notice("This video does not expose additional audio languages.");return;}
    String[] labels=languages.keySet().toArray(new String[0]);
    new AlertDialog.Builder(activity).setTitle("Audio language")
      .setItems(labels,(d,which)->{
        String key=languages.get(labels[which]);
        player.setTrackSelectionParameters(player.getTrackSelectionParameters()
          .buildUpon().setPreferredAudioLanguage(key).build());
        actions.notice(labels[which]+" selected");
      }).show();
  }
  private void showSubtitles(){
    Map<String,String> tracks=available(C.TRACK_TYPE_TEXT);
    List<String> names=new ArrayList<>();names.add("Off");names.addAll(tracks.keySet());
    new AlertDialog.Builder(activity).setTitle("Subtitles")
      .setItems(names.toArray(new String[0]),(d,index)->{
        TrackSelectionParameters.Builder options=player.getTrackSelectionParameters().buildUpon();
        if(index==0)options.setTrackTypeDisabled(C.TRACK_TYPE_TEXT,true);
        else options.setTrackTypeDisabled(C.TRACK_TYPE_TEXT,false)
          .setPreferredTextLanguage(tracks.get(names.get(index)));
        player.setTrackSelectionParameters(options.build());
      }).show();
  }
  private Map<String,String> available(int type){
    LinkedHashMap<String,String> out=new LinkedHashMap<>();
    for(Tracks.Group group:player.getCurrentTracks().getGroups()){
      if(group.getType()!=type)continue;
      for(int i=0;i<group.length;i++){
        Format format=group.getTrackFormat(i);
        if(format.language==null||format.language.isEmpty()||"und".equals(format.language))continue;
        java.util.Locale locale=java.util.Locale.forLanguageTag(format.language);
        out.putIfAbsent(locale.getDisplayLanguage(),format.language);
      }
    }
    return out;
  }
  void dismiss(){
    skinHandler.removeCallbacks(skinUpdate);skinTarget=null;
    if(dialog!=null){dialog.dismiss();dialog=null;}
  }
}
