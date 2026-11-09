package com.pkx404.xpartynative;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.res.ColorStateList;
import android.media.AudioManager;
import android.graphics.Rect;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.JavascriptInterface;
import android.os.SystemClock;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.PopupMenu;
import android.view.ViewTreeObserver;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;
import org.json.JSONObject;
import org.json.JSONArray;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Native Android XParty migration: room WebSockets, chat, IPTV, MP4, provider player. */
@SuppressWarnings({"deprecation","unused"})
public final class MainActivity extends Activity implements RoomSocket.Events {
  private static final int BG=0xFF090E1C, CARD=0xFF151B31, CARD2=0xFF1D2846;
  private static final int PURPLE=0xFF9878FF, BLUE=0xFF4F9FFF, WHITE=0xFFF6F6FF, MUTED=0xFFB6BED7;
  private static final int REQUEST_FILE=73, REQUEST_CHAT_GALLERY=74, REQUEST_CHAT_FILE=75, REQUEST_CHAT_CAMERA=76;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private final ChannelCatalog directory=new ChannelCatalog();
  private RoomSocket socket;
  private ExoPlayer player;
  private PlayerView playerView;
  private WebView youtube;
  private XPControl fullscreenControl;
  private boolean youtubeReady=false;
  private long youtubeSyncQuietUntil=0L;
  private String nativeReadySource="";
  private long mediaReadyAt=0;
  private boolean nativeRecoveryUsed=false;
  private FrameLayout playerFrame,screen;
  private LinearLayout app,roomBody,chatItems;
  private TextView connection,roomTitle,playerLabel,people,videoState;
  private Button playButton;
  private ScrollView chatScroll;
  private EditText chatInput,nameInput,joinInput;
  private String nickname="Guest",myId="",token="",roomCode="",sourceId="",sourceType="",sourceUrl="",youtubeId="";
  private boolean isHost=false,closing=false,renderedVideo=false,roomActive=false;
  private JSONObject room,source,playback;
  private boolean changingSource=false;
  private LinearLayout roomHeader,roomStage,roomPane,chatComposer,roomControls,roomNativeRoot,hostNotice;
  private FrameLayout videoContainer;
  private XPControl playIcon,pauseIcon,likeIcon,callIcon,shareIcon,memberIcon;
  private TextView videoPill,watchingLabel,hostStatus,tabChat,tabCall,composerBrand,memberBadge,mediaTypeBadge;
  private SeekBar progress;
  private View micIcon,mentionIcon,emojiIcon,cameraIcon,plusIcon;
  private boolean liked=false,imeShown=false,fullscreenNative=false,showChat=true;
  private int playerFit=AspectRatioFrameLayout.RESIZE_MODE_FIT;
  private int savedVideoHeight=0;
  private final Runnable progressTicker=new Runnable(){
    @Override public void run(){
      if(roomActive&&progress!=null&&player!=null&&"direct".equals(sourceType)){
        long duration=player.getDuration();
        if(duration>0&&duration!=androidx.media3.common.C.TIME_UNSET){
          int value=(int)Math.max(0,Math.min(1000,player.getCurrentPosition()*1000.0/duration));
          if(!progress.isPressed())progress.setProgress(value);
        }
      }
      handler.postDelayed(this,700);
    }
  };
  private NativeArtwork artwork;
  private NativeSourceSheet sourceSheet;
  private NativeAttachments attachments;
  private TextView attachmentStatus;
  private NativePlaybackSheet playbackSheet;
  private NativeImmersiveBackdrop immersive;
  private NativeCallController calls;
  private FrameLayout callPanel;
  private TextView callStatusText;
  private JSONArray callIceServers;
  private android.widget.ImageView nativeChannelLogo;
  private final java.util.Map<String,JSONObject> knownChats=new java.util.HashMap<>();
  private final java.util.Map<String,TextView> chatBubbles=new java.util.HashMap<>();
  private String replyToId=null;
  private long lastTypingAt=0;

