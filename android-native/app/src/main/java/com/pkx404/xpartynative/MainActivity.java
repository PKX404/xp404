package com.pkx404.xpartynative;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.res.ColorStateList;
import android.media.AudioManager;
import android.graphics.Rect;
import android.graphics.Typeface;
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
  private static final int REQUEST_FILE=73;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private final ChannelCatalog directory=new ChannelCatalog();
  private RoomSocket socket;
  private ExoPlayer player;
  private PlayerView playerView;
  private WebView youtube;
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
  private TextView videoPill,watchingLabel,hostStatus,tabChat,tabCall,composerBrand;
  private SeekBar progress;
  private View micIcon,mentionIcon,emojiIcon,cameraIcon,plusIcon;
  private boolean liked=false,imeShown=false,fullscreenNative=false,showChat=true;
  private int playerFit=AspectRatioFrameLayout.RESIZE_MODE_FIT;
  private int savedVideoHeight=0;

  @Override public void onCreate(Bundle saved){
    super.onCreate(saved);
    getWindow().setStatusBarColor(BG);
    getWindow().setNavigationBarColor(BG);
    getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    nickname=getPreferences(MODE_PRIVATE).getString("nickname","Guest");
    socket=new RoomSocket(this);
    player=new ExoPlayer.Builder(this).build();
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
        if(state==Player.STATE_BUFFERING)videoState.setText("Loading picture…");
        else if(state==Player.STATE_READY&&renderedVideo)videoState.setText("Picture ready");
      }
    });
    showLobby();
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
      JSONObject received=event.optJSONObject("room");
      if(received==null){toast("Unexpected room response");return;}
      if(!roomActive)showRoom();
      updateRoom(received);
      JSONArray history=event.optJSONArray("history");
      if(history!=null){chatItems.removeAllViews();for(int i=0;i<history.length();i++)renderMessage(history.optJSONObject(i));}
      status("Connected to room "+roomCode);
    }else if("state".equals(type)){
      JSONObject next=event.optJSONObject("room");if(next!=null)updateRoom(next);
    }else if("playback".equals(type)||"anchor".equals(type)){
      if(event.optString("sourceId").equals(sourceId)){
        playback=event.optJSONObject("playback");
        followPlayback();
      }
    }else if("chat".equals(type)){renderMessage(event);
    }else if("error".equals(type)||"resume-failed".equals(type)||"ended".equals(type)||"kicked".equals(type)){
      toast(event.optString("message","Room unavailable"));
      if("resume-failed".equals(type)||"ended".equals(type)||"kicked".equals(type)){socket.disconnect(false);showLobby();}
    }
  }
  private void showRoom(){
    roomActive=true;
    layout("XPARTY","LIVE WATCH ROOM");
    ScrollView scroll=scrollPage();scroll.setFillViewport(false);
    roomBody=column();roomBody.setPadding(dp(14),dp(7),dp(14),dp(20));scroll.addView(roomBody);
    LinearLayout top=new LinearLayout(this);top.setGravity(Gravity.CENTER_VERTICAL);
    roomTitle=text("ROOM • CONNECTING",16,WHITE,true);
    top.addView(roomTitle,new LinearLayout.LayoutParams(0,-2,1));
    top.addView(button("COPY",()->{
      ((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE))
        .setPrimaryClip(android.content.ClipData.newPlainText("Room code",roomCode));
      toast("Room code copied");
    },false),new LinearLayout.LayoutParams(dp(77),dp(44)));
    add(roomBody,top,7);
    people=text("Participants: 1",12,MUTED,false);add(roomBody,people,10);

    // The video player is a fixed native surface; keyboard changes do not recreate it.
    playerFrame=new FrameLayout(this);playerFrame.setBackground(shape(0xFF000000,18));
    playerView=new PlayerView(this);
    playerView.setUseController(false);
    playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
    playerView.setPlayer(player);
    playerFrame.addView(playerView,new FrameLayout.LayoutParams(-1,-1));
    youtube=new WebView(this);youtube.setBackgroundColor(Color.BLACK);
    youtube.getSettings().setJavaScriptEnabled(true);
    youtube.getSettings().setMediaPlaybackRequiresUserGesture(true);
    youtube.setWebChromeClient(new WebChromeClient());
    youtube.setVisibility(View.GONE);
    playerFrame.addView(youtube,new FrameLayout.LayoutParams(-1,-1));
    add(roomBody,playerFrame,10);
    playerFrame.getLayoutParams().height=dp(214);
    videoState=text("Choose a video • Live TV, YouTube, or MP4",12,MUTED,false);add(roomBody,videoState,7);
    playerLabel=text("NO VIDEO SELECTED",13,WHITE,true);add(roomBody,playerLabel,11);

    LinearLayout transport=new LinearLayout(this);
    playButton=button("▶ PLAY",()->togglePlayback(),true);
    transport.addView(playButton,new LinearLayout.LayoutParams(0,dp(49),1));
    Button sourceButton=button("SOURCES",()->openSourceChooser(),false);
    LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(49),1);p.leftMargin=dp(8);
    transport.addView(sourceButton,p);
    Button sync=button("↻ RESYNC",()->send("resync"),false);
    p=new LinearLayout.LayoutParams(0,dp(49),1);p.leftMargin=dp(8);transport.addView(sync,p);
    add(roomBody,transport,10);

    add(roomBody,text("CHAT WITH EVERYONE",12,PURPLE,true),8);
    chatScroll=new ScrollView(this);chatScroll.setFillViewport(false);
    chatScroll.setBackground(shape(CARD,15));
    chatItems=column();chatItems.setPadding(dp(10),dp(9),dp(10),dp(9));
    chatScroll.addView(chatItems);
    add(roomBody,chatScroll,10);chatScroll.getLayoutParams().height=dp(184);
    LinearLayout composer=new LinearLayout(this);composer.setGravity(Gravity.CENTER_VERTICAL);
    chatInput=entry("Message everyone");
    composer.addView(chatInput,new LinearLayout.LayoutParams(0,dp(50),1));
    Button send=button("SEND",()->{
      String value=chatInput.getText().toString().trim();
      if(value.isEmpty())return;
      sendChat(value);chatInput.setText("");
    },true);
    p=new LinearLayout.LayoutParams(dp(80),dp(50));p.leftMargin=dp(8);composer.addView(send,p);
    add(roomBody,composer,12);
    TextView hint=text("Native room and chat are active. Native video calling and advanced v31.6 controls are still being migrated.",11,MUTED,false);
    add(roomBody,hint,0);
  }
  private void renderMessage(JSONObject data){
    if(data==null||chatItems==null)return;
    String body=data.optString("text","");
    if(body.isEmpty())return;
    if(chatItems.getChildCount()>100)chatItems.removeViewAt(0);
    boolean self=myId.equals(data.optString("from"));
    TextView bubble=text((self?"You":data.optString("name","Member"))+"  ·  "+body,13,WHITE,false);
    bubble.setBackground(shape(self?0xFF3C3470:CARD2,12));
    bubble.setPadding(dp(12),dp(9),dp(12),dp(9));
    LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-2,-2);
    params.gravity=self?Gravity.RIGHT:Gravity.LEFT;
    params.bottomMargin=dp(6);chatItems.addView(bubble,params);
    chatScroll.post(()->chatScroll.fullScroll(View.FOCUS_DOWN));
  }
  private void sendChat(String body){
    try{
      JSONObject data=new JSONObject().put("type","chat").put("text",body)
        .put("clientId",java.util.UUID.randomUUID().toString());
      socket.send(data);
    }catch(Exception ignored){}
  }
  private void updateRoom(JSONObject data){
    room=data;roomCode=data.optString("code",roomCode);isHost=myId.equals(data.optString("hostId"));
    if(roomTitle!=null)roomTitle.setText("ROOM  ·  "+roomCode+(isHost?"  ★":""));
    JSONArray members=data.optJSONArray("people");int count=0;
    if(members!=null)for(int i=0;i<members.length();i++)if(members.optJSONObject(i).optBoolean("online"))count++;
    if(people!=null)people.setText(count+" online  ·  "+(isHost?"You're the host":"Watching together"));
    playback=data.optJSONObject("playback");
    JSONObject next=data.optJSONObject("source");
    String newId=next==null?"":next.optString("id","");
    if(!newId.equals(sourceId)){
      sourceId=newId;source=next;
      loadSource();
    }
    followPlayback();
  }
  private void loadSource(){
    if(player==null)return;
    player.stop();player.clearMediaItems();renderedVideo=false;
    youtube.stopLoading();youtube.loadUrl("about:blank");youtube.setVisibility(View.GONE);
    playerView.setVisibility(View.VISIBLE);
    if(source==null){sourceType="";videoState.setText("Choose a video");playerLabel.setText("NO VIDEO SELECTED");return;}
    sourceType=source.optString("type","");
    sourceUrl=source.optString("url","");
    playerLabel.setText(source.optString("title","Now playing"));
    videoState.setText("Preparing video…");
    if("youtube".equals(sourceType)){
      youtubeId=source.optString("videoId","");
      if(youtubeId.matches("[A-Za-z0-9_-]{11}")){
        playerView.setVisibility(View.GONE);
        youtube.setVisibility(View.VISIBLE);
        // Official provider-owned embed; rest of the Activity is native Android.
        String html="<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
          +"<style>*{margin:0;padding:0}body,html,iframe{width:100%;height:100%;background:#000}"
          +"iframe{border:0}</style></head><body>"
          +"<iframe allow='autoplay;encrypted-media;fullscreen;picture-in-picture' allowfullscreen"
          +" src='https://www.youtube.com/embed/"+youtubeId+"?playsinline=1&enablejsapi=1&origin=https%3A%2F%2Fxp404.onrender.com'"
          +"></iframe></body></html>";
        youtube.loadDataWithBaseURL("https://xp404.onrender.com/",html,"text/html","UTF-8",null);
        videoState.setText("YouTube embedded player (provider controls)");
      }else videoState.setText("Invalid YouTube video ID");
    }else if("iptv".equals(sourceType)||"direct".equals(sourceType)){
      if(!sourceUrl.startsWith("https://")){videoState.setText("Unsupported media URL");return;}
      MediaItem media=new MediaItem.Builder().setUri(sourceUrl).build();
      player.setMediaItem(media);
      player.prepare();
      videoState.setText("Loading native video…");
    }else videoState.setText("This source is pending native migration.");
  }
  private void followPlayback(){
    if(playback==null||source==null)return;
    if("youtube".equals(sourceType))return; // Official provider UI owns its controls in preview.
    if(!"iptv".equals(sourceType)&&!"direct".equals(sourceType))return;
    boolean playing=playback.optBoolean("playing",false);
    if(playing!=player.isPlaying())player.setPlayWhenReady(playing);
    if(playButton!=null)playButton.setText(playing?"Ⅱ PAUSE":"▶ PLAY");
    if("direct".equals(sourceType)&&player.getDuration()>0){
      long origin=playback.optLong("updatedAt",System.currentTimeMillis());
      double position=playback.optDouble("position",0);
      if(playing)position+=Math.max(0,(System.currentTimeMillis()-origin)/1000.0);
      long target=(long)(position*1000);
      if(Math.abs(player.getCurrentPosition()-target)>2500)player.seekTo(target);
    }
  }
  private void togglePlayback(){
    if(source==null){toast("Choose a video first");return;}
    if("youtube".equals(sourceType)){toast("Use the YouTube player controls in this preview.");return;}
    boolean playing=playback!=null&&playback.optBoolean("playing");
    try{JSONObject msg=new JSONObject().put("type","playback")
      .put("sourceId",sourceId).put("playing",!playing).put("position",player.getCurrentPosition()/1000.0)
      .put("intent",playing?"pause":"play");socket.send(msg);}catch(Exception ignored){}
  }
  private void send(String event){try{socket.send(new JSONObject().put("type",event));}catch(Exception ignored){}}
  private void leaveRoom(){
    if(!roomActive)return;
    socket.disconnect(true);
    player.stop();
    if(youtube!=null)youtube.loadUrl("about:blank");
    status("Left room");
    showLobby();
  }
  private void toast(String message){Toast.makeText(this,message,Toast.LENGTH_SHORT).show();}

  private void openSourceChooser(){
    new AlertDialog.Builder(this).setTitle("Choose a source")
      .setItems(new String[]{"Live TV channels","YouTube link","Direct MP4 / HLS link","Local file (this device only)"},
      (dialog,which)->{
        if(which==0)openChannels();
        else if(which==1)promptVideo("YouTube URL or video ID","youtube");
        else if(which==2)promptVideo("HTTPS .m3u8 / .mp4 URL","direct");
        else chooseLocal();
      }).show();
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
    if(!roomActive){toast("Create a room first");return;}
    LinearLayout popup=column();popup.setPadding(dp(12),dp(9),dp(12),dp(9));
    EditText filter=entry("Search channel name");
    add(popup,filter,8);
    ListView list=new ListView(this);
    ArrayList<String> options=new ArrayList<>();
    ArrayList<ChannelCatalog.Channel> channels=new ArrayList<>();
    ArrayAdapter<String> adapter=new ArrayAdapter<>(this,android.R.layout.simple_list_item_1,options);
    list.setAdapter(adapter);list.setDividerHeight(dp(1));
    popup.addView(list,new LinearLayout.LayoutParams(-1,dp(350)));
    AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Live TV · Native HLS")
      .setView(popup).setNegativeButton("Close",null)
      .setNeutralButton("Category",null).create();
    final Runnable refresh=()->{
      String term=filter.getText().toString().toLowerCase(Locale.ROOT);
      options.clear();
      for(ChannelCatalog.Channel c:channels)
        if(c.title.toLowerCase(Locale.ROOT).contains(term))options.add(c.title);
      adapter.notifyDataSetChanged();
    };
    filter.addTextChangedListener(new android.text.TextWatcher(){
      @Override public void beforeTextChanged(CharSequence s,int start,int count,int after){}
      @Override public void onTextChanged(CharSequence s,int start,int before,int count){refresh.run();}
      @Override public void afterTextChanged(android.text.Editable e){}
    });
    list.setOnItemClickListener((p,v,index,id)->{
      String picked=options.get(index);
      for(ChannelCatalog.Channel c:channels)if(c.title.equals(picked)){
        try{sendSource(new JSONObject().put("type","iptv").put("url",c.url).put("title",c.title));}
        catch(Exception ignored){}
        break;
      }
      dialog.dismiss();
    });
    dialog.setOnShowListener(x->dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v->
      new AlertDialog.Builder(this).setTitle("TV category")
        .setItems(new String[]{"India","Entertainment","Movies","News","Sports","Kids"},
          (d,selected)->loadChannels(new String[]{"in","entertainment","movies","news","sports","kids"}[selected],channels,options,adapter,refresh))
        .show()
    ));
    dialog.show();
    loadChannels("in",channels,options,adapter,refresh);
  }
  private void loadChannels(String category,List<ChannelCatalog.Channel> channels,List<String> options,
                            ArrayAdapter<String> adapter,Runnable refresh){
    options.clear();options.add("Loading channels…");adapter.notifyDataSetChanged();
    directory.load(category,(values,error)->{
      if(isFinishing())return;
      channels.clear();channels.addAll(values);
      refresh.run();
      if(values.isEmpty())toast(error!=null?error:"No channels found for this category.");
    });
  }
  private void chooseLocal(){
    Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);
    pick.addCategory(Intent.CATEGORY_OPENABLE);pick.setType("video/*");
    startActivityForResult(pick,REQUEST_FILE);
  }
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
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
    socket.disconnect(false);
    directory.shutdown();
    if(youtube!=null){youtube.stopLoading();youtube.destroy();youtube=null;}
    if(player!=null){player.release();player=null;}
    super.onDestroy();
  }
}
