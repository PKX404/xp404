
package com.pkx404.xpartynative;

import android.Manifest;
import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.RenderEffect;
import android.graphics.Shader;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import com.bumptech.glide.Glide;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONException;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@SuppressWarnings("deprecation")
public final class MainActivity extends Activity {
  private static final String BASE="https://xp404.onrender.com";
  private static final int BG=0xff100e19, PANEL=0xff20192e, PANEL2=0xff2f253e,
    TEXT=0xfff9f5ff, MUTED=0xffafa2c7, ACCENT=0xffaf8ddd;
  private final Handler ui=new Handler(Looper.getMainLooper());
  private final ExecutorService io=Executors.newFixedThreadPool(2);
  private final OkHttpClient http=new OkHttpClient.Builder().connectTimeout(15,TimeUnit.SECONDS)
      .pingInterval(18,TimeUnit.SECONDS).retryOnConnectionFailure(true).build();
  private WebSocket socket;
  private long generation=0; private int retries=0;
  private String myId="",token="",roomCode="",currentSourceId="",currentType="",youtubeId="";
  private JSONObject room=null;
  private boolean destroyed=false,receivedFrame=false,recovered=false,wasMicDenied=false;
  private int tileColumns=2;
  private long lastFrame=0,lastSyncRequest=0;
  private double serverOffsetMs=0;
  private String connectionRequest="create",joinCode="";
  private FrameLayout background,stage;
  private ImageView ambient;
  private LinearLayout content,chatRows,composer,header;
  private ScrollView chatScroll;
  private TextView playbackStatus,roomInfo,watchTitle,playToggle,skipButton,connectionLabel;
  private EditText chatField,username,roomInput;
  private ExoPlayer player; private PlayerView playerView; private WebView youtubeFrame;
  private Dialog sourceDialog;
  private String sourceTab="youtube";
  private JSONArray chatHistory=new JSONArray();
  private int lastDisplayedMessages=0;
  private final ArrayList<JSONObject> results=new ArrayList<>();
  private final ArrayList<JSONObject> savedSources=new ArrayList<>();