  @Override public void onCreate(Bundle saved){
    super.onCreate(saved);
    getWindow().setStatusBarColor(BG);
    getWindow().setNavigationBarColor(BG);
    getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    nickname=getPreferences(MODE_PRIVATE).getString("nickname","Guest");
    socket=new RoomSocket(this);
    artwork=new NativeArtwork();
    attachments=new NativeAttachments(this,"https://xparty-native-room.onrender.com");
    sourceSheet=new NativeSourceSheet(this,directory,artwork,new NativeSourceSheet.Actions(){
      @Override public void selected(JSONObject selected){sendSource(selected);}
      @Override public void pickLocal(){chooseLocal();}
      @Override public void enterLink(String kind){
        promptVideo("youtube".equals(kind)?"YouTube link":"HTTPS video link",kind);
      }
      @Override public void notice(String info){toast(info);}
    },"https://xparty-native-room.onrender.com");
    player=new ExoPlayer.Builder(this).build();
    playbackSheet=new NativePlaybackSheet(this,player,new NativePlaybackSheet.Actions(){
      @Override public void playback(){togglePlayback();}
      @Override public void scale(){cycleVideoScaling();}
      @Override public void fullscreen(){toggleNativeFullscreen();}
      @Override public void like(){toggleVideoLike();}
      @Override public void resync(){send("resync");}
      @Override public void openSource(){openSourceChooser();}
      @Override public void immersive(boolean enabled){
        if(immersive!=null)immersive.setEnabled(enabled);
      }
      @Override public void notice(String text){toast(text);}
    });
    player.addListener(new Player.Listener(){
      @Override public void onRenderedFirstFrame(){
        renderedVideo=true;
        runOnUiThread(()->{if(videoState!=null&&!"youtube".equals(sourceType))videoState.setText("Picture ready");});
      }
      @Override public void onVideoSizeChanged(VideoSize size){
        if(size.width>0&&videoState!=null)videoState.setText("Video "+size.width+"×"+size.height);
      }
      @Override public void onPlayerError(androidx.media3.common.PlaybackException e){
        if(videoState!=null)videoState.setText("Playback error: "+e.getErrorCodeName());
        toast("Player unable to decode this stream. Try another channel.");
      }
      @Override public void onPlaybackStateChanged(int state){
        if(videoState==null||"youtube".equals(sourceType))return;
        if(state==Player.STATE_BUFFERING){
          videoState.setText("Loading picture…");
        }else if(state==Player.STATE_READY){
          sendReady("Ready");
          if(renderedVideo)videoState.setText("Picture ready");
          // Match original XParty: newly chosen IPTV starts for the host once ready.
          if("iptv".equals(sourceType)&&isHost&&playback!=null
             &&!playback.optBoolean("playing")&&!nativeRecoveryUsed){
            sendNativePlayback(true,0,"play");
          }
        }
      }
    });
    showLobby();
    handler.postDelayed(progressTicker,700);
  }
  private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
  private GradientDrawable shape(int color,int radius){
    GradientDrawable result=new GradientDrawable();result.setColor(color);
    result.setCornerRadius(dp(radius));result.setStroke(dp(1),0xFF343F62);return result;
  }
  private LinearLayout column(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l;}
  private TextView text(String value,int size,int color,boolean bold){
    TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(color);
    if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return v;
  }
  private void add(LinearLayout parent,View child,int bottom){
    LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,ViewGroup.LayoutParams.WRAP_CONTENT);
    p.bottomMargin=dp(bottom);parent.addView(child,p);
  }
  private void row(LinearLayout parent,String[] titles,Runnable[] actions){
    LinearLayout horizontal=new LinearLayout(this);
    horizontal.setOrientation(LinearLayout.HORIZONTAL);
    for(int i=0;i<titles.length;i++){
      Button b=button(titles[i],actions[i],false);
      LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(49),1);
      if(i>0)p.leftMargin=dp(8);horizontal.addView(b,p);
    }add(parent,horizontal,10);
  }
  private Button button(String title,Runnable action,boolean primary){
    Button b=new Button(this);b.setText(title);b.setTextSize(12);b.setAllCaps(false);
    b.setTypeface(Typeface.DEFAULT,Typeface.BOLD);b.setMinHeight(dp(48));
    b.setTextColor(WHITE);b.setPadding(dp(8),dp(4),dp(8),dp(4));
    b.setBackground(shape(primary?PURPLE:CARD2,13));b.setOnClickListener(v->action.run());
    return b;
  }
  private EditText entry(String hint){
    EditText e=new EditText(this);e.setSingleLine(true);e.setTextSize(14);
    e.setTextColor(WHITE);e.setHintTextColor(MUTED);e.setHint(hint);
    e.setPadding(dp(13),dp(11),dp(13),dp(11));e.setBackground(shape(CARD2,11));return e;
  }
  private LinearLayout layout(String title,String sub){
    app=column();app.setBackgroundColor(BG);setContentView(app);
    LinearLayout head=new LinearLayout(this);head.setGravity(Gravity.CENTER_VERTICAL);
    head.setPadding(dp(18),dp(16),dp(18),dp(13));
    TextView logo=text("XP",25,PURPLE,true);head.addView(logo,new LinearLayout.LayoutParams(dp(48),-2));
    LinearLayout labels=column();
    TextView name=text(title,17,WHITE,true);
    TextView subtitle=text(sub,11,MUTED,false);
    labels.addView(name);labels.addView(subtitle);
    head.addView(labels,new LinearLayout.LayoutParams(0,-2,1));
    Button back=button(roomActive?"EXIT":"ABOUT",()->{
      if(roomActive)leaveRoom();else new AlertDialog.Builder(this)
        .setTitle("XParty Native Preview")
        .setMessage("This is a native Android migration build alongside XParty v31.6. Not all production features are migrated yet.")
        .setPositiveButton("OK",null).show();
    },false);
    head.addView(back,new LinearLayout.LayoutParams(dp(72),dp(47)));
    app.addView(head);
    screen=new FrameLayout(this);app.addView(screen,new LinearLayout.LayoutParams(-1,0,1));
    connection=text("Live backend: xp404.onrender.com",11,MUTED,false);
    connection.setPadding(dp(18),dp(8),dp(18),dp(12));
    app.addView(connection);
    return app;
  }
  private ScrollView scrollPage(){
    ScrollView s=new ScrollView(this);s.setFillViewport(true);
    screen.addView(s,new FrameLayout.LayoutParams(-1,-1));return s;
  }
  private void showLobby(){
    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
    roomActive=false;room=null;source=null;sourceId="";sourceType="";roomCode="";
    layout("XPARTY","TOGETHER, FROM ANYWHERE");
    ScrollView scroll=scrollPage();
    LinearLayout body=column();body.setPadding(dp(18),dp(13),dp(18),dp(23));scroll.addView(body);
    TextView top=text("Different places.\nSame moment.",30,WHITE,true);
    top.setPadding(dp(3),dp(12),dp(3),dp(7));add(body,top,12);
    TextView note=text("Watch together in real time. Native Android rooms, chat and Live TV with your existing xp404 backend.",14,MUTED,false);
    add(body,note,20);
    LinearLayout panel=column();panel.setPadding(dp(14),dp(18),dp(14),dp(15));
    panel.setBackground(shape(CARD,20));
    add(panel,text("YOUR ROOM AWAITS",12,PURPLE,true),12);
    nameInput=entry("Your nickname");nameInput.setText(nickname);add(panel,nameInput,12);
    add(panel,button("CREATE A ROOM",()->startRoom("create"),true),14);
    add(panel,text("JOIN WITH A ROOM CODE",12,MUTED,true),8);
    joinInput=entry("7-character room code");joinInput.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(7)});
    add(panel,joinInput,8);
    add(panel,button("JOIN ROOM",()->startRoom("join"),false),5);
    add(body,panel,22);
    TextView provider=text("YOUR SOURCES",12,PURPLE,true);add(body,provider,8);
    row(body,new String[]{"LIVE TV","YOUTUBE","LOCAL"},new Runnable[]{
      ()->toast("Create or join a room to browse Live TV."),
      ()->toast("Create or join a room to use YouTube."),
      ()->chooseLocal()
    });
    add(body,text("Native video uses Media3. YouTube requires the official embedded player. Video calls, accounts and some v31.6 features are still being migrated.",12,MUTED,false),16);
    row(body,new String[]{"EXPLORE","FRIENDS","MESSAGES","PROFILE"},new Runnable[]{
      ()->toast("Explore: create or join a room."),
      ()->toast("Friends will be added in native migration."),
      ()->toast("Join a room for live chat."),
      ()->toast("Account screens are still in migration.")
    });
  }
  private void startRoom(String action){
    nickname=nameInput.getText().toString().trim();
    if(nickname.isEmpty())nickname="Guest";
    if(nickname.length()>24)nickname=nickname.substring(0,24);
    getPreferences(MODE_PRIVATE).edit().putString("nickname",nickname).apply();
    String code=joinInput.getText().toString().trim().toUpperCase(Locale.ROOT);
    if("join".equals(action)&&!code.matches("[A-Z2-9]{7}")){toast("Enter a valid 7-character code.");return;}
    connection.setText("Connecting to the room server…");
    socket.start(action,nickname,code,null);
  }
  @Override public void status(String value){
    if(connection!=null)connection.setText(value);
  }
  @Override public void message(JSONObject event){
    String type=event.optString("type");
    if("welcome".equals(type)){
      myId=event.optString("id");token=event.optString("token");
      callIceServers=event.optJSONArray("iceServers");
      if(calls!=null)calls.configureIce(callIceServers);
      JSONObject received=event.optJSONObject("room");
      if(received==null){toast("Unexpected room response");return;}
      if(!roomActive)showRoom();
      updateRoom(received);
      JSONArray history=event.optJSONArray("history");
      if(history!=null){
        chatItems.removeAllViews();knownChats.clear();chatBubbles.clear();
        for(int i=0;i<history.length();i++)renderMessage(history.optJSONObject(i));
      }
      status("Connected to room "+roomCode);
    }else if("state".equals(type)){
      JSONObject next=event.optJSONObject("room");if(next!=null)updateRoom(next);
    }else if("playback".equals(type)||"anchor".equals(type)){
      if(event.optString("sourceId").equals(sourceId)){
        playback=event.optJSONObject("playback");
        followPlayback();
      }
    }else if("signal".equals(type)){
      NativeCallController c=ensureCalls();
      if(c!=null)c.signal(event.optString("from"),event.optJSONObject("signal"));
    }else if("video-call-incoming".equals(type)){
      String caller=event.optString("name","Someone");
      String requestId=event.optString("id");
      new AlertDialog.Builder(this).setTitle("Incoming video call")
        .setMessage(caller+" wants to start a video call. Your camera remains off until you enable it.")
        .setPositiveButton("Accept",(d,w)->{
          try{socket.send(new JSONObject().put("type","video-call-response")
            .put("id",requestId).put("accept",true));}catch(Exception ignored){}
          showRoomTab(false);
        })
        .setNegativeButton("Decline",(d,w)->{
          try{socket.send(new JSONObject().put("type","video-call-response")
            .put("id",requestId).put("accept",false));}catch(Exception ignored){}
        }).show();
    }else if("video-call-result".equals(type)){
      if("accepted".equals(event.optString("status")))showRoomTab(false);
      else toast("Video request: "+event.optString("status","ended"));
    }else if("chat".equals(type)){renderMessage(event);
    }else if("message-update".equals(type)){
      JSONObject changed=event.optJSONObject("message");
      if(changed!=null)renderMessage(changed);
    }else if("chat-updated".equals(type)){
      String id=event.optString("id");
      JSONObject old=knownChats.get(id);
      if(old!=null){
        try{
          old.put("text",event.optString("text",""));
          old.put("deleted",event.optBoolean("deleted",false));
          renderMessage(old);
        }catch(Exception ignored){}
      }
    }else if("chat-error".equals(type)){toast(event.optString("message","Unable to send message"));
    }else if("error".equals(type)||"resume-failed".equals(type)||"ended".equals(type)||"kicked".equals(type)){
      toast(event.optString("message","Room unavailable"));
      if("resume-failed".equals(type)||"ended".equals(type)||"kicked".equals(type)){socket.disconnect(false);showLobby();}
    }
  }
  private XPControl xpIcon(String name,Runnable onPress){
    XPControl icon=new XPControl(this,name);icon.setOnClickListener(v->onPress.run());return icon;
  }
  private void iconIn(LinearLayout container,XPControl icon,int width,int height){
    container.addView(icon,new LinearLayout.LayoutParams(dp(width),dp(height)));
  }
  private void headerIcon(LinearLayout bar,String kind,Runnable onPress,float weight){
    XPControl icon=xpIcon(kind,onPress);
    if("people".equals(kind)){
      FrameLayout slot=new FrameLayout(this);
      slot.addView(icon,new FrameLayout.LayoutParams(-1,-1));
      memberBadge=text("1",9,0xFF101021,true);
      memberBadge.setGravity(Gravity.CENTER);
      memberBadge.setBackground(shape(0xFFE9D9FF,20));
      FrameLayout.LayoutParams badgePosition=new FrameLayout.LayoutParams(dp(19),dp(19),Gravity.TOP|Gravity.RIGHT);
      badgePosition.rightMargin=dp(1);badgePosition.topMargin=dp(2);
      slot.addView(memberBadge,badgePosition);
      bar.addView(slot,new LinearLayout.LayoutParams(0,dp(58),weight));
    }else bar.addView(icon,new LinearLayout.LayoutParams(0,dp(58),weight));
  }
  private GradientDrawable blend(int top,int bottom,int radius){
    GradientDrawable d=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{top,bottom});
    d.setCornerRadius(dp(radius));return d;
  }
  private void showRoom(){
    roomActive=true;imeShown=false;fullscreenNative=false;showChat=true;
    roomNativeRoot=column();
    roomNativeRoot.setBackgroundColor(0xFF0B0D1C);
    setContentView(roomNativeRoot);

    // The balanced, edge-to-edge XParty header is fully native.
    roomHeader=new LinearLayout(this);roomHeader.setGravity(Gravity.CENTER_VERTICAL);
    roomHeader.setPadding(dp(6),0,dp(6),0);
    roomHeader.setBackground(blend(0xFF201A23,0xFF121829,0));
    headerIcon(roomHeader,"exit",this::confirmLeaveRoom,1f);
    headerIcon(roomHeader,"settings",this::showRoomSettings,1f);
    headerIcon(roomHeader,"search",this::openSourceChooser,1f);

    android.widget.ImageView brand=new android.widget.ImageView(this);
    brand.setImageResource(R.drawable.xparty_wordmark_exact);
    brand.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
    brand.setContentDescription("XParty original wordmark");
    brand.setPadding(dp(2),dp(5),dp(2),dp(5));
    roomHeader.addView(brand,new LinearLayout.LayoutParams(0,dp(58),2.30f));

    headerIcon(roomHeader,"playsearch",this::openSourceChooser,1f);
    headerIcon(roomHeader,"share",this::shareRoom,1f);
    headerIcon(roomHeader,"people",this::openParticipants,1f);
    roomNativeRoot.addView(roomHeader,new LinearLayout.LayoutParams(-1,dp(58)));

    roomStage=column();roomStage.setBackgroundColor(0xFF11172F);
    roomNativeRoot.addView(roomStage,new LinearLayout.LayoutParams(-1,-2));
    playerFrame=new FrameLayout(this);
    playerFrame.setBackgroundColor(Color.BLACK);
    playerView=new PlayerView(this);
    playerView.setUseController(false);
    playerView.setResizeMode(playerFit);
    playerView.setPlayer(player);
    playerFrame.addView(playerView,new FrameLayout.LayoutParams(-1,-1));
    youtube=new WebView(this);
    youtube.setBackgroundColor(Color.BLACK);
    youtube.getSettings().setJavaScriptEnabled(true);
    youtube.getSettings().setMediaPlaybackRequiresUserGesture(true);
    youtube.setWebChromeClient(new WebChromeClient());
    youtube.addJavascriptInterface(new YoutubeBridge(),"XpartyYT");
    youtube.setVisibility(View.GONE);
    playerFrame.addView(youtube,new FrameLayout.LayoutParams(-1,-1));

    XPControl fullscreen=xpIcon("fullscreen",this::toggleNativeFullscreen);
    fullscreenControl=fullscreen;
    FrameLayout.LayoutParams fullParams=new FrameLayout.LayoutParams(dp(44),dp(44),Gravity.TOP|Gravity.LEFT);
    fullParams.leftMargin=dp(5);fullParams.topMargin=dp(5);
    playerFrame.addView(fullscreen,fullParams);

    videoPill=text("Waiting for video",11,0xFFD8DBEA,true);
    videoPill.setPadding(dp(9),dp(6),dp(9),dp(6));
    videoPill.setGravity(Gravity.CENTER);
    videoPill.setBackground(shape(0xD511182A,13));
    FrameLayout.LayoutParams pillParams=new FrameLayout.LayoutParams(-2,-2,Gravity.TOP|Gravity.RIGHT);
    pillParams.topMargin=dp(12);pillParams.rightMargin=dp(12);
    playerFrame.addView(videoPill,pillParams);
    videoState=videoPill;
    roomStage.addView(playerFrame,new LinearLayout.LayoutParams(-1,-2));
    int displayWidth=getResources().getDisplayMetrics().widthPixels;
    savedVideoHeight=Math.round(displayWidth*9f/16f);
    playerFrame.getLayoutParams().height=savedVideoHeight;

    progress=new SeekBar(this);
    progress.setMax(1000);progress.setProgress(0);
    progress.setProgressTintList(ColorStateList.valueOf(0xFFD9CCFF));
    progress.setProgressBackgroundTintList(ColorStateList.valueOf(0xFF625B87));
    progress.setThumbTintList(ColorStateList.valueOf(0xFFFFFFFF));
    progress.setPadding(dp(5),0,dp(5),0);
    // Controls overlay the fixed 16:9 native video surface rather than adding
    // extra height. This matches the v31.6 room geometry and avoids video resize.
    FrameLayout.LayoutParams timeline=new FrameLayout.LayoutParams(-1,dp(19),Gravity.BOTTOM);
    timeline.bottomMargin=dp(52);
    playerFrame.addView(progress,timeline);
    progress.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
      @Override public void onProgressChanged(SeekBar sb,int value,boolean fromUser){}
      @Override public void onStartTrackingTouch(SeekBar sb){}
      @Override public void onStopTrackingTouch(SeekBar sb){
        if(source==null||!"direct".equals(sourceType)){toast("This source does not support seeking.");return;}
        double target=player.getDuration()>0?player.getDuration()*sb.getProgress()/1000000.0:0;
        try {
          JSONObject msg=new JSONObject().put("type","playback").put("sourceId",sourceId)
            .put("playing",playback!=null&&playback.optBoolean("playing"))
            .put("position",target).put("intent","seek");
          socket.send(msg);
        }catch(Exception ignored){}
      }
    });

    roomControls=new LinearLayout(this);roomControls.setGravity(Gravity.CENTER_VERTICAL);
    roomControls.setPadding(dp(7),0,dp(7),0);
    roomControls.setBackground(blend(0xC6151933,0xF21E1935,0));
    FrameLayout playSlot=new FrameLayout(this);
    playIcon=xpIcon("play",this::togglePlayback);
    pauseIcon=xpIcon("pause",this::togglePlayback);
    playSlot.addView(playIcon,new FrameLayout.LayoutParams(-1,-1));
    playSlot.addView(pauseIcon,new FrameLayout.LayoutParams(-1,-1));
    pauseIcon.setVisibility(View.GONE);
    roomControls.addView(playSlot,new LinearLayout.LayoutParams(dp(45),dp(52)));
    TextView live=text("● LIVE",12,WHITE,true);
    mediaTypeBadge=live;
    live.setGravity(Gravity.CENTER_VERTICAL);live.setTextColor(0xFFF5F1FF);
    roomControls.addView(live,new LinearLayout.LayoutParams(-2,dp(52)));
    // Native white vector buttons: same hitbox, identical alignment.
    View spacer=new View(this);roomControls.addView(spacer,new LinearLayout.LayoutParams(0,1,1));
    likeIcon=xpIcon("heart",this::toggleVideoLike);
    iconIn(roomControls,likeIcon,44,52);
    iconIn(roomControls,xpIcon("scale",this::cycleVideoScaling),44,52);
    iconIn(roomControls,xpIcon("settings",this::showPlaybackSettings),44,52);
    iconIn(roomControls,xpIcon("volume",this::showVolume),44,52);
    playerFrame.addView(roomControls,new FrameLayout.LayoutParams(-1,dp(52),Gravity.BOTTOM));
    roomControls.setVisibility(View.GONE);
    progress.setVisibility(View.GONE);

    // Gradient room panel with native split call/chat affordances.
    roomPane=column();
    if(immersive!=null){immersive.stop();immersive=null;}
    immersive=new NativeImmersiveBackdrop(roomPane,playerView);
    immersive.setEnabled(getPreferences(MODE_PRIVATE).getBoolean("immersive_background",true));
    immersive.start();
    roomNativeRoot.addView(roomPane,new LinearLayout.LayoutParams(-1,0,1));
    LinearLayout tabs=new LinearLayout(this);
    tabs.setGravity(Gravity.CENTER_VERTICAL);
    tabCall=text("Video call",15,WHITE,true);
    tabCall.setGravity(Gravity.CENTER);
    tabCall.setOnClickListener(v->showRoomTab(false));
    tabs.addView(tabCall,new LinearLayout.LayoutParams(0,dp(58),1));
    tabChat=text("Chat",15,WHITE,true);
    tabChat.setGravity(Gravity.CENTER);
    tabChat.setOnClickListener(v->showRoomTab(true));
    tabs.addView(tabChat,new LinearLayout.LayoutParams(0,dp(58),1));
    roomPane.addView(tabs);

    hostNotice=new LinearLayout(this);hostNotice.setGravity(Gravity.CENTER_VERTICAL|Gravity.RIGHT);
    hostNotice.setPadding(dp(12),dp(6),dp(18),dp(5));
    hostStatus=text("Host joined the room",13,0xFFE6DCF9,false);
    hostStatus.setBackground(shape(0xFF2D234F,18));
    hostStatus.setPadding(dp(10),dp(5),dp(10),dp(5));
    hostNotice.addView(hostStatus,new LinearLayout.LayoutParams(-2,-2));
    XPControl crown=xpIcon("crown",this::openParticipants);crown.tint(0xFFE2BF6F);
    iconIn(hostNotice,crown,39,42);
    TextView avatar=text("H",15,WHITE,true);avatar.setGravity(Gravity.CENTER);
    avatar.setBackground(shape(0xFF685880,44));
    hostNotice.addView(avatar,new LinearLayout.LayoutParams(dp(42),dp(42)));
    roomPane.addView(hostNotice,new LinearLayout.LayoutParams(-1,dp(73)));
    connection=text("Room connected",10,0xFFD9C8F5,false);
    connection.setPadding(dp(10),0,dp(8),0);
    hostNotice.addView(connection,0,new LinearLayout.LayoutParams(0,dp(40),1));

    LinearLayout watching=new LinearLayout(this);watching.setGravity(Gravity.CENTER_VERTICAL);
    watching.setPadding(dp(13),dp(2),dp(11),dp(2));
    FrameLayout artworkSlot=new FrameLayout(this);
    XPControl currentSource=xpIcon("play",this::openSourceChooser);
    currentSource.tint(0xFFEAE2FF);
    artworkSlot.addView(currentSource,new FrameLayout.LayoutParams(-1,-1));
    nativeChannelLogo=new android.widget.ImageView(this);
    nativeChannelLogo.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
    nativeChannelLogo.setPadding(dp(3),dp(5),dp(3),dp(5));
    nativeChannelLogo.setVisibility(View.GONE);
    artworkSlot.addView(nativeChannelLogo,new FrameLayout.LayoutParams(-1,-1));
    watching.addView(artworkSlot,new LinearLayout.LayoutParams(dp(48),dp(52)));
    playerLabel=text("Now watching · Choose a video",14,WHITE,true);
    playerLabel.setGravity(Gravity.CENTER_VERTICAL);
    watching.addView(playerLabel,new LinearLayout.LayoutParams(0,dp(52),1));
    XPControl heart=xpIcon("heart",this::toggleVideoLike);
    iconIn(watching,heart,44,50);
    XPControl next=xpIcon("next",()->{
      if(isHost)send("next");else toast("Only the host can skip the video.");
    });
    iconIn(watching,next,44,50);
    roomPane.addView(watching,new LinearLayout.LayoutParams(-1,dp(66)));

    // Messages belong to the room panel, not another large floating card.
    chatScroll=new ScrollView(this);
    chatScroll.setFillViewport(true);
    chatScroll.setVerticalScrollBarEnabled(false);
    chatItems=column();chatItems.setPadding(dp(15),dp(5),dp(14),dp(12));
    knownChats.clear();chatBubbles.clear();replyToId=null;
    chatScroll.addView(chatItems);
    roomPane.addView(chatScroll,new LinearLayout.LayoutParams(-1,0,1));
    callPanel=new FrameLayout(this);
    callPanel.setBackgroundColor(0xFF12101E);
    callPanel.setVisibility(View.GONE);
    roomPane.addView(callPanel,new LinearLayout.LayoutParams(-1,0,1));

    // Video-call tab uses a visible, explicit migration notice: never fake a connection.
    chatScroll.setVisibility(View.VISIBLE);

    chatComposer=new LinearLayout(this);
    chatComposer.setGravity(Gravity.CENTER_VERTICAL);
    chatComposer.setPadding(dp(5),dp(6),dp(5),dp(6));
    chatComposer.setBackgroundColor(0xFF1A1424);
    XPControl mic=xpIcon("mic_off",this::toggleNativeMic);
    mic.tint(0xFFEDE3FF);micIcon=mic;
    iconIn(chatComposer,mic,48,54);
    chatInput=entry("Message");
    chatInput.setTextSize(14);
    chatInput.setPadding(dp(8),dp(6),dp(6),dp(6));
    chatInput.setBackgroundColor(Color.TRANSPARENT);
    chatInput.addTextChangedListener(new android.text.TextWatcher(){
      @Override public void beforeTextChanged(CharSequence s,int start,int count,int after){}
      @Override public void onTextChanged(CharSequence s,int start,int before,int count){
        if(System.currentTimeMillis()-lastTypingAt<1300)return;
        lastTypingAt=System.currentTimeMillis();
        try{socket.send(new JSONObject().put("type","typing").put("active",s.length()>0));}
        catch(Exception ignored){}
      }
      @Override public void afterTextChanged(android.text.Editable value){}
    });
    chatComposer.addView(chatInput,new LinearLayout.LayoutParams(0,dp(50),1));
    XPControl mention=xpIcon("at",()->chatInput.getText().insert(chatInput.getSelectionStart(),"@"));
    mentionIcon=mention;iconIn(chatComposer,mention,40,52);
    XPControl emoji=xpIcon("smile",this::showEmojiMenu);
    emojiIcon=emoji;iconIn(chatComposer,emoji,40,52);
    XPControl camera=xpIcon("camera",this::showChatAttachments);
    cameraIcon=camera;iconIn(chatComposer,camera,40,52);
    XPControl send=xpIcon("send",()->{
      String v=chatInput.getText().toString().trim();
      if(!v.isEmpty()){sendChat(v);chatInput.setText("");}
    });
    iconIn(chatComposer,send,44,52);
    XPControl plus=xpIcon("plus",this::showChatAttachments);
    plusIcon=plus;iconIn(chatComposer,plus,44,52);
    attachmentStatus=text("",12,0xFFF7EEFF,false);
    attachmentStatus.setPadding(dp(14),dp(5),dp(14),dp(6));
    attachmentStatus.setBackgroundColor(0xFF2E2248);
    attachmentStatus.setVisibility(View.GONE);
    roomNativeRoot.addView(attachmentStatus,new LinearLayout.LayoutParams(-1,-2));
    roomNativeRoot.addView(chatComposer,new LinearLayout.LayoutParams(-1,dp(65)));

    TextView footer=text("A PKX404 PRODUCT",10,0xFF857991,true);
    footer.setGravity(Gravity.CENTER);footer.setLetterSpacing(.15f);
    footer.setBackgroundColor(0xFF1C1228);
    roomNativeRoot.addView(footer,new LinearLayout.LayoutParams(-1,dp(22)));
    // Connection state remains in the participant header; branded footer stays fixed.
    updatePlayIcon(false);
    roomNativeRoot.getViewTreeObserver().addOnGlobalLayoutListener(()->{
      if(roomNativeRoot==null||!roomActive)return;
      Rect visible=new Rect();roomNativeRoot.getWindowVisibleDisplayFrame(visible);
      int total=roomNativeRoot.getRootView().getHeight(),hidden=total-visible.bottom;
      boolean shown=hidden>dp(175);
      if(shown!=imeShown){imeShown=shown;setTypingLayout(shown);}
    });
  }
  private void setTypingLayout(boolean typing){
    if(roomHeader==null||chatComposer==null)return;
    roomHeader.setVisibility(typing?View.GONE:View.VISIBLE);
    if(micIcon!=null)micIcon.setVisibility(typing?View.GONE:View.VISIBLE);
    if(mentionIcon!=null)mentionIcon.setVisibility(typing?View.GONE:View.VISIBLE);
    if(cameraIcon!=null)cameraIcon.setVisibility(typing?View.GONE:View.VISIBLE);
    if(plusIcon!=null)plusIcon.setVisibility(typing?View.GONE:View.VISIBLE);
    if(chatScroll!=null&&typing)chatScroll.post(()->chatScroll.fullScroll(View.FOCUS_DOWN));
  }
  private void updatePlayIcon(boolean playing){
    if(playIcon!=null)playIcon.setVisibility(playing?View.GONE:View.VISIBLE);
    if(pauseIcon!=null)pauseIcon.setVisibility(playing?View.VISIBLE:View.GONE);
  }
  private NativeCallController ensureCalls(){
    if(!roomActive||isFinishing()||callPanel==null)return null;
    if(calls==null){
      calls=new NativeCallController(this,new NativeCallController.Events(){
        @Override public void signal(String person,JSONObject payload){
          try{socket.send(new JSONObject().put("type","signal")
            .put("to",person).put("signal",payload));}catch(Exception ignored){}
        }
        @Override public void sendMedia(boolean mic,boolean camera){
          try{socket.send(new JSONObject().put("type","media")
            .put("mic",mic).put("camera",camera));}catch(Exception ignored){}
          if(micIcon instanceof XPControl)((XPControl)micIcon).active(mic);
        }
        @Override public void action(String type){send(type);}
        @Override public void status(String value){
          if(callStatusText!=null)callStatusText.setText(value);
        }
      });
      calls.configureIce(callIceServers);
      calls.attach(callPanel);
    }
    calls.syncRoom(room,myId);
    return calls;
  }
  private void toggleNativeMic(){
    NativeCallController c=ensureCalls();
    if(c!=null)c.toggleMic();
  }
  private void showRoomTab(boolean chat){
    showChat=chat;
    if(tabChat!=null)tabChat.setTextColor(chat?WHITE:0xFFB4A6CB);
    if(tabCall!=null)tabCall.setTextColor(chat?0xFFB4A6CB:WHITE);
    if(!chat)ensureCalls();
    if(chatScroll!=null)chatScroll.setVisibility(chat?View.VISIBLE:View.GONE);
    if(callPanel!=null)callPanel.setVisibility(chat?View.GONE:View.VISIBLE);
    if(chatComposer!=null)chatComposer.setVisibility(chat?View.VISIBLE:View.GONE);
  }
  private void toggleVideoLike(){
    if(sourceId==null||sourceId.isEmpty()){toast("Play a video to like it.");return;}
    liked=!liked;
    if(likeIcon!=null)likeIcon.active(liked);
    try{socket.send(new JSONObject().put("type","video-like").put("sourceId",sourceId).put("liked",liked));}
    catch(Exception ignored){}
  }
  private void cycleVideoScaling(){
    playerFit=playerFit==AspectRatioFrameLayout.RESIZE_MODE_FIT
        ?AspectRatioFrameLayout.RESIZE_MODE_ZOOM:AspectRatioFrameLayout.RESIZE_MODE_FIT;
    if(playerView!=null)playerView.setResizeMode(playerFit);
    toast(playerFit==AspectRatioFrameLayout.RESIZE_MODE_FIT?"Video: fit":"Video: fill");
  }
  private void showVolume(){
    AudioManager audio=(AudioManager)getSystemService(AUDIO_SERVICE);
    SeekBar bar=new SeekBar(this);bar.setMax(100);
    int max=Math.max(1,audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
    bar.setProgress(100*audio.getStreamVolume(AudioManager.STREAM_MUSIC)/max);
    bar.setPadding(dp(20),dp(10),dp(20),dp(10));
    bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
      @Override public void onProgressChanged(SeekBar b,int n,boolean user){
        if(user)audio.setStreamVolume(AudioManager.STREAM_MUSIC,n*max/100,0);
      }
      @Override public void onStartTrackingTouch(SeekBar b){}
      @Override public void onStopTrackingTouch(SeekBar b){}
    });
    new AlertDialog.Builder(this).setTitle("Playback volume").setView(bar)
      .setPositiveButton("Done",null).show();
  }
  private void confirmLeaveRoom(){
    new AlertDialog.Builder(this).setTitle("Exit XParty room?")
      .setMessage("Leave the watch room and close its playback on this device?")
      .setPositiveButton("Yes, leave",(dialog,which)->leaveRoom())
      .setNegativeButton("No",null).show();
  }
  private void showRoomSettings(){
    if(room==null){toast("Join a room first.");return;}
    boolean locked=room.optBoolean("locked",false);
    String[] names=isHost
      ?new String[]{locked?"Unlock room":"Lock room","Host-only playback","Shared playback control","Host approval","Participants","Playback settings"}
      :new String[]{"Participants","Playback settings","Copy room code"};
    new AlertDialog.Builder(this).setTitle("Room settings · "+roomCode)
      .setItems(names,(dialog,which)->{
        if(!isHost){
          if(which==0)openParticipants();else if(which==1)showPlaybackSettings();else copyRoomCode();
          return;
        }
        try{
          if(which==0)socket.send(new JSONObject().put("type","lock").put("locked",!locked));
          else if(which>=1&&which<=3){
            String mode=which==1?"HOST_ONLY":which==2?"SHARED_CONTROL":"HOST_APPROVAL";
            socket.send(new JSONObject().put("type","party-mode").put("mode",mode));
          }else if(which==4)openParticipants();
          else if(which==5)showPlaybackSettings();
        }catch(Exception ignored){}
      }).show();
  }
  private void copyRoomCode(){
    if(roomCode==null||roomCode.isEmpty())return;
    ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE))
      .setPrimaryClip(ClipData.newPlainText("XParty room code",roomCode));
    toast("Room code copied");
  }
  private void showPlaybackSettings(){
    if(playbackSheet==null)return;
    playbackSheet.show(sourceType,source==null?"No video selected":source.optString("title","Video"),
      playback!=null&&playback.optBoolean("playing",false));
  }
  private void toggleNativeFullscreen(){
    fullscreenNative=!fullscreenNative;
    if(fullscreenNative){
      getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
      if(roomHeader!=null)roomHeader.setVisibility(View.GONE);
      if(roomPane!=null)roomPane.setVisibility(View.GONE);
      if(chatComposer!=null)chatComposer.setVisibility(View.GONE);
      if(playerFrame!=null){
        playerFrame.getLayoutParams().height=getResources().getDisplayMetrics().heightPixels-dp(160);
        playerFrame.requestLayout();
      }
    }else{
      getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
      if(roomHeader!=null)roomHeader.setVisibility(View.VISIBLE);
      if(roomPane!=null)roomPane.setVisibility(View.VISIBLE);
      if(chatComposer!=null)chatComposer.setVisibility(View.VISIBLE);
      if(playerFrame!=null){playerFrame.getLayoutParams().height=savedVideoHeight;playerFrame.requestLayout();}
    }
  }
  private void shareRoom(){
    if(roomCode==null||roomCode.isEmpty()){toast("Create a room first.");return;}
    Intent sendIntent=new Intent(Intent.ACTION_SEND);
    sendIntent.setType("text/plain");
    sendIntent.putExtra(Intent.EXTRA_TEXT,"Join my XParty room: "+roomCode+"\nhttps://xp404.onrender.com");
    startActivity(Intent.createChooser(sendIntent,"Invite to XParty"));
  }
  private void openParticipants(){
    if(room==null)return;
    JSONArray participants=room.optJSONArray("people");
    if(participants==null)return;
    android.app.Dialog sheet=new android.app.Dialog(this);
    LinearLayout body=column();
    body.setBackground(blend(0xFF221A40,0xFF160F2D,0));
    body.setPadding(dp(10),dp(20),dp(10),dp(14));
    TextView heading=text("PARTICIPANTS",14,WHITE,true);
    heading.setGravity(Gravity.CENTER);add(body,heading,8);
    TextView count=text(participants.length()+" members",12,MUTED,false);
    count.setGravity(Gravity.CENTER);add(body,count,10);
    ScrollView scroll=new ScrollView(this);
    LinearLayout list=column();scroll.addView(list);
    body.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
    for(int i=0;i<participants.length();i++){
      JSONObject member=participants.optJSONObject(i);
      if(member==null)continue;
      boolean host=member.optString("id").equals(room.optString("hostId"));
      boolean self=member.optString("id").equals(myId);
      LinearLayout item=new LinearLayout(this);
      item.setGravity(Gravity.CENTER_VERTICAL);
      item.setPadding(dp(4),dp(8),dp(4),dp(8));
      TextView avatar=text(member.optString("name","M").substring(0,1).toUpperCase(Locale.ROOT),15,WHITE,true);
      avatar.setGravity(Gravity.CENTER);avatar.setBackground(shape(0xFF64517E,50));
      item.addView(avatar,new LinearLayout.LayoutParams(dp(37),dp(37)));
      LinearLayout label=column();label.setPadding(dp(6),0,0,0);
      String name=member.optString("name","Member");
      TextView title=text(name+(self?" (You)":""),11,WHITE,true);title.setMaxLines(1);
      title.setEllipsize(android.text.TextUtils.TruncateAt.END);
      label.addView(title);
      label.addView(text((host?"♛ Host · ":"")+(member.optBoolean("online")?"Online":"Offline"),10,0xFFC6B4E8,false));
      item.addView(label,new LinearLayout.LayoutParams(0,-2,1));
      if(isHost&&!self){
        XPControl menu=xpIcon("settings",()->{
          new AlertDialog.Builder(this).setTitle(name)
            .setItems(new String[]{"Make host","Remove from room"},(d,which)->{
              try{socket.send(new JSONObject().put("type",which==0?"transfer-host":"kick")
                 .put("target",member.optString("id")));}
              catch(Exception ignored){}
              sheet.dismiss();
            }).show();
        });
        item.addView(menu,new LinearLayout.LayoutParams(dp(35),dp(40)));
      }
      add(list,item,5);
    }
    XPControl close=xpIcon("exit",sheet::dismiss);
    LinearLayout closeRow=new LinearLayout(this);closeRow.setGravity(Gravity.RIGHT);
    closeRow.addView(close,new LinearLayout.LayoutParams(dp(47),dp(48)));
    add(body,closeRow,0);
    sheet.setContentView(body);
    if(sheet.getWindow()!=null){
      sheet.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
      sheet.getWindow().setDimAmount(.40f);
      sheet.getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
    }
    sheet.show();
    if(sheet.getWindow()!=null){
      sheet.getWindow().setGravity(Gravity.RIGHT);
      sheet.getWindow().setLayout(Math.round(getResources().getDisplayMetrics().widthPixels*.43f),
        WindowManager.LayoutParams.MATCH_PARENT);
    }
  }
  private void showEmojiMenu(){
    String[] emoji={"😀","😂","❤️","👍","🔥","🎉","😮","👏"};
    new AlertDialog.Builder(this).setTitle("Emoji").setItems(emoji,(d,index)->{
      int position=Math.max(0,chatInput.getSelectionStart());
      chatInput.getText().insert(position,emoji[index]);
      chatInput.requestFocus();
    }).show();
  }
  private void showChatAttachments(){
    if(!roomActive){toast("Create or join a room first.");return;}
    new AlertDialog.Builder(this).setTitle("Share in XParty chat")
      .setItems(new String[]{"Attachment","Gallery","Camera","Extra"},(d,which)->{
        if(which==0)openChatPicker("*/*",REQUEST_CHAT_FILE);
        else if(which==1)openChatPicker("image/*",REQUEST_CHAT_GALLERY);
        else if(which==2){
          try{
            Intent intent=new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            if(intent.resolveActivity(getPackageManager())!=null)
              startActivityForResult(intent,REQUEST_CHAT_CAMERA);
            else toast("No camera application is available.");
          }catch(Exception e){toast("Cannot open camera.");}
        }else{
          new AlertDialog.Builder(this).setTitle("More sharing options")
            .setItems(new String[]{"Share video","Share image","Share document"},(extra,n)->{
              openChatPicker(n==0?"video/*":n==1?"image/*":"*/*",REQUEST_CHAT_FILE);
            }).show();
        }
      }).show();
  }
  private void openChatPicker(String mime,int request){
    Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);
    pick.addCategory(Intent.CATEGORY_OPENABLE);pick.setType(mime);
    startActivityForResult(pick,request);
  }
  private void setAttachmentStatus(String text){
    if(attachmentStatus==null)return;
    attachmentStatus.setText(text);
    attachmentStatus.setVisibility(text==null||text.isEmpty()?View.GONE:View.VISIBLE);
  }
  private final NativeAttachments.Listener attachmentListener=new NativeAttachments.Listener(){
    @Override public void status(String text){setAttachmentStatus(text);}
    @Override public void uploaded(String id,String name){
      setAttachmentStatus("Uploaded "+name+" · sending to room…");
      try{
        JSONObject chat=new JSONObject().put("type","chat").put("attachmentId",id)
          .put("clientId",java.util.UUID.randomUUID().toString());
        String accompanying=chatInput==null?"":chatInput.getText().toString().trim();
        if(!accompanying.isEmpty())chat.put("text",accompanying);
        if(replyToId!=null&&!replyToId.isEmpty())chat.put("replyTo",replyToId);
        socket.send(chat);
        if(chatInput!=null)chatInput.setText("");
        replyToId=null;
      }catch(Exception e){toast("Upload completed but chat message could not be sent.");}
      handler.postDelayed(()->setAttachmentStatus(""),1800);
    }
    @Override public void downloaded(String path){
      setAttachmentStatus("");
      toast("Saved to "+path);
    }
    @Override public void error(String error){
      setAttachmentStatus("");
      toast(error);
    }
  };
  private void renderMessage(JSONObject data){
    if(data==null||chatItems==null)return;
    final String id=data.optString("id","");
    String body=data.optString("text","");
    boolean deleted=data.optBoolean("deleted",false);
    JSONObject attachment=data.optJSONObject("attachment");
    if(body.isEmpty()&&attachment!=null)body="📎 "+attachment.optString("name","Attachment");
    if(deleted)body="Message deleted";
    if(body.isEmpty())return;
    boolean self=myId.equals(data.optString("from"));
    String author=self?"You":data.optString("name","Member");
    String text=author+"  ·  "+body;
    JSONObject reactions=data.optJSONObject("reactions");
    if(reactions!=null){
      java.util.Iterator<String> keys=reactions.keys();
      while(keys.hasNext()){
        String emoji=keys.next();
        JSONArray members=reactions.optJSONArray(emoji);
        if(members!=null&&members.length()>0)text+="\n"+emoji+" "+members.length();
      }
    }
    if(id.length()>0)knownChats.put(id,data);
    TextView bubble=id.length()>0?chatBubbles.get(id):null;
    if(bubble!=null){bubble.setText(text);return;}
    if(chatItems.getChildCount()>100){
      View oldest=chatItems.getChildAt(0);
      chatItems.removeViewAt(0);
      chatBubbles.values().remove(oldest);
    }
    bubble=text(text,13,WHITE,false);
    bubble.setMaxWidth(dp(298));
    bubble.setBackground(shape(self?0xFF514084:0xFF332A55,16));
    bubble.setPadding(dp(12),dp(9),dp(12),dp(9));
    LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-2,-2);
    params.gravity=self?Gravity.RIGHT:Gravity.LEFT;
    params.bottomMargin=dp(7);chatItems.addView(bubble,params);
    if(!id.isEmpty()){
      chatBubbles.put(id,bubble);
      final JSONObject message=data;
      bubble.setOnLongClickListener(v->{showChatActions(message);return true;});
      if(attachment!=null){
        String attachmentId=attachment.optString("id");
        String attachmentName=attachment.optString("name","Attachment");
        bubble.setOnClickListener(v->{
          if(attachments!=null)attachments.download(attachmentId,attachmentName,token,attachmentListener);
        });
      }
      if(!self){
        try {
          JSONArray ids=new JSONArray().put(id);
          socket.send(new JSONObject().put("type","delivered").put("ids",ids));
          if(showChat)socket.send(new JSONObject().put("type","read").put("ids",ids));
        }catch(Exception ignored){}
      }
    }
    chatScroll.post(()->chatScroll.fullScroll(View.FOCUS_DOWN));
  }
  private void showChatActions(JSONObject message){
    if(message==null)return;
    String id=message.optString("id");
    boolean mine=myId.equals(message.optString("from"));
    ArrayList<String> actions=new ArrayList<>();
    actions.add("Reply");
    actions.add("React ❤️");actions.add("React 😂");actions.add("React 👍");
    actions.add("Copy text");
    if(mine){actions.add("Edit");actions.add("Delete");}
    new AlertDialog.Builder(this).setTitle("Message actions")
      .setItems(actions.toArray(new String[0]),(dialog,position)->{
        String action=actions.get(position);
        try{
          if(action.equals("Reply")){
            replyToId=id;
            chatInput.setHint("Replying to "+message.optString("name","member"));
            chatInput.requestFocus();
          }else if(action.startsWith("React")){
            String emoji=action.split(" ",2)[1];
            socket.send(new JSONObject().put("type","message-reaction")
              .put("id",id).put("emoji",emoji).put("active",true));
          }else if(action.equals("Copy text")){
            ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE))
              .setPrimaryClip(ClipData.newPlainText("XParty message",message.optString("text")));
            toast("Message copied");
          }else if(action.equals("Delete")){
            socket.send(new JSONObject().put("type","message-delete").put("id",id));
          }else if(action.equals("Edit")){
            EditText field=entry("Edit your message");
            field.setText(message.optString("text"));
            new AlertDialog.Builder(this).setTitle("Edit message").setView(field)
              .setNegativeButton("Cancel",null)
              .setPositiveButton("Save",(d,w)->{
                try{socket.send(new JSONObject().put("type","chat-edit").put("id",id)
                  .put("text",field.getText().toString().trim()));}catch(Exception ignored){}
              }).show();
          }
        }catch(Exception ignored){}
      }).show();
  }
  private void sendChat(String body){
    try{
      JSONObject data=new JSONObject().put("type","chat").put("text",body)
        .put("clientId",java.util.UUID.randomUUID().toString());
      if(replyToId!=null&&!replyToId.isEmpty())data.put("replyTo",replyToId);
      replyToId=null;chatInput.setHint("Message");
      socket.send(data);
    }catch(Exception ignored){}
  }
  private void updateRoom(JSONObject data){
    room=data;roomCode=data.optString("code",roomCode);isHost=myId.equals(data.optString("hostId"));
    if(roomTitle!=null)roomTitle.setText("ROOM  ·  "+roomCode+(isHost?"  ★":""));
    if(hostStatus!=null)hostStatus.setText((isHost?"Host":"Guest")+" joined the room");
    JSONArray members=data.optJSONArray("people");int count=0;
    if(members!=null)for(int i=0;i<members.length();i++)if(members.optJSONObject(i).optBoolean("online"))count++;
    if(people!=null)people.setText(count+" online  ·  "+(isHost?"You're the host":"Watching together"));
    if(memberBadge!=null)memberBadge.setText(count>9?"9+":String.valueOf(count));
    if(calls!=null)calls.syncRoom(room,myId);
    playback=data.optJSONObject("playback");
    JSONObject next=data.optJSONObject("source");
    String newId=next==null?"":next.optString("id","");
    if(!newId.equals(sourceId)){
      sourceId=newId;source=next;
      loadSource();
    }
    followPlayback();
  }
  /**
   * Only the official YouTube IFrame API runs in WebView; all room controls,
   * signaling, chat and IPTV decoding remain native Android components.
   */
  public final class YoutubeBridge {
    @JavascriptInterface public void onReady(){
      runOnUiThread(()->{
        if(!roomActive||!"youtube".equals(sourceType)||source==null)return;
        youtubeReady=true;
        videoState.setText("YouTube · ready");
        sendReady("YouTube ready");
        followPlayback();
      });
    }
    @JavascriptInterface public void state(int state,double seconds){
      runOnUiThread(()->{
        if(!roomActive||!"youtube".equals(sourceType)||!youtubeReady)return;
        if(state!=1&&state!=2&&state!=0)return;
        if(SystemClock.uptimeMillis()<youtubeSyncQuietUntil)return;
        if(!isHost&&room!=null&&"HOST_ONLY".equals(room.optString("mode")))return;
        if(!Double.isFinite(seconds))return;
        boolean playing=state==1;
        boolean current=playback!=null&&playback.optBoolean("playing");
        if(playing!=current||Math.abs((playback==null?0:playback.optDouble("position",0))-seconds)>3){
          sendNativePlayback(playing,seconds,playing?"play":"pause");
        }
      });
    }
    @JavascriptInterface public void error(int code){
      runOnUiThread(()->{
        if("youtube".equals(sourceType))videoState.setText("YouTube player error "+code+" · choose another video");
      });
    }
    @JavascriptInterface public void blocked(){
      runOnUiThread(()->{
        if("youtube".equals(sourceType))toast("Tap Play in the YouTube player to allow playback.");
      });
    }
  }
  private void sendReady(String status){
    if(sourceId==null||sourceId.isEmpty()||sourceId.equals(nativeReadySource))return;
    nativeReadySource=sourceId;
    try{socket.send(new JSONObject().put("type","ready").put("sourceId",sourceId)
      .put("ready",true).put("status",status));}catch(Exception ignored){}
  }
  private void sendNativePlayback(boolean playing,double seconds,String intent){
    if(source==null)return;
    try{socket.send(new JSONObject()
      .put("type","playback").put("sourceId",sourceId)
      .put("playing",playing).put("position",Math.max(0,seconds))
      .put("intent",intent));}catch(Exception ignored){}
  }
  private void loadSource(){
    if(player==null)return;
    player.stop();player.clearMediaItems();
    renderedVideo=false;youtubeReady=false;nativeReadySource="";nativeRecoveryUsed=false;
    mediaReadyAt=SystemClock.uptimeMillis();
    youtube.stopLoading();youtube.loadUrl("about:blank");youtube.setVisibility(View.GONE);
    playerView.setVisibility(View.VISIBLE);
    if(source==null){
      sourceType="";
      videoState.setText("Choose a video");
      playerLabel.setText("Now watching · Select a video");
      if(roomControls!=null)roomControls.setVisibility(View.GONE);
      if(progress!=null)progress.setVisibility(View.GONE);
      return;
    }
    sourceType=source.optString("type","");
    getPreferences(MODE_PRIVATE).edit().putString("last_source",sourceType).apply();
    sourceUrl=source.optString("url","");
    if(mediaTypeBadge!=null)mediaTypeBadge.setText("iptv".equals(sourceType)?"● LIVE":
      "youtube".equals(sourceType)?"YOUTUBE": "direct".equals(sourceType)?"VIDEO":"LOCAL");
    if(artwork!=null&&nativeChannelLogo!=null)
      artwork.show(source.optString("logo",""),nativeChannelLogo);
    playerLabel.setText("Now watching · "+("iptv".equals(sourceType)?"Live TV  ":"")
      +source.optString("title","Video"));
    boolean isYouTube="youtube".equals(sourceType);
    if(roomControls!=null)roomControls.setVisibility(isYouTube?View.GONE:View.VISIBLE);
    if(progress!=null)progress.setVisibility(isYouTube?View.GONE:View.VISIBLE);
    if(fullscreenControl!=null)fullscreenControl.setVisibility(isYouTube?View.GONE:View.VISIBLE);
    if(videoPill!=null)videoPill.setVisibility(isYouTube?View.GONE:View.VISIBLE);
    videoState.setText("Preparing video…");
    if(isYouTube){
      youtubeId=source.optString("videoId","");
      if(!youtubeId.matches("[A-Za-z0-9_-]{11}")){videoState.setText("Invalid YouTube video ID");return;}
      playerView.setVisibility(View.GONE);
      youtube.setVisibility(View.VISIBLE);
      // Keep YouTube's own player and controls fully visible without overlaying it.
      String html="""
        <!doctype html><html><head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          html,body,#player{margin:0;padding:0;background:#000;width:100%;height:100%;overflow:hidden}
          iframe{display:block;position:absolute;inset:0;width:100%;height:100%;border:0}
        </style></head><body>
        <div id="player"></div>
        <script src="https://www.youtube.com/iframe_api"></script>
        <script>
          let ytPlayer=null;
          function onYouTubeIframeAPIReady(){
            ytPlayer=new YT.Player('player',{
              videoId:'__VIDEO_ID__',
              playerVars:{playsinline:1,rel:0,enablejsapi:1,origin:'https://xparty-native-room.onrender.com'},
              events:{
                onReady:function(){XpartyYT.onReady();},
                onError:function(e){XpartyYT.error(e.data);},
                onAutoplayBlocked:function(){XpartyYT.blocked();},
                onStateChange:function(e){
                  try{XpartyYT.state(e.data,ytPlayer.getCurrentTime()||0);}catch(ex){}
                }
              }
            });
          }
          window.xpartySync=function(playing,time){
            if(!ytPlayer||typeof ytPlayer.getPlayerState!=='function')return;
            const actual=ytPlayer.getCurrentTime()||0;
            if(Math.abs(actual-time)>2.5)ytPlayer.seekTo(Math.max(0,time),true);
            if(playing&&ytPlayer.getPlayerState()!==YT.PlayerState.PLAYING)ytPlayer.playVideo();
            else if(!playing&&ytPlayer.getPlayerState()===YT.PlayerState.PLAYING)ytPlayer.pauseVideo();
          };
          window.xpartyPlay=function(playing){
            if(!ytPlayer)return;
            if(playing)ytPlayer.playVideo();else ytPlayer.pauseVideo();
          };
          window.xpartyTime=function(){return ytPlayer?ytPlayer.getCurrentTime()||0:0;};
        </script></body></html>
        """.replace("__VIDEO_ID__",youtubeId);
      youtube.loadDataWithBaseURL("https://xparty-native-room.onrender.com/",html,"text/html","UTF-8",null);
    }else if("iptv".equals(sourceType)||"direct".equals(sourceType)){
      if(!sourceUrl.startsWith("https://")){videoState.setText("Unsupported media URL");return;}
      player.setMediaItem(new MediaItem.Builder().setUri(sourceUrl).build());
      player.prepare();
      videoState.setText("Loading native picture…");
    }else{
      videoState.setText("This video source is not yet supported by the native player.");
    }
  }
  private void followPlayback(){
    if(playback==null||source==null)return;
    boolean playing=playback.optBoolean("playing",false);
    if("youtube".equals(sourceType)){
      updatePlayIcon(playing);
      if(!youtubeReady)return;
      double position=playback.optDouble("position",0);
      if(playing){
        long anchored=playback.optLong("updatedAt",System.currentTimeMillis());
        position+=Math.max(0,(System.currentTimeMillis()-anchored)/1000.0);
      }
      youtubeSyncQuietUntil=SystemClock.uptimeMillis()+1400;
      youtube.evaluateJavascript("window.xpartySync("+playing+","+Math.max(0,position)+")",null);
      return;
    }
    if(!"iptv".equals(sourceType)&&!"direct".equals(sourceType))return;
    if(playing!=player.getPlayWhenReady())player.setPlayWhenReady(playing);
    updatePlayIcon(playing);
    if("direct".equals(sourceType)&&player.getDuration()>0){
      long anchored=playback.optLong("updatedAt",System.currentTimeMillis());
      double position=playback.optDouble("position",0);
      if(playing)position+=Math.max(0,(System.currentTimeMillis()-anchored)/1000.0);
      long target=(long)(position*1000);
      if(Math.abs(player.getCurrentPosition()-target)>2500)player.seekTo(target);
    }
  }
  private void togglePlayback(){
    if(source==null){toast("Choose a video first");return;}
    boolean wasPlaying=playback!=null&&playback.optBoolean("playing",false);
    if("youtube".equals(sourceType)){
      if(!youtubeReady){toast("YouTube is loading. Tap Play inside its player.");return;}
      youtube.evaluateJavascript("window.xpartyTime()",raw->{
        double pos=0;
        try{pos=Double.parseDouble(raw);}catch(Exception ignored){}
        sendNativePlayback(!wasPlaying,pos,wasPlaying?"pause":"play");
        youtubeSyncQuietUntil=SystemClock.uptimeMillis()+900;
        youtube.evaluateJavascript("window.xpartyPlay("+!wasPlaying+")",null);
      });
      return;
    }
    sendNativePlayback(!wasPlaying,player.getCurrentPosition()/1000.0,wasPlaying?"pause":"play");
  }
  private void send(String event){try{socket.send(new JSONObject().put("type",event));}catch(Exception ignored){}}
  private void leaveRoom(){
    if(!roomActive)return;
    socket.disconnect(true);
    if(calls!=null){calls.stop();calls=null;}
    if(immersive!=null){immersive.stop();immersive=null;}
    if(playbackSheet!=null)playbackSheet.dismiss();
    player.stop();
    if(youtube!=null)youtube.loadUrl("about:blank");
    status("Left room");
    showLobby();
  }
  private void toast(String message){Toast.makeText(this,message,Toast.LENGTH_SHORT).show();}

  private void openSourceChooser(){
    if(!roomActive){toast("Create or join a room first.");return;}
    if(sourceSheet!=null)sourceSheet.open(sourceType,token,source==null?"":source.optString("title"));
  }
  private void promptVideo(String title,String type){
    EditText field=entry("Paste a URL");
    LinearLayout wrap=column();wrap.setPadding(dp(18),dp(7),dp(18),0);wrap.addView(field);
    new AlertDialog.Builder(this).setTitle(title).setView(wrap)
      .setNegativeButton("Cancel",null).setPositiveButton("Play",(d,w)->{
        String v=field.getText().toString().trim();
        if("youtube".equals(type)){
          String id=parseYoutubeId(v);
          if(id==null){toast("Use a valid YouTube video link.");return;}
          try{sendSource(new JSONObject().put("type","youtube").put("videoId",id).put("title","YouTube video"));}catch(Exception ignored){}
        }else{
          if(!v.startsWith("https://")){toast("Use an HTTPS stream URL.");return;}
          String format=v.split("\\?")[0].toLowerCase(Locale.ROOT);
          String kind=format.endsWith(".m3u8")?"iptv":format.endsWith(".mp4")||format.endsWith(".webm")?"direct":"";
          if(kind.isEmpty()){toast("Use .m3u8, .mp4 or .webm");return;}
          try{sendSource(new JSONObject().put("type",kind).put("url",v).put("title",kind.equals("iptv")?"Live IPTV":"Shared video"));}catch(Exception ignored){}
        }
      }).show();
  }
  private String parseYoutubeId(String value){
    if(value.matches("[A-Za-z0-9_-]{11}"))return value;
    Pattern pattern=Pattern.compile("(?:youtu\\.be/|[?&]v=|/shorts/|/embed/)([A-Za-z0-9_-]{11})");
    Matcher m=pattern.matcher(value);return m.find()?m.group(1):null;
  }
  private void sendSource(JSONObject data){
    if(!roomActive){toast("Join a room first.");return;}
    if(!isHost){toast("Only the host may change the video in this version.");return;}
    try{socket.send(new JSONObject().put("type","source").put("source",data));}catch(Exception ignored){}
  }
  private void openChannels(){
    if(!roomActive){toast("Create or join a room first.");return;}
    if(sourceSheet!=null)sourceSheet.open("iptv",token,"Live TV");
  }
  private void chooseLocal(){
    Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);
    pick.addCategory(Intent.CATEGORY_OPENABLE);pick.setType("video/*");
    startActivityForResult(pick,REQUEST_FILE);
  }
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(result!=RESULT_OK)return;
    if((request==REQUEST_CHAT_FILE||request==REQUEST_CHAT_GALLERY)&&data!=null&&data.getData()!=null){
      if(!roomActive){toast("Join a room to share files.");return;}
      attachments.upload(data.getData(),token,attachmentListener);
      return;
    }
    if(request==REQUEST_CHAT_CAMERA){
      android.graphics.Bitmap snapshot=data!=null&&data.getExtras()!=null
        ?(android.graphics.Bitmap)data.getExtras().get("data"):null;
      if(snapshot!=null&&roomActive)attachments.uploadCamera(snapshot,token,attachmentListener);
      else toast("Camera did not return a picture.");
      return;
    }
    if(request==REQUEST_FILE&&result==RESULT_OK&&data!=null&&data.getData()!=null){
      if(!roomActive){toast("Join a room to play the file locally.");return;}
      Uri uri=data.getData();
      sourceType="local";sourceId="";
      youtube.setVisibility(View.GONE);playerView.setVisibility(View.VISIBLE);
      player.setMediaItem(MediaItem.fromUri(uri));player.prepare();player.play();
      playerLabel.setText("LOCAL DEVICE VIDEO");
      videoState.setText("Local playback; sharing/upload is still being migrated.");
      toast("Playing locally. Other room members cannot access this file yet.");
    }
  }
  @Override public void onBackPressed(){
    if(fullscreenNative){toggleNativeFullscreen();return;}
    if(roomActive){
      new AlertDialog.Builder(this).setTitle("Leave the watch room?")
        .setMessage("Video and chat will close on this device.")
        .setPositiveButton("Leave",(d,w)->leaveRoom())
        .setNegativeButton("Cancel",null).show();
    }else super.onBackPressed();
  }
  @Override protected void onPause(){super.onPause();if(youtube!=null)youtube.onPause();}
  @Override protected void onResume(){super.onResume();if(youtube!=null)youtube.onResume();}
  @Override protected void onDestroy(){
    closing=true;
    handler.removeCallbacks(progressTicker);
    socket.disconnect(false);
    if(calls!=null){calls.stop();calls=null;}
    if(immersive!=null){immersive.stop();immersive=null;}
    if(playbackSheet!=null)playbackSheet.dismiss();
    if(sourceSheet!=null)sourceSheet.dismiss();
    directory.shutdown();
    if(attachments!=null)attachments.shutdown();
    if(artwork!=null)artwork.shutdown();
    if(youtube!=null){youtube.stopLoading();youtube.destroy();youtube=null;}
    if(player!=null){player.release();player=null;}
    super.onDestroy();
  }
}