  private int dp(float n){return (int)(getResources().getDisplayMetrics().density*n+.5f);}
  private GradientDrawable shape(int fill,int stroke,int r){
    GradientDrawable d=new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{fill,fill});
    d.setCornerRadius(dp(r));if(stroke!=0)d.setStroke(dp(1),stroke);return d;
  }
  private TextView text(String value,int size,int color,boolean bold){
    TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);
    if(bold)t.setTypeface(null,1);t.setGravity(Gravity.CENTER_VERTICAL);return t;
  }
  private TextView button(String value,java.lang.Runnable action){
    TextView t=text(value,15,TEXT,true);t.setGravity(Gravity.CENTER);t.setPadding(dp(12),dp(10),dp(12),dp(10));
    t.setBackground(shape(PANEL2,0xff524065,17));t.setClickable(true);t.setOnClickListener(v->action.run());return t;
  }
  private LinearLayout vertical(){LinearLayout l=new LinearLayout(this);l.setOrientation(1);return l;}
  private LinearLayout horizontal(){LinearLayout l=new LinearLayout(this);l.setOrientation(0);l.setGravity(Gravity.CENTER_VERTICAL);return l;}
  private void add(LinearLayout parent,View child,int bottom){
    LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.bottomMargin=dp(bottom);parent.addView(child,p);
  }
  private void rowItem(LinearLayout row,View child,int weight){
    LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,weight);p.rightMargin=dp(6);row.addView(child,p);
  }
  private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}
  @Override public void onCreate(Bundle state){
    super.onCreate(state);getWindow().setStatusBarColor(0xff100e19);getWindow().setNavigationBarColor(0xff100e19);
    getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    tileColumns=getPreferences(0).getInt("tiles",2);token=getPreferences(0).getString("token","");
    roomCode=getPreferences(0).getString("room","");
    loadSaved();showLobby();
  }
  private void buildBackground(){
    background=new FrameLayout(this);background.setBackgroundColor(BG);
    ambient=new ImageView(this);ambient.setScaleType(ImageView.ScaleType.CENTER_CROP);ambient.setAlpha(.29f);
    if(Build.VERSION.SDK_INT>=31)ambient.setRenderEffect(RenderEffect.createBlurEffect(55,55,Shader.TileMode.CLAMP));
    background.addView(ambient,new FrameLayout.LayoutParams(-1,-1));
    setContentView(background);
  }
  private TextView appTitle(){
    TextView v=text("  xparty  ",27,TEXT,true);v.setGravity(Gravity.CENTER);v.setLetterSpacing(-.07f);return v;
  }
  private void showLobby(){
    clearPlayback();room=null;myId="";currentSourceId="";buildBackground();
    LinearLayout box=vertical();box.setPadding(dp(22),dp(26),dp(22),dp(18));
    ScrollView scroller=new ScrollView(this);scroller.setFillViewport(true);scroller.addView(box);
    background.addView(scroller,new FrameLayout.LayoutParams(-1,-1));
    add(box,appTitle(),dp(24));
    TextView subtitle=text("WATCH · CHAT · TOGETHER",14,ACCENT,true);subtitle.setGravity(Gravity.CENTER);add(box,subtitle,36);
    TextView hero=text("Your room. Your screen. Together.",25,TEXT,true);add(box,hero,15);
    TextView support=text("Native Android preview · room connection and synchronized playback",14,MUTED,false);add(box,support,28);
    username=new EditText(this);username.setSingleLine(true);username.setTextColor(TEXT);
    username.setHintTextColor(MUTED);username.setHint("Your name");
    username.setText(getPreferences(0).getString("name","Host"));username.setBackground(shape(PANEL,0xff574668,14));
    username.setPadding(dp(16),dp(14),dp(16),dp(14));add(box,username,14);
    add(box,button("＋  CREATE ROOM",()->connect("create","")),16);
    roomInput=new EditText(this);roomInput.setSingleLine(true);roomInput.setTextColor(TEXT);
    roomInput.setHintTextColor(MUTED);roomInput.setHint("7-character room code");
    roomInput.setBackground(shape(PANEL,0xff574668,14));roomInput.setPadding(dp(16),dp(14),dp(16),dp(14));
    add(box,roomInput,12);
    add(box,button("↗  JOIN ROOM",()->connect("join",roomInput.getText().toString().trim().toUpperCase())),20);
    if(!token.isEmpty()&&!roomCode.isEmpty())add(box,button("↻  REJOIN LAST ROOM",()->connect("resume","")),16);
    connectionLabel=text("Room connection: ready",13,MUTED,false);add(box,connectionLabel,12);
    TextView note=text("YouTube runs in its authorized embedded player; IPTV uses native Media3. Voice/video calls are not yet available in this native preview.",13,MUTED,false);
    add(box,note,9);
  }
  private String displayName(){return username==null?"Host":username.getText().toString().trim();}
  private void connect(String request,String code){
    if(request.equals("join")&&!code.matches("[A-HJ-NP-Z2-9]{7}")){toast("Enter a valid 7-character room code");return;}
    connectionRequest=request;joinCode=code;
    if(username!=null)getPreferences(0).edit().putString("name",displayName()).apply();
    retries=0;openSocket();
  }
  private void openSocket(){
    if(destroyed)return;
    final long n=++generation;
    if(socket!=null){socket.cancel();socket=null;}
    if(connectionLabel!=null)connectionLabel.setText(retries>0?"Reconnecting… attempt "+(retries+1):"Connecting to room…");
    try{
      Request request=new Request.Builder().url("wss://xp404.onrender.com/ws").header("Origin",BASE).build();
      socket=http.newWebSocket(request,new WebSocketListener(){
        @Override public void onOpen(WebSocket ws,Response response){
          ui.post(()->{if(destroyed||n!=generation)return;
            try{JSONObject msg=new JSONObject();msg.put("type",connectionRequest);
              if(connectionRequest.equals("resume"))msg.put("token",token);
              else{msg.put("name",getPreferences(0).getString("name","Host"));if(connectionRequest.equals("join"))msg.put("code",joinCode);}
              ws.send(msg.toString());
            }catch(Exception e){statusMessage(e.getMessage());}
          });
        }
        @Override public void onMessage(WebSocket ws,String value){ui.post(()->{if(!destroyed&&n==generation)handleMessage(value);});}
        @Override public void onFailure(WebSocket ws,Throwable error,Response response){
          ui.post(()->{if(!destroyed&&n==generation)retryConnection();});}
        @Override public void onClosed(WebSocket ws,int code,String reason){
          ui.post(()->{if(!destroyed&&n==generation)retryConnection();});}
      });
    }catch(Exception e){retryConnection();}
  }
  private void retryConnection(){
    if(destroyed)return;
    retries++;statusMessage("Room connection interrupted · retrying ("+retries+")");
    long delay=Math.min(15000,1000L*(1L<<Math.min(retries,4)));
    ui.postDelayed(()->{if(!destroyed){if(!token.isEmpty()&&!roomCode.isEmpty()&&room!=null)connectionRequest="resume";openSocket();}},delay);
  }
  private void send(String type,JSONObject extra){
    if(socket==null)return;
    try{JSONObject m=extra==null?new JSONObject():extra;m.put("type",type);socket.send(m.toString());}catch(Exception ignored){}
  }
  private JSONObject obj(Object... fields){
    JSONObject o=new JSONObject();try{for(int i=0;i+1<fields.length;i+=2)o.put((String)fields[i],fields[i+1]);}catch(Exception ignored){}return o;
  }
  private void handleMessage(String raw){
    try{
      JSONObject m=new JSONObject(raw);String kind=m.optString("type");
      switch(kind){
        case "welcome":{
          myId=m.optString("id");token=m.optString("token");room=m.optJSONObject("room");
          roomCode=room.optString("code");
          getPreferences(0).edit().putString("token",token).putString("room",roomCode).apply();
          retries=0;showRoom();renderRoomState();
          JSONObject skip=room.optJSONObject("skipVoting");
          if(myId.equals(room.optString("hostId"))&&(skip==null||!skip.optBoolean("enabled")))
            send("skip-settings",obj("enabled",true));
          JSONArray history=m.optJSONArray("history");if(history!=null){chatHistory=history;renderChat();}
          break;
        }
        case "state":room=m.optJSONObject("room");if(room!=null&&stage!=null)renderRoomState();break;
        case "playback": case "anchor":{
          if(room!=null){JSONObject pb=m.optJSONObject("playback");if(pb!=null){
            try{room.put("playback",pb);}catch(Exception ignored){}
            syncPlayback(pb,true);
          }}break;
        }
        case "chat":chatHistory.put(m);if(chatRows!=null)renderChat();break;
        case "pong":{long sent=m.optLong("sent",0);long at=m.optLong("serverTime",0);
          if(sent>0&&at>0)serverOffsetMs=((sent+System.currentTimeMillis())/2.0)-at;break;}
        case "resume-failed":token="";getPreferences(0).edit().remove("token").apply();statusMessage("Room expired. Create or join again.");showLobby();break;
        case "ended":case "kicked":statusMessage(m.optString("message","Room closed"));showLobby();break;
        case "error":statusMessage(m.optString("message","Request failed"));break;
        default:break;
      }
    }catch(Exception e){statusMessage("Server reply could not be read");}
  }
  private void statusMessage(String s){
    if(connectionLabel!=null&&room==null)connectionLabel.setText(s);
    if(playbackStatus!=null&&room!=null)playbackStatus.setText(s);
  }
  private boolean host(){return room!=null&&myId.equals(room.optString("hostId"));}
  private void showRoom(){
    buildBackground();
    content=vertical();background.addView(content,new FrameLayout.LayoutParams(-1,-1));
    header=horizontal();header.setPadding(dp(8),dp(8),dp(8),dp(8));header.setBackgroundColor(0xee161321);
    header.addView(button("✕",()->leaveRoom()),new LinearLayout.LayoutParams(dp(46),dp(46)));
    header.addView(button("⚙",()->showSettings()),new LinearLayout.LayoutParams(dp(48),dp(46)));
    header.addView(button("⌕",()->showSourceSheet()),new LinearLayout.LayoutParams(dp(48),dp(46)));
    header.addView(appTitle(),new LinearLayout.LayoutParams(0,dp(46),1));
    header.addView(button("➤",()->showSourceSheet()),new LinearLayout.LayoutParams(dp(46),dp(46)));
    header.addView(button("☷",()->showParticipants()),new LinearLayout.LayoutParams(dp(46),dp(46)));
    content.addView(header,new LinearLayout.LayoutParams(-1,dp(64)));
    stage=new FrameLayout(this);stage.setBackgroundColor(Color.BLACK);
    content.addView(stage,new LinearLayout.LayoutParams(-1,dp(238)));
    player=new ExoPlayer.Builder(this).build();
    playerView=new PlayerView(this);playerView.setUseController(false);playerView.setPlayer(player);
    playerView.setResizeMode(androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT);
    stage.addView(playerView,new FrameLayout.LayoutParams(-1,-1));
    playbackStatus=text("Waiting for video",12,Color.WHITE,true);
    playbackStatus.setPadding(dp(8),dp(3),dp(8),dp(3));
    playbackStatus.setBackground(shape(0xaa201b37,0,14));
    FrameLayout.LayoutParams sp=new FrameLayout.LayoutParams(-2,dp(32),Gravity.TOP|Gravity.RIGHT);
    sp.setMargins(0,dp(12),dp(10),0);stage.addView(playbackStatus,sp);
    player.addListener(new Player.Listener(){
      @Override public void onRenderedFirstFrame(){receivedFrame=true;lastFrame=SystemClock.elapsedRealtime();recovered=false;statusMessage("Video ready");}
      @Override public void onPlayerError(PlaybackException e){statusMessage("This stream cannot be decoded on this device");}
      @Override public void onPlaybackStateChanged(int state){if(state==Player.STATE_READY&&currentType.equals("iptv")&&!receivedFrame)checkVideoFrames();}
    });
    LinearLayout controls=horizontal();controls.setPadding(dp(6),dp(7),dp(6),dp(7));controls.setBackgroundColor(0xd51b1725);
    playToggle=button("▶",()->togglePlayback());controls.addView(playToggle,new LinearLayout.LayoutParams(dp(55),dp(44)));
    watchTitle=text("Choose a video",13,TEXT,true);
    LinearLayout.LayoutParams wt=new LinearLayout.LayoutParams(0,dp(45),1);wt.leftMargin=dp(8);controls.addView(watchTitle,wt);
    skipButton=button("⏭",()->voteSkip());controls.addView(skipButton,new LinearLayout.LayoutParams(dp(52),dp(44)));
    controls.addView(button("▣",()->showSourceSheet()),new LinearLayout.LayoutParams(dp(52),dp(44)));
    content.addView(controls,new LinearLayout.LayoutParams(-1,dp(60)));
    roomInfo=text("  Live room · "+roomCode+"     Video call     Chat",13,MUTED,true);
    content.addView(roomInfo,new LinearLayout.LayoutParams(-1,dp(45)));
    chatScroll=new ScrollView(this);chatScroll.setFillViewport(true);chatRows=vertical();
    chatRows.setPadding(dp(12),dp(12),dp(12),dp(10));chatScroll.addView(chatRows);
    content.addView(chatScroll,new LinearLayout.LayoutParams(-1,0,1));
    composer=horizontal();composer.setPadding(dp(4),dp(5),dp(4),dp(5));composer.setBackgroundColor(0xee21182b);
    composer.addView(button("🎙",()->microphone()),new LinearLayout.LayoutParams(dp(53),dp(50)));
    chatField=new EditText(this);chatField.setSingleLine(false);chatField.setMaxLines(3);
    chatField.setTextSize(15);chatField.setTextColor(TEXT);chatField.setHintTextColor(MUTED);
    chatField.setHint("Message");chatField.setBackground(shape(PANEL,0,15));chatField.setPadding(dp(8),dp(6),dp(8),dp(6));
    composer.addView(chatField,new LinearLayout.LayoutParams(0,dp(50),1));
    composer.addView(button("☺",()->emojiPicker()),new LinearLayout.LayoutParams(dp(49),dp(50)));
    composer.addView(button("➤",()->sendChat()),new LinearLayout.LayoutParams(dp(49),dp(50)));
    content.addView(composer,new LinearLayout.LayoutParams(-1,dp(62)));
    content.getViewTreeObserver().addOnGlobalLayoutListener(()->{
      android.graphics.Rect r=new android.graphics.Rect();content.getWindowVisibleDisplayFrame(r);
      int hidden=content.getRootView().getHeight()-r.bottom;
      boolean keyboard=hidden>dp(155);header.setVisibility(keyboard?View.GONE:View.VISIBLE);
    });
    ui.postDelayed(this::syncLoop,1800);
  }
  private void leaveRoom(){
    send("leave",null);generation++;if(socket!=null){socket.close(1000,"Leave");socket=null;}
    token="";getPreferences(0).edit().remove("token").apply();showLobby();
  }
  private void renderRoomState(){
    if(room==null)return;
    roomInfo.setText("  Room "+room.optString("code")+"   •   "+(room.optJSONArray("people")==null?0:room.optJSONArray("people").length())+" watching   •   Chat");
    JSONObject source=room.optJSONObject("source");
    if(source==null){watchTitle.setText("Choose a video");clearSource();playbackStatus.setText("Waiting for video");}
    else{
      watchTitle.setText(source.optString("title",source.optString("type","Video")));
      String id=source.optString("id");
      if(!id.equals(currentSourceId)){currentSourceId=id;currentType=source.optString("type");loadSource(source);}
      syncPlayback(room.optJSONObject("playback"),false);
    }
    JSONObject skip=room.optJSONObject("skipVoting");
    skipButton.setVisibility(skip!=null&&skip.optBoolean("enabled")?View.VISIBLE:View.GONE);
    renderChat();
  }
  private void clearSource(){
    currentSourceId="";currentType="";youtubeId="";
    if(youtubeFrame!=null){stage.removeView(youtubeFrame);youtubeFrame.destroy();youtubeFrame=null;}
    if(player!=null){player.stop();player.clearMediaItems();}
    if(ambient!=null)ambient.setImageDrawable(null);
  }
  private void clearPlayback(){
    if(youtubeFrame!=null){youtubeFrame.destroy();youtubeFrame=null;}
    if(player!=null){player.release();player=null;}
  }
  private void loadSource(JSONObject source){
    if(youtubeFrame!=null){stage.removeView(youtubeFrame);youtubeFrame.destroy();youtubeFrame=null;}
    player.stop();player.clearMediaItems();receivedFrame=false;recovered=false;lastFrame=SystemClock.elapsedRealtime();
    String type=source.optString("type"),url=source.optString("url");
    if(type.equals("youtube")){
      youtubeId=source.optString("videoId");
      if(!youtubeId.matches("[\\w-]{11}")){statusMessage("Video ID unavailable");return;}
      youtubeFrame=new WebView(this);
      youtubeFrame.setBackgroundColor(Color.BLACK);WebSettings settings=youtubeFrame.getSettings();
      settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setMediaPlaybackRequiresUserGesture(false);
      youtubeFrame.setWebChromeClient(new WebChromeClient());youtubeFrame.setWebViewClient(new WebViewClient());
      stage.addView(youtubeFrame,0,new FrameLayout.LayoutParams(-1,-1));
      String html="<html><head><meta name='viewport' content='width=device-width,initial-scale=1,user-scalable=no'/></head>"+
        "<body style='margin:0;background:black;overflow:hidden'><div id='yt'></div>"+
        "<script>var p,ready=false;function onYouTubeIframeAPIReady(){p=new YT.Player('yt',{width:'100%',height:'100%',"+
        "videoId:'"+youtubeId+"',playerVars:{playsinline:1,controls:1,rel:0,origin:'https://xp404.onrender.com'},events:{onReady:function(){ready=true;}}});}"+
        "var s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';document.head.appendChild(s);"+
        "function xpartySync(seconds,play){if(!ready)return;try{var diff=Math.abs(p.getCurrentTime()-seconds);"+
        "if(diff>1.2)p.seekTo(seconds,true);if(play&&p.getPlayerState()!==1)p.playVideo();"+
        "if(!play&&p.getPlayerState()===1)p.pauseVideo();}catch(e){}}</script></body></html>";
      youtubeFrame.loadDataWithBaseURL(BASE+"/",html,"text/html","UTF-8",null);
      Glide.with(this).load("https://i.ytimg.com/vi/"+youtubeId+"/hqdefault.jpg").into(ambient);
      statusMessage("YouTube · connecting");
    }else if(type.equals("iptv")||type.equals("direct")){
      if(!url.startsWith("https://")){statusMessage("HTTPS stream required");return;}
      try{player.setMediaItem(MediaItem.fromUri(Uri.parse(url)));player.prepare();player.play();statusMessage("Live TV · loading picture");}
      catch(Exception e){statusMessage("Video format unsupported");}
      String logo=source.optString("logo");
      if(logo.startsWith("https://"))Glide.with(this).load(logo).into(ambient);
    }else{statusMessage("This source is not implemented in native preview");}
  }
  private void checkVideoFrames(){
    final String id=currentSourceId;
    ui.postDelayed(()->{
      if(destroyed||player==null||!currentSourceId.equals(id)||!currentType.equals("iptv"))return;
      if(!receivedFrame&&player.isPlaying()){
        if(!recovered){recovered=true;statusMessage("Recovering video picture…");player.stop();player.prepare();player.play();checkVideoFrames();}
        else{statusMessage("Audio detected without picture · try another channel");player.pause();}
      }
    },8500);
  }
  private void syncPlayback(JSONObject pb,boolean immediate){
    if(pb==null||currentSourceId.isEmpty())return;
    boolean playing=pb.optBoolean("playing",false);
    double time=pb.optDouble("position",0)*1000;
    long updated=pb.optLong("updatedAt",System.currentTimeMillis());
    if(playing)time+=Math.max(0,System.currentTimeMillis()-serverOffsetMs-updated);
    final long expected=Math.max(0,(long)time);
    if(playToggle!=null)playToggle.setText(playing?"Ⅱ":"▶");
    if(currentType.equals("youtube")&&youtubeFrame!=null){
      if(immediate||SystemClock.elapsedRealtime()-lastSyncRequest>2200){
        lastSyncRequest=SystemClock.elapsedRealtime();
        youtubeFrame.evaluateJavascript("if(window.xpartySync)xpartySync("+expected/1000.0+","+(playing?"true":"false")+")",null);
      }
    }else if((currentType.equals("iptv")||currentType.equals("direct"))&&player!=null){
      if(!player.isCurrentMediaItemLive()&&!currentType.equals("iptv")){
        long diff=expected-player.getCurrentPosition();
        if(Math.abs(diff)>1200)player.seekTo(expected);
        else if(Math.abs(diff)>300&&playing)player.setPlaybackSpeed(diff>0?1.025f:.975f);
        else player.setPlaybackSpeed(1f);
      }
      if(playing&&!player.isPlaying())player.play();
      else if(!playing&&player.isPlaying())player.pause();
    }
  }
  private void syncLoop(){
    if(destroyed||room==null||player==null)return;
    syncPlayback(room.optJSONObject("playback"),false);
    ui.postDelayed(this::syncLoop,2100);
  }
  private void togglePlayback(){
    JSONObject pb=room==null?null:room.optJSONObject("playback");
    if(pb==null||currentSourceId.isEmpty())return;
    boolean play=!pb.optBoolean("playing",false);
    double pos=currentType.equals("youtube")?pb.optDouble("position",0):player.getCurrentPosition()/1000.0;
    send("playback",obj("sourceId",currentSourceId,"position",pos,"playing",play));
  }
  private void voteSkip(){
    if(room==null||currentSourceId.isEmpty())return;
    send("skip-vote",obj("sourceId",currentSourceId));toast("Vote recorded when a next video is queued");
  }
  private void sendChat(){
    if(room==null||chatField==null)return;
    String value=chatField.getText().toString().trim();
    if(value.isEmpty())return;
    send("chat",obj("text",value,"clientId",UUID.randomUUID().toString()));chatField.setText("");
  }
  private void renderChat(){
    if(chatRows==null||room==null)return;
    if(lastDisplayedMessages>chatHistory.length())lastDisplayedMessages=0;
    if(lastDisplayedMessages==0)chatRows.removeAllViews();
    for(int i=lastDisplayedMessages;i<chatHistory.length();i++){
      JSONObject msg=chatHistory.optJSONObject(i);if(msg==null)continue;
      String name=msg.optString("name","Guest"),value=msg.optString("text");
      if(value.isEmpty())continue;
      boolean mine=msg.optString("from").equals(myId);
      TextView bubble=text((mine?"You":name)+"\n"+value,14,TEXT,false);
      bubble.setPadding(dp(14),dp(10),dp(14),dp(10));
      bubble.setBackground(shape(mine?0xff49345f:PANEL,0,15));
      LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,-2);
      lp.gravity=mine?Gravity.RIGHT:Gravity.LEFT;lp.bottomMargin=dp(8);
      lp.leftMargin=mine?dp(60):0;lp.rightMargin=mine?0:dp(60);chatRows.addView(bubble,lp);
    }
    lastDisplayedMessages=chatHistory.length();
    if(chatScroll!=null)chatScroll.post(()->chatScroll.fullScroll(View.FOCUS_DOWN));
  }
  private void microphone(){
    if(Build.VERSION.SDK_INT>=23&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
      requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},101);return;
    }
    toast("Mic permission ready; native voice calling is not yet connected");
  }
  @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){
    super.onRequestPermissionsResult(request,permissions,results);
    if(request==101)toast(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED?
      "Mic permission granted · voice calling not yet active":"Mic permission not granted");
  }
  private void emojiPicker(){
    if(chatField==null)return;
    String[][] categories={
      {"Smileys","😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🫢 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🥳 😎 🤓 🧐 😕 🫤 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿"},
      {"Hearts","❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 🩷 🩵 🩶 💔 ❤️‍🔥 ❤️‍🩹 💕 💞 💓 💗 💖 💘 💝 💟 ❣️ 💌 💋 💯 ✨ 🌟 ⭐"},
      {"Hands","👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💪"},
      {"People","👶 🧒 👦 👧 🧑 👨 👩 🧔 👵 👴 👮 👷 💂 🕵️ 👩‍⚕️ 👨‍🍳 👩‍🎓 👨‍💻 👩‍🚀 🧙 🧚 🧜 🧛 🧟 💃 🕺 🚶 🏃 🧘"},
      {"Food","🍎 🍏 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🍆 🥦 🌽 🥕 🍞 🥐 🥨 🧀 🍔 🍟 🍕 🌮 🌯 🍿 🍝 🍜 🍣 🍱 🍛 🍰 🎂 🍩 🍪 ☕ 🧋"},
      {"Fun","⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🎮 🎲 🎯 🎳 🎸 🎹 🎻 🥁 🎤 🎧 🎬 🎨 🎭 🎪 🎉 🎊 🎁 🏆 🥇 🥈 🥉"},
      {"Nature","🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦆 🦅 🦉 🦄 🐝 🦋 🐢 🐍 🦖 🐬 🐳 🦈 🦀 🌸 🌻 🌹 🌈 ☀️ 🌙"}
    };
    Dialog dialog=new Dialog(this);LinearLayout layout=vertical();layout.setPadding(dp(10),dp(9),dp(10),dp(12));
    layout.setBackground(shape(PANEL,0xff685079,18));LinearLayout tabs=horizontal();ScrollView sc=new ScrollView(this);
    GridLayout grid=new GridLayout(this);grid.setColumnCount(7);grid.setPadding(dp(2),dp(6),dp(2),dp(8));sc.addView(grid);
    java.util.function.IntConsumer populate=i->{
      grid.removeAllViews();
      for(String symbol:categories[i][1].split(" ")){
        TextView b=text(symbol,25,TEXT,false);b.setGravity(Gravity.CENTER);
        b.setOnClickListener(v->{chatField.getText().insert(chatField.getSelectionStart(),symbol);dialog.dismiss();});
        grid.addView(b,new ViewGroup.LayoutParams(dp(44),dp(44)));
      }
    };
    for(int i=0;i<categories.length;i++){final int index=i;TextView b=button(categories[i][0].substring(0,Math.min(3,categories[i][0].length())),()->populate.accept(index));
      tabs.addView(b,new LinearLayout.LayoutParams(0,dp(41),1));}
    add(layout,tabs,8);layout.addView(sc,new LinearLayout.LayoutParams(-1,dp(285)));populate.accept(0);
    dialog.setContentView(layout);dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
    dialog.getWindow().setLayout(-1,-2);dialog.getWindow().setGravity(Gravity.BOTTOM);dialog.show();
    dialog.getWindow().setLayout(-1,-2);
  }
  private void showParticipants(){
    if(room==null)return;
    JSONArray people=room.optJSONArray("people");if(people==null)return;
    StringBuilder sb=new StringBuilder("ROOM "+roomCode+"\n");
    for(int i=0;i<people.length();i++){JSONObject p=people.optJSONObject(i);
      sb.append("\n").append(p.optString("id").equals(room.optString("hostId"))?"♛  ":"●  ")
        .append(p.optString("name")).append(p.optBoolean("online")?"  online":"  offline");
    }
    new android.app.AlertDialog.Builder(this).setTitle("Participants").setMessage(sb.toString()).setPositiveButton("Done",null).show();
  }
  private void showSettings(){
    final String[] choices={"Source tiles · 2 columns","Source tiles · 3 columns","Source tiles · 1 column",
      "Turn on majority skip votes","Turn off majority skip votes","Resynchronize picture"};
    new android.app.AlertDialog.Builder(this).setTitle("XParty settings").setItems(choices,(d,n)->{
      if(n<=2){tileColumns=n==0?2:n==1?3:1;getPreferences(0).edit().putInt("tiles",tileColumns).apply();toast("Source tiles updated");}
      if(n==3||n==4){if(host())send("skip-settings",obj("enabled",n==3));else toast("Only the host can change voting");}
      if(n==5){send("resync",null);toast("Synchronizing playback");}
    }).setNegativeButton("Close",null).show();
  }
  private void showSourceSheet(){
    if(room==null)return;
    if(sourceDialog!=null&&sourceDialog.isShowing())sourceDialog.dismiss();
    sourceDialog=new Dialog(this);
    LinearLayout sheet=vertical();sheet.setPadding(dp(10),dp(14),dp(10),dp(8));
    sheet.setBackground(shape(PANEL,0xff594869,24));
    LinearLayout bar=horizontal();bar.addView(text("  SOURCES",17,TEXT,true),new LinearLayout.LayoutParams(0,dp(45),1));
    bar.addView(button("▦",()->showSettings()),new LinearLayout.LayoutParams(dp(52),dp(43)));
    bar.addView(button("✕",()->sourceDialog.dismiss()),new LinearLayout.LayoutParams(dp(52),dp(43)));
    add(sheet,bar,7);
    LinearLayout tabs=horizontal();String[] labels={"▶ YT","◉ TV","♡ SAVED","▣ APPS"};
    String[] keys={"youtube","iptv","saved","apps"};
    for(int i=0;i<4;i++){final String k=keys[i];TextView b=button(labels[i],()->{sourceTab=k;refreshSourceSheet();});
      tabs.addView(b,new LinearLayout.LayoutParams(0,dp(48),1));}
    add(sheet,tabs,8);
    ScrollView scroll=new ScrollView(this);scroll.setFillViewport(false);
    LinearLayout body=vertical();body.setTag("sheetBody");scroll.addView(body);
    sheet.addView(scroll,new LinearLayout.LayoutParams(-1,dp(440)));
    sourceDialog.setContentView(sheet);sourceDialog.show();sourceDialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
    sourceDialog.getWindow().setGravity(Gravity.BOTTOM);sourceDialog.getWindow().setLayout(-1,-2);
    refreshSourceSheet();
  }
  private LinearLayout sheetBody(){
    View v=sourceDialog.getWindow().getDecorView().findViewWithTag("sheetBody");return v instanceof LinearLayout?(LinearLayout)v:null;
  }
  private void refreshSourceSheet(){
    LinearLayout body=sheetBody();if(body==null)return;body.removeAllViews();
    if(sourceTab.equals("youtube")){
      LinearLayout search=horizontal();
      EditText input=new EditText(this);input.setSingleLine(true);input.setTextColor(TEXT);input.setHintTextColor(MUTED);
      input.setTextSize(15);input.setHint("Search YouTube videos");
      input.setBackground(shape(0xff1b1527,0xff634e80,15));input.setPadding(dp(10),dp(8),dp(10),dp(8));
      search.addView(input,new LinearLayout.LayoutParams(0,dp(50),1));
      search.addView(button("⌕",()->searchYouTube(input.getText().toString())),new LinearLayout.LayoutParams(dp(55),dp(50)));
      add(body,search,10);
      if(!results.isEmpty()){add(body,text("VIDEOS · "+results.size()+" results",12,MUTED,true),9);addTiles(body,results);}
    }else if(sourceTab.equals("iptv")){
      add(body,text("LIVE IPTV · pick a category",14,MUTED,true),10);
      LinearLayout cats=horizontal();
      for(String s:new String[]{"movies","entertainment","news","music"}){
        TextView b=button(s.substring(0,1).toUpperCase()+s.substring(1),()->loadChannels(s));
        cats.addView(b,new LinearLayout.LayoutParams(0,dp(48),1));
      }add(body,cats,12);
      if(!results.isEmpty())addTiles(body,results);
      else loadChannels("movies");
    }else if(sourceTab.equals("saved")){
      add(body,text("Saved video and channel shortcuts",14,MUTED,true),10);
      addTiles(body,savedSources);
    }else{
      add(body,text("OFFICIAL STREAMING APPS",14,MUTED,true),12);
      add(body,button("Netflix ↗  Open official app / site",()->openOfficial("https://www.netflix.com/")),10);
      add(body,button("Prime Video ↗  Open official app / site",()->openOfficial("https://www.primevideo.com/")),10);
      add(body,text("Protected streams remain within the provider's authorized app. XParty does not copy or capture DRM video.",12,MUTED,false),6);
    }
  }
  private void openOfficial(String url){
    try{Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse(url));startActivity(intent);}
    catch(Exception e){toast("No app available to open this link");}
  }
  private void addTiles(LinearLayout body,ArrayList<JSONObject> data){
    if(data.isEmpty()){add(body,text("No videos here yet",13,MUTED,false),6);return;}
    GridLayout grid=new GridLayout(this);grid.setColumnCount(tileColumns);
    int width=getResources().getDisplayMetrics().widthPixels-dp(32);
    int cardW=(width-dp((tileColumns-1)*9))/tileColumns;
    for(JSONObject item:data){
      String kind=item.optString("kind","youtube");
      LinearLayout card=vertical();card.setPadding(dp(5),dp(5),dp(5),dp(5));
      card.setBackground(shape(PANEL2,0xff5f4c73,15));
      ImageView cover=new ImageView(this);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
      String thumbnail=item.optString("thumbnail");
      if(thumbnail.isEmpty()&&kind.equals("youtube"))thumbnail="https://i.ytimg.com/vi/"+item.optString("id")+"/mqdefault.jpg";
      if(!thumbnail.isEmpty())Glide.with(this).load(thumbnail).into(cover);
      card.addView(cover,new LinearLayout.LayoutParams(-1,Math.max(dp(66),(int)(cardW*.56))));
      TextView title=text(item.optString("title","Video"),tileColumns==3?11:14,TEXT,true);
      title.setMaxLines(2);title.setEllipsize(android.text.TextUtils.TruncateAt.END);
      add(card,title,4);
      TextView sub=text((kind.equals("iptv")?"●  ":"")+item.optString("channel",kind.equals("iptv")?"Unverified / restricted":"YouTube")
        +(item.optString("duration").isEmpty()?"":"  ·  "+item.optString("duration")),11,kind.equals("iptv")?0xffe5bd47:MUTED,false);
      sub.setMaxLines(2);add(card,sub,6);
      TextView save=button("♡  Save",()->toggleSaved(item));
      card.addView(save,new LinearLayout.LayoutParams(-1,dp(36)));
      cover.setOnClickListener(v->selectSource(item));title.setOnClickListener(v->selectSource(item));
      GridLayout.LayoutParams param=new GridLayout.LayoutParams();
      param.width=cardW-dp(5);param.height=-2;param.setMargins(dp(2),dp(3),dp(3),dp(7));
      grid.addView(card,param);
    }add(body,grid,10);
  }
  private void selectSource(JSONObject item){
    JSONObject s=new JSONObject();
    try{
      String kind=item.optString("kind","youtube");s.put("type",kind);
      s.put("title",item.optString("title"));
      if(kind.equals("youtube"))s.put("videoId",item.optString("id"));
      if(kind.equals("iptv")){s.put("url",item.optString("url"));if(!item.optString("thumbnail").isEmpty())s.put("logo",item.optString("thumbnail"));}
    }catch(Exception ignored){}
    send("source",obj("source",s));
    if(sourceDialog!=null)sourceDialog.dismiss();
  }
  private void searchYouTube(String q){
    q=q.trim();if(q.length()<2){toast("Enter at least two letters");return;}
    final String query=q;
    io.execute(()->{
      try{
        JSONObject data=getJSON(BASE+"/api/search?q="+URLEncoder.encode(query,"UTF-8"),token);
        JSONArray items=data.optJSONArray("items");ArrayList<JSONObject> list=new ArrayList<>();
        if(items!=null)for(int i=0;i<items.length();i++){
          JSONObject j=items.optJSONObject(i);if(j!=null){j.put("kind","youtube");list.add(j);}
        }
        ui.post(()->{if(destroyed)return;results.clear();results.addAll(list);refreshSourceSheet();});
      }catch(Exception e){ui.post(()->toast("YouTube search unavailable: "+e.getMessage()));}
    });
  }
  private JSONObject getJSON(String url,String bearer)throws Exception{
    HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
    c.setConnectTimeout(12000);c.setReadTimeout(15000);c.setRequestProperty("Accept","application/json");
    if(!bearer.isEmpty())c.setRequestProperty("Authorization","Bearer "+bearer);
    try(InputStream stream=c.getInputStream()){
      return new JSONObject(new String(stream.readAllBytes(),StandardCharsets.UTF_8));
    }finally{c.disconnect();}
  }
  private void loadChannels(String category){
    final String cat=category;
    io.execute(()->{
      ArrayList<JSONObject> list=new ArrayList<>();
      try{
        URL url=new URL("https://iptv-org.github.io/iptv/categories/"+cat+".m3u");
        HttpURLConnection c=(HttpURLConnection)url.openConnection();
        c.setConnectTimeout(10000);c.setReadTimeout(12000);
        try(BufferedReader r=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
          String line,title="",logo="";
          while((line=r.readLine())!=null&&list.size()<90){
            if(line.startsWith("#EXTINF:")){int comma=line.lastIndexOf(',');
              title=comma>=0?line.substring(comma+1).trim():"Live channel";
              int at=line.indexOf("tvg-logo=\"");logo="";
              if(at>=0){int end=line.indexOf('"',at+10);if(end>at)logo=line.substring(at+10,end);}
            }else if(line.startsWith("https://")&&!title.isEmpty()){
              JSONObject j=obj("kind","iptv","title",title,"url",line.trim(),"thumbnail",logo,"channel","Unverified / restricted");
              list.add(j);title="";logo="";
            }
          }
        }finally{c.disconnect();}
        ui.post(()->{if(destroyed||!sourceTab.equals("iptv"))return;
          results.clear();results.addAll(list);LinearLayout body=sheetBody();if(body!=null){body.removeAllViews();
            add(body,button("←  Categories",()->{results.clear();refreshSourceSheet();}),10);
            add(body,text(cat.toUpperCase()+" · "+list.size()+" channels    🟡 Unverified",13,MUTED,true),8);addTiles(body,results);
          }
        });
      }catch(Exception e){ui.post(()->toast("Channel directory unavailable · check network"));}
    });
  }
  private void loadSaved(){
    savedSources.clear();
    try{JSONArray a=new JSONArray(getPreferences(0).getString("saved","[]"));
      for(int i=0;i<a.length();i++){JSONObject j=a.optJSONObject(i);if(j!=null)savedSources.add(j);}
    }catch(Exception ignored){}
  }
  private void toggleSaved(JSONObject item){
    String key=item.optString("kind","youtube")+":"+item.optString("id",item.optString("url"));
    int exists=-1;for(int i=0;i<savedSources.size();i++){
      JSONObject s=savedSources.get(i);String k=s.optString("kind","youtube")+":"+s.optString("id",s.optString("url"));
      if(k.equals(key)){exists=i;break;}
    }
    if(exists>=0){savedSources.remove(exists);toast("Removed from saved");}
    else{savedSources.add(item);toast("Saved");}
    JSONArray a=new JSONArray();for(JSONObject x:savedSources)a.put(x);
    getPreferences(0).edit().putString("saved",a.toString()).apply();
  }
  @Override public void onBackPressed(){
    if(sourceDialog!=null&&sourceDialog.isShowing()){sourceDialog.dismiss();return;}
    if(room!=null){new android.app.AlertDialog.Builder(this).setMessage("Leave this room?").setPositiveButton("Leave",(d,w)->leaveRoom()).setNegativeButton("Cancel",null).show();}
    else super.onBackPressed();
  }
  @Override protected void onDestroy(){
    destroyed=true;generation++;if(socket!=null)socket.cancel();clearPlayback();
    ui.removeCallbacksAndMessages(null);io.shutdownNow();http.dispatcher().executorService().shutdown();
    super.onDestroy();
  }
}
