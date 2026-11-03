package com.pkx404.xparty.nativeapp;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import android.text.Editable;
import android.text.TextWatcher;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.UUID;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * A genuinely native Android app: Android widgets, Media3 playback, WebRTC calls,
 * OkHttp socket room protocol, camera/mic and system file picker.
 * The lone YouTube surface uses its official iframe for provider compliance.
 */
public final class MainActivity extends Activity implements RoomSocket.Events,NativePlayer.Callbacks {
    private static final int REQ_MIC=11,REQ_CAMERA=12,REQ_FILE=13;
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newFixedThreadPool(2);
    private final OkHttpClient client=new OkHttpClient();
    private FrameLayout root,videoBox,playerSurface,callSurface;
    private LinearLayout app,home,roomPage,roomHeader,roomBody,chatRows,composerActions,playerControls,seekStrip,watchingPanel;
    private ScrollView chatScroll,exploreScroll;
    private TextView connection,roomLabel,playbackStatus,emptyVideo,fullButton,playButton,titleLabel,peopleLabel,sendButton,heartButton,homeTitle;
    private TextView exploreTab,inviteTab,watchingSummary,roomFooter;
    private EditText nickname,inviteCode,chatInput;
    private SeekBar seek;
    private RoomSocket socket;
    private SourcePicker sourcePicker;
    private NativePlayer video;
    private NativeCall call;
    private LocalFileUploader uploader;
    private JSONObject currentRoom,currentSource;
    private String myId="",sourceKey="",currentName="Guest",currentPage="explore";
    private boolean inRoom=false,fullscreen=false,controlsShown=true,keyboardOpen=false,locallyPaused=false;
    private boolean isHost=false,seekDragging=false;
    private Uri pendingVideo=null;
    private long pendingVideoSize=0;
    private String uploadingSource="";
    private final HashSet<String> seenMessages=new HashSet<>();
    private final Runnable hideControls=()->{controlsShown=false;if(playerControls!=null)playerControls.setVisibility(View.GONE);};
    private final Runnable ticker=new Runnable(){
        @Override public void run(){
            if(inRoom&&video!=null&&video.hasSource())refreshTimeline();
            ui.postDelayed(this,350);
        }
    };

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        getWindow().setStatusBarColor(NativeUi.BG);getWindow().setNavigationBarColor(NativeUi.BG);
        socket=new RoomSocket(this,BuildConfig.DEFAULT_BACKEND,this);
        uploader=new LocalFileUploader(this);
        sourcePicker=new SourcePicker(this,socket,new SourcePicker.Result(){
            @Override public void source(JSONObject item){chooseSource(item);}
            @Override public void localFile(){openLocalVideo();}
            @Override public void message(String message){toast(message);}
        });
        build();
        socket.resumeIfPossible();
        ui.post(ticker);
    }
    private int px(int d){return NativeUi.dp(this,d);}
    private LinearLayout.LayoutParams weight(){return new LinearLayout.LayoutParams(0,-2,1f);}
    private void build(){
        root=new FrameLayout(this);root.setBackgroundColor(NativeUi.BG);
        app=NativeUi.vertical(this);root.addView(app,new FrameLayout.LayoutParams(-1,-1));
        setContentView(root);
        home=NativeUi.vertical(this);roomPage=NativeUi.vertical(this);
        app.addView(home,new LinearLayout.LayoutParams(-1,-1));
        app.addView(roomPage,new LinearLayout.LayoutParams(-1,-1));roomPage.setVisibility(View.GONE);
        buildHome();buildRoom();
        root.getViewTreeObserver().addOnGlobalLayoutListener(()->{
            Rect r=new Rect();root.getWindowVisibleDisplayFrame(r);
            int rootHeight=root.getRootView().getHeight();
            boolean shown=rootHeight-r.bottom>px(170);
            if(shown!=keyboardOpen){
                keyboardOpen=shown;
                updateComposer();
                if(shown)ui.postDelayed(this::scrollChatToBottom,140);
            }
        });
    }
    private void buildHome(){
        home.setPadding(px(18),px(16),px(18),px(12));
        LinearLayout bar=NativeUi.horizontal(this);
        homeTitle=NativeUi.text(this,"XPARTY",32,true);homeTitle.setTextColor(Color.WHITE);
        bar.addView(homeTitle,new LinearLayout.LayoutParams(0,px(62),1));
        TextView badge=NativeUi.label(this,"NATIVE • ANDROID",10);bar.addView(badge);
        home.addView(bar);
        LinearLayout tabs=NativeUi.horizontal(this);
        exploreTab=NativeUi.text(this,"Explore",19,true);
        inviteTab=NativeUi.text(this,"Join Invite",19,true);
        exploreTab.setGravity(Gravity.CENTER);inviteTab.setGravity(Gravity.CENTER);
        exploreTab.setOnClickListener(v->openHomeTab("explore"));
        inviteTab.setOnClickListener(v->openHomeTab("invite"));
        tabs.addView(exploreTab,weight());tabs.addView(inviteTab,weight());
        home.addView(tabs,NativeUi.lp(this,-1,56));
        FrameLayout content=new FrameLayout(this);content.setId(View.generateViewId());
        home.addView(content,new LinearLayout.LayoutParams(-1,0,1f));
        exploreScroll=new ScrollView(this);
        exploreScroll.setFillViewport(true);
        content.addView(exploreScroll,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout exploreRows=NativeUi.vertical(this);exploreScroll.addView(exploreRows);
        exploreRows.setTag("exploreRows");
        LinearLayout invite=NativeUi.vertical(this);invite.setTag("invite");
        invite.setPadding(px(4),px(28),px(4),0);
        content.addView(invite,new FrameLayout.LayoutParams(-1,-1));invite.setVisibility(View.GONE);
        TextView welcome=NativeUi.text(this,"Join your people.",27,true);
        invite.addView(welcome);NativeUi.space(this,invite,10);
        invite.addView(NativeUi.label(this,"Enter the 7-character room invite code.",14));
        NativeUi.space(this,invite,20);
        nickname=NativeUi.edit(this,"Display name (optional)");nickname.setText(getPreferences(0).getString("nickname",""));
        invite.addView(nickname,NativeUi.lp(this,-1,52));NativeUi.space(this,invite,10);
        inviteCode=NativeUi.edit(this,"Room code");inviteCode.setAllCaps(true);
        invite.addView(inviteCode,NativeUi.lp(this,-1,52));
        NativeUi.space(this,invite,14);
        invite.addView(NativeUi.button(this,"Join room",()->joinRoom(inviteCode.getText().toString())),NativeUi.lp(this,-1,52));
        NativeUi.space(this,invite,22);
        invite.addView(NativeUi.label(this,"Guest rooms are temporary. Share invitation codes only with people you trust.",13));
        connection=NativeUi.label(this,"Not connected to a room",11);
        home.addView(connection,NativeUi.lp(this,-1,20));
        TextView made4love=NativeUi.text(this,"Made4Love ♥\nINSPIRED BY AANCHAL",12,true);
        made4love.setTextColor(0xFFC7B2D0);made4love.setGravity(Gravity.CENTER);
        home.addView(made4love,NativeUi.lp(this,-1,42));
        openHomeTab("explore");
    }
    private void openHomeTab(String page){
        currentPage=page;
        LinearLayout explore=(LinearLayout)exploreScroll.getChildAt(0);
        FrameLayout parent=(FrameLayout)exploreScroll.getParent();
        LinearLayout invite=(LinearLayout)parent.findViewWithTag("invite");
        exploreScroll.setVisibility(page.equals("explore")?View.VISIBLE:View.GONE);
        invite.setVisibility(page.equals("invite")?View.VISIBLE:View.GONE);
        exploreTab.setTextColor(page.equals("explore")?NativeUi.WHITE:NativeUi.FAINT);
        inviteTab.setTextColor(page.equals("invite")?NativeUi.WHITE:NativeUi.FAINT);
        if(page.equals("explore")){
            explore.removeAllViews();
            TextView heading=NativeUi.text(this,"Watch together.",29,true);
            NativeUi.margin(this,heading,explore,22,5);
            explore.addView(NativeUi.label(this,"Live rooms, videos and people to discover.",14));
            NativeUi.space(this,explore,18);
            explore.addView(NativeUi.button(this,"＋  Create a watch room",()->createRoom()),NativeUi.lp(this,-1,52));
            NativeUi.space(this,explore,25);
            explore.addView(NativeUi.text(this,"Public rooms",19,true));
            NativeUi.space(this,explore,12);
            TextView loading=NativeUi.label(this,"Loading live rooms…",14);explore.addView(loading);
            loadExploreRooms(explore,loading);
        }
    }
    private void loadExploreRooms(LinearLayout parent,TextView placeholder){
        io.execute(()->{
            try{
                Request req=new Request.Builder().url(socket.backend()+"/api/rooms/public").get().build();
                try(Response response=client.newCall(req).execute()){
                    if(!response.isSuccessful())throw new IllegalStateException("Directory offline");
                    JSONArray rooms=new JSONObject(response.body().string()).optJSONArray("rooms");
                    runOnUiThread(()->{
                        parent.removeView(placeholder);
                        if(rooms==null||rooms.length()==0){parent.addView(NativeUi.label(this,"No public rooms yet. Create the first watch party.",14));return;}
                        for(int i=0;i<rooms.length();i++){
                            JSONObject r=rooms.optJSONObject(i);if(r==null)continue;
                            LinearLayout card=NativeUi.vertical(this);card.setBackground(NativeUi.shape(NativeUi.SURFACE,14,this));
                            card.setPadding(px(16),px(14),px(16),px(14));
                            String title=r.optString("title","Watch room");
                            card.addView(NativeUi.text(this,title,17,true));
                            JSONObject watching=r.optJSONObject("watching");
                            String watchingTitle=watching==null?"Waiting for a video":watching.optString("title","Watch together");
                            card.addView(NativeUi.label(this,watchingTitle+"  ·  "+r.optInt("people")+" watching",12));
                            NativeUi.space(this,card,6);
                            card.addView(NativeUi.button(this,"Join →",()->joinRoom(r.optString("code"))),NativeUi.lp(this,-1,44));
                            NativeUi.margin(this,card,parent,4,10);
                        }
                    });
                }
            }catch(Exception e){runOnUiThread(()->placeholder.setText("Unable to load rooms. You can still join using an invite code."));}
        });
    }
    private String nickname(){
        String n=nickname==null?"":nickname.getText().toString().trim();
        if(n.length()>24)n=n.substring(0,24);
        if(n.isEmpty())n="Guest";
        getPreferences(0).edit().putString("nickname",n).apply();
        currentName=n;return n;
    }
    private void createRoom(){socket.create(nickname());}
    private void joinRoom(String code){
        String normalized=code.trim().toUpperCase(Locale.ROOT);
        if(!normalized.matches("[A-Z2-9]{7}")){toast("Enter a valid 7-character code");openHomeTab("invite");return;}
        socket.join(normalized,nickname());
    }
    private void buildRoom(){
        roomPage.setBackgroundColor(NativeUi.BG);
        roomHeader=NativeUi.horizontal(this);roomHeader.setPadding(px(3),0,px(3),0);
        roomHeader.setBackground(new android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT,
            new int[]{0xFF521923,0xFF1A1823,0xFF261529}));
        TextView exit=NativeUi.icon(this,"×",()->confirmLeave());roomHeader.addView(exit,NativeUi.lp(this,40,48));
        TextView roomSettings=NativeUi.icon(this,"⚙",()->roomSettings());roomHeader.addView(roomSettings,NativeUi.lp(this,40,48));
        TextView controlKey=NativeUi.icon(this,"⚿",()->roomSettings());controlKey.setContentDescription("Room permissions");roomHeader.addView(controlKey,NativeUi.lp(this,36,48));
        ImageView brand=new ImageView(this);brand.setImageResource(R.drawable.xparty_wordmark);brand.setScaleType(ImageView.ScaleType.FIT_CENTER);
        brand.setAdjustViewBounds(true);brand.setContentDescription("XParty original logo");
        roomHeader.addView(brand,new LinearLayout.LayoutParams(0,px(52),1));
        TextView search=NativeUi.icon(this,"⌕",()->sourcePicker.show());search.setContentDescription("Search videos");roomHeader.addView(search,NativeUi.lp(this,36,48));
        TextView share=NativeUi.icon(this,"↗",()->shareRoom());share.setContentDescription("Share room");roomHeader.addView(share,NativeUi.lp(this,36,48));
        TextView people=NativeUi.icon(this,"♧",()->showPeople());people.setContentDescription("Participants");roomHeader.addView(people,NativeUi.lp(this,40,48));
        roomPage.addView(roomHeader,NativeUi.lp(this,-1,52));
        videoBox=new FrameLayout(this);videoBox.setBackgroundColor(Color.BLACK);
        int widthPx=getResources().getDisplayMetrics().widthPixels;
        int videoHeightPx=Math.round(widthPx*9f/16f);
        roomPage.addView(videoBox,new LinearLayout.LayoutParams(-1,videoHeightPx));
        playerSurface=new FrameLayout(this);videoBox.addView(playerSurface,new FrameLayout.LayoutParams(-1,-1));
        video=new NativePlayer(this,playerSurface,this);
        emptyVideo=NativeUi.text(this,"▶  Choose a video",18,true);
        emptyVideo.setGravity(Gravity.CENTER);
        emptyVideo.setOnClickListener(v->sourcePicker.show());
        videoBox.addView(emptyVideo,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout top=NativeUi.horizontal(this);
        FrameLayout.LayoutParams tp=new FrameLayout.LayoutParams(-2,px(40),Gravity.TOP|Gravity.LEFT);tp.setMargins(px(8),px(7),0,0);
        videoBox.addView(top,tp);
        fullButton=NativeUi.icon(this,"⛶",()->toggleFullscreen());
        fullButton.setTextSize(22);fullButton.setBackground(NativeUi.shape(0x77160E20,6,this));
        top.addView(fullButton,NativeUi.lp(this,34,34));
        playbackStatus=NativeUi.text(this,"Waiting for a video",11,true);
        playbackStatus.setPadding(px(8),0,px(8),0);playbackStatus.setBackground(NativeUi.shape(0xAA21162C,8,this));
        LinearLayout.LayoutParams sp=NativeUi.lp(this,-2,26);sp.leftMargin=px(6);top.addView(playbackStatus,sp);
        LinearLayout controlBase=NativeUi.vertical(this);playerControls=controlBase;
        FrameLayout.LayoutParams cb=new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM);
        cb.setMargins(px(4),0,px(4),px(3));
        // The controls overlay the video without reserving a tall opaque black area.
        controlBase.setBackground(new android.graphics.drawable.GradientDrawable(
            android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM,new int[]{0x050D0B12,0xA90D0B12}));
        videoBox.addView(controlBase,cb);
        seekStrip=NativeUi.horizontal(this);
        playButton=NativeUi.icon(this,"▶",()->playPause());
        seekStrip.addView(playButton,NativeUi.lp(this,38,32));
        seek=new SeekBar(this);seek.setMax(1000);seek.setProgressTintList(android.content.res.ColorStateList.valueOf(NativeUi.PURPLE));
        seek.setThumbTintList(android.content.res.ColorStateList.valueOf(NativeUi.WHITE));
        seek.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(0x88FFFFFF));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
            public void onProgressChanged(SeekBar s,int progress,boolean fromUser){}
            public void onStartTrackingTouch(SeekBar s){seekDragging=true;ui.removeCallbacks(hideControls);}
            public void onStopTrackingTouch(SeekBar s){
                seekDragging=false;
                long duration=video.durationMs();
                if(duration>0&&!video.isLive()&&isHost)sendPlayback("seek",currentRoom!=null&&currentRoom.optJSONObject("playback")!=null&&currentRoom.optJSONObject("playback").optBoolean("playing"),duration*s.getProgress()/1000000.0);
                revealControls();
            }
        });
        seekStrip.addView(seek,new LinearLayout.LayoutParams(0,px(30),1));
        titleLabel=NativeUi.label(this,"0:00 / 0:00",10);titleLabel.setGravity(Gravity.CENTER);
        seekStrip.addView(titleLabel,NativeUi.lp(this,76,30));
        controlBase.addView(seekStrip,NativeUi.lp(this,-1,34));
        LinearLayout four=NativeUi.horizontal(this);
        heartButton=option("♡",()->toggleLike());four.addView(heartButton,new LinearLayout.LayoutParams(0,px(36),1));
        four.addView(option("⤢",()->cycleScale()),new LinearLayout.LayoutParams(0,px(36),1));
        four.addView(option("⚙",()->playbackSettings()),new LinearLayout.LayoutParams(0,px(36),1));
        four.addView(option("◖))",()->volumeControl()),new LinearLayout.LayoutParams(0,px(36),1));
        controlBase.addView(four,NativeUi.lp(this,-1,36));
        videoBox.setOnClickListener(v->revealControls());
        videoBox.setOnTouchListener((v,event)->{if(event.getAction()==android.view.MotionEvent.ACTION_DOWN)revealControls();return false;});
        fullButton.setVisibility(View.GONE);playbackStatus.setVisibility(View.GONE);playerControls.setVisibility(View.GONE);
        roomBody=NativeUi.vertical(this);roomBody.setBackground(NativeUi.roomBackground());
        roomPage.addView(roomBody,new LinearLayout.LayoutParams(-1,0,1f));
        LinearLayout labels=NativeUi.horizontal(this);
        TextView callTab=NativeUi.text(this,"Video call",17,true),chatTab=NativeUi.text(this,"Chat",17,true);
        callTab.setGravity(Gravity.CENTER);chatTab.setGravity(Gravity.CENTER);
        labels.addView(callTab,weight());labels.addView(chatTab,weight());
        callTab.setOnClickListener(v->showCallExpanded());
        roomBody.addView(labels,NativeUi.lp(this,-1,50));
        callSurface=new FrameLayout(this);callSurface.setBackgroundColor(0xFF1A1524);
        callSurface.setVisibility(View.GONE);
        roomBody.addView(callSurface,NativeUi.lp(this,-1,150));
        chatScroll=new ScrollView(this);chatScroll.setFillViewport(false);
        chatScroll.setClipToPadding(false);chatScroll.setPadding(px(12),px(6),px(12),px(6));
        chatRows=NativeUi.vertical(this);chatScroll.addView(chatRows);
        roomBody.addView(chatScroll,new LinearLayout.LayoutParams(-1,0,1f));
        LinearLayout composer=NativeUi.horizontal(this);
        composer.setPadding(px(7),px(4),px(7),px(4));composer.setBackground(NativeUi.shape(NativeUi.SURFACE,14,this));
        TextView mic=NativeUi.icon(this,"♩",()->toggleMic());
        mic.setContentDescription("Microphone");
        mic.setTextSize(24);composer.addView(mic);
        chatInput=NativeUi.edit(this,"Message");
        chatInput.setBackgroundColor(Color.TRANSPARENT);
        composer.addView(chatInput,new LinearLayout.LayoutParams(0,px(48),1));
        composerActions=NativeUi.horizontal(this);
        composer.addView(composerActions);
        roomPage.addView(composer,NativeUi.lp(this,-1,58));
        sendButton=NativeUi.icon(this,"➤",()->sendChat());
        composerActions.addView(sendButton);
        chatInput.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            public void onTextChanged(CharSequence s,int start,int before,int count){updateComposer();}
            public void afterTextChanged(Editable e){}
        });
        updateComposer();
        call=new NativeCall(this,callSurface,(to,signal)->{
            JSONObject item=RoomSocket.with("to",to);
            RoomSocket.put(item,"signal",signal);
            socket.send("signal",item);
        },this::toast);
    }
    private TextView option(String icon,Runnable action){
        TextView item=NativeUi.icon(this,icon,action);item.setTextSize(25);
        item.setBackgroundColor(Color.TRANSPARENT);return item;
    }
    private void updateComposer(){
        if(composerActions==null)return;
        composerActions.removeAllViews();
        if(keyboardOpen){
            composerActions.addView(NativeUi.icon(this,"☺",()->chatInput.append("🙂")));
            composerActions.addView(sendButton);
        }else{
            composerActions.addView(NativeUi.icon(this,"@",()->chatInput.append("@")));
            composerActions.addView(NativeUi.icon(this,"☺",()->chatInput.append("🙂")));
            composerActions.addView(NativeUi.icon(this,"▣",()->toggleCamera()));
            composerActions.addView(NativeUi.icon(this,"+",()->sourcePicker.show()));
            if(chatInput!=null&&chatInput.length()>0)composerActions.addView(sendButton);
        }
    }
    private void enterRoom(){
        inRoom=true;home.setVisibility(View.GONE);roomPage.setVisibility(View.VISIBLE);
        scrollChatToBottom();
    }
    private void leaveRoom(){
        if(fullscreen)toggleFullscreen();
        socket.leave();inRoom=false;myId="";sourceKey="";currentRoom=null;currentSource=null;isHost=false;
        seenMessages.clear();chatRows.removeAllViews();video.stop();call.reset();uploader.cancel();
        fullButton.setVisibility(View.GONE);playbackStatus.setVisibility(View.GONE);
        playerControls.setVisibility(View.GONE);emptyVideo.setVisibility(View.VISIBLE);
        roomPage.setVisibility(View.GONE);home.setVisibility(View.VISIBLE);
        openHomeTab("explore");
    }
    private void confirmLeave(){new AlertDialog.Builder(this).setTitle("Leave room?")
        .setMessage("Leave the room and end your call?").setPositiveButton("Leave",(d,w)->leaveRoom())
        .setNegativeButton("Stay",null).show();}
    private void shareRoom(){
        if(currentRoom==null)return;
        String code=currentRoom.optString("code");
        Intent share=new Intent(Intent.ACTION_SEND);share.setType("text/plain");
        share.putExtra(Intent.EXTRA_TEXT,"Join my XParty watch room: "+code+" · "+socket.backend());
        startActivity(Intent.createChooser(share,"Share room invite"));
    }
    private void showPeople(){
        if(currentRoom==null)return;
        JSONArray people=currentRoom.optJSONArray("people");if(people==null)return;
        String[] names=new String[people.length()];
        for(int i=0;i<people.length();i++){JSONObject p=people.optJSONObject(i);
            names[i]=p==null?"Unknown":p.optString("name")+" · "+(p.optBoolean("online")?"Online":"Disconnected")+(p.optString("id").equals(currentRoom.optString("hostId"))?" · Host":"");}
        new AlertDialog.Builder(this).setTitle("People in this room").setItems(names,(d,index)->{
            JSONObject person=people.optJSONObject(index);if(person!=null)personMenu(person);
        }).setNegativeButton("Close",null).show();
    }
    private void personMenu(JSONObject p){
        String id=p.optString("id"),name=p.optString("name","Participant");
        java.util.ArrayList<String> actions=new java.util.ArrayList<>();
        actions.add("Profile");actions.add("Add friend");
        if(isHost&&!id.equals(myId)){actions.add("Kick out");actions.add("Make host");}
        new AlertDialog.Builder(this).setTitle(name).setItems(actions.toArray(new String[0]),(d,i)->{
            String action=actions.get(i);
            if(action.equals("Add friend"))socket.send("friend-request",RoomSocket.with("target",id));
            else if(action.equals("Kick out"))socket.send("kick",RoomSocket.with("target",id));
            else if(action.equals("Make host"))socket.send("transfer-host",RoomSocket.with("target",id));
            else toast("Participant · "+name);
        }).show();
    }
    private void showCallExpanded(){callSurface.setVisibility(callSurface.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE);}
    private void roomSettings(){
        if(currentRoom==null)return;
        String[] opts=isHost?new String[]{"Choose a video","Participants","Share invite","Room privacy","End room"}:
            new String[]{"Choose a video","Participants","Share invite","Leave room"};
        new AlertDialog.Builder(this).setTitle("Room settings").setItems(opts,(d,index)->{
            String value=opts[index];
            if(value.equals("Choose a video"))sourcePicker.show();
            else if(value.equals("Participants"))showPeople();
            else if(value.equals("Share invite"))shareRoom();
            else if(value.equals("Room privacy"))roomPrivacy();
            else if(value.equals("End room"))new AlertDialog.Builder(this).setTitle("End for everyone?")
                .setPositiveButton("End room",(x,y)->socket.send("end-room",new JSONObject())).setNegativeButton("Cancel",null).show();
            else confirmLeave();
        }).show();
    }
    private void roomPrivacy(){
        new AlertDialog.Builder(this).setTitle("Room visibility")
            .setItems(new String[]{"Private · invite only","Public · appear in Explore"},(d,index)->{
                JSONObject x=RoomSocket.with("visibility",index==0?"private":"public");
                RoomSocket.put(x,"title","XParty room "+socket.roomCode());RoomSocket.put(x,"language","");
                socket.send("room-directory",x);
            }).show();
    }
    private void playbackSettings(){
        String[] opts={"Audio language","Screen scaling","Play/Pause","Resync this device"};
        new AlertDialog.Builder(this).setTitle("Video settings").setItems(opts,(d,index)->{
            if(index==0)selectAudioLanguage();
            if(index==1)cycleScale();
            if(index==2)playPause();
            if(index==3){locallyPaused=false;video.pauseLocally(false);socket.send("resync",new JSONObject());}
        }).show();
    }
    private void selectAudioLanguage(){
        String[] names={"Automatic","English","Hindi","Kannada","Tamil","Telugu","Spanish","French"};
        String[] codes={"","en","hi","kn","ta","te","es","fr"};
        new AlertDialog.Builder(this).setTitle("Audio track language").setItems(names,(d,i)->{
            video.selectLanguage(codes[i]);toast("Preferred language: "+names[i]);
        }).show();
    }
    private void volumeControl(){
        SeekBar slider=new SeekBar(this);slider.setMax(100);slider.setProgress(70);
        LinearLayout panel=NativeUi.vertical(this);panel.setPadding(px(20),px(5),px(20),0);
        panel.addView(slider,NativeUi.lp(this,-1,50));
        slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
            public void onProgressChanged(SeekBar s,int p,boolean user){if(user)video.setVolume(p/100f);}
            public void onStartTrackingTouch(SeekBar s){}
            public void onStopTrackingTouch(SeekBar s){}
        });
        new AlertDialog.Builder(this).setTitle("Playback volume").setView(panel).setPositiveButton("Done",null).show();
    }
    private int scale=0;
    private void cycleScale(){scale=(scale+1)%3;video.setScaleMode(scale);toast(scale==0?"Fit screen":scale==1?"Fill screen (crop)":"Stretch to screen");}
    private void toggleLike(){
        if(currentSource==null)return;
        boolean selected=heartButton.getText().toString().equals("♥");
        heartButton.setText(selected?"♡":"♥");
        JSONObject m=RoomSocket.with("sourceId",currentSource.optString("id"));
        RoomSocket.put(m,"liked",!selected);socket.send("video-like",m);
    }
    private void toggleFullscreen(){
        fullscreen=!fullscreen;
        roomHeader.setVisibility(fullscreen?View.GONE:View.VISIBLE);
        roomBody.setVisibility(fullscreen?View.GONE:View.VISIBLE);
        android.view.View composer=roomPage.getChildAt(roomPage.getChildCount()-1);
        composer.setVisibility(fullscreen?View.GONE:View.VISIBLE);
        roomPage.setPadding(0,0,0,0);
        ViewGroup.LayoutParams p=videoBox.getLayoutParams();
        p.height=fullscreen?ViewGroup.LayoutParams.MATCH_PARENT:Math.round(getResources().getDisplayMetrics().widthPixels*9f/16f);
        videoBox.setLayoutParams(p);
        getWindow().getDecorView().setSystemUiVisibility(fullscreen?
            View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY:
            View.SYSTEM_UI_FLAG_VISIBLE);
        setRequestedOrientation(fullscreen?android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE:
            android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        revealControls();
    }
    private void revealControls(){
        if(!video.hasSource()){playerControls.setVisibility(View.GONE);return;}
        controlsShown=true;playerControls.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hideControls);if(!seekDragging)ui.postDelayed(hideControls,3600);
    }
    private void refreshTimeline(){
        if(currentRoom==null||!video.hasSource())return;
        long duration=video.durationMs(),position=video.positionMs();
        if(!seekDragging&&duration>0&&!video.isLive())seek.setProgress((int)Math.min(1000,1000*position/duration));
        titleLabel.setText(video.isLive()?"LIVE":format(position)+" / "+format(duration));
        seek.setVisibility(video.isLive()?View.INVISIBLE:View.VISIBLE);
    }
    private String format(long millis){long secs=Math.max(0,millis)/1000;return String.format(Locale.ROOT,"%d:%02d",secs/60,secs%60);}
    private void sendPlayback(String intent,boolean playing,double seconds){
        if(currentSource==null)return;
        JSONObject data=RoomSocket.with("sourceId",currentSource.optString("id"));
        RoomSocket.put(data,"playing",playing);RoomSocket.put(data,"position",Math.max(0,seconds));
        RoomSocket.put(data,"intent",intent);RoomSocket.put(data,"eventId",UUID.randomUUID().toString());
        socket.send("playback",data);
    }
    private void playPause(){
        if(currentSource==null)return;
        if(!isHost&&!"SHARED_CONTROL".equals(currentRoom.optString("mode"))){
            locallyPaused=!locallyPaused;
            video.pauseLocally(locallyPaused);
            playButton.setText(locallyPaused?"▶":"Ⅱ");return;
        }
        boolean playing=currentRoom.optJSONObject("playback")!=null&&currentRoom.optJSONObject("playback").optBoolean("playing");
        sendPlayback(playing?"pause":"play",!playing,video.positionMs()/1000.0);
        playButton.setText(playing?"▶":"Ⅱ");revealControls();
    }
    private void chooseSource(JSONObject s){
        if(currentRoom==null){toast("Join or create a room first");return;}
        if("file".equals(s.optString("type"))&&pendingVideo==null)return;
        socket.send("source",RoomSocket.with("source",s));
        toast("Video selection sent");
    }
    private void openLocalVideo(){
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.setType("video/*");i.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(i,REQ_FILE);
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request!=REQ_FILE||result!=RESULT_OK||data==null||data.getData()==null)return;
        Uri uri=data.getData();pendingVideo=uri;
        long size=0;String name="Shared video";
        try(Cursor c=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE},null,null,null)){
            if(c!=null&&c.moveToFirst()){name=c.getString(0);size=c.getLong(1);}
        }catch(Exception ignored){}
        if(size<=0||size>5L*1024*1024*1024){toast("File size unavailable or exceeds 5 GB");return;}
        pendingVideoSize=size;
        JSONObject s=RoomSocket.with("type","file");RoomSocket.put(s,"title",name);
        RoomSocket.put(s,"size",size);RoomSocket.put(s,"mime","video/mp4");
        chooseSource(s);
    }
    private void beginUpload(JSONObject s){
        if(pendingVideo==null||!s.optString("owner").equals(myId))return;
        String id=s.optString("id");if(id.equals(uploadingSource))return;
        uploadingSource=id;
        uploader.upload(pendingVideo,socket.backend()+"/api/file/"+id,socket.token(),pendingVideoSize,new LocalFileUploader.Feedback(){
            public void onProgress(int percent){playbackStatus.setText("Uploading video "+percent+"%");}
            public void onError(String error){toast("Upload failed: "+error);uploadingSource="";}
            public void onFinished(){toast("Video shared");uploadingSource="";pendingVideo=null;
                JSONObject ready=RoomSocket.with("sourceId",id);RoomSocket.put(ready,"ready",true);
                RoomSocket.put(ready,"status","Video uploaded");socket.send("ready",ready);
                video.load(s,socket.backend(),socket.token());
            }
        });
    }
    private void scrollChatToBottom(){
        if(chatScroll!=null)chatScroll.post(()->chatScroll.fullScroll(View.FOCUS_DOWN));
    }
    private void sendChat(){
        String text=chatInput.getText().toString().trim();
        if(text.isEmpty())return;
        JSONObject msg=RoomSocket.with("text",text);
        RoomSocket.put(msg,"clientId",UUID.randomUUID().toString());
        if(socket.send("chat",msg)){chatInput.setText("");updateComposer();scrollChatToBottom();}
        else toast("Reconnecting. Message not sent.");
    }
    private void addMessage(JSONObject m){
        String id=m.optString("id");if(id.isEmpty()||!seenMessages.add(id))return;
        String name=m.optString("name","Guest"),text=m.optString("text");
        if(text.isEmpty()&&m.optJSONObject("attachment")==null)return;
        boolean mine=m.optString("from").equals(myId);
        LinearLayout bubble=NativeUi.vertical(this);
        bubble.setPadding(px(12),px(7),px(12),px(7));
        bubble.setBackground(NativeUi.shape(mine?0xFF3E2B4C:NativeUi.SURFACE,12,this));
        bubble.addView(NativeUi.label(this,mine?"You":name,11));
        bubble.addView(NativeUi.text(this,text.isEmpty()?"📎 Attachment":text,15,false));
        LinearLayout outer=NativeUi.horizontal(this);
        outer.setGravity(mine?Gravity.RIGHT:Gravity.LEFT);
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,-2);
        p.setMargins(0,px(3),0,px(3));outer.addView(bubble,p);
        chatRows.addView(outer);
        scrollChatToBottom();
    }
    private void setNowWatching(JSONObject source){
        if(source==null){
            emptyVideo.setVisibility(View.VISIBLE);
            playbackStatus.setVisibility(View.GONE);fullButton.setVisibility(View.GONE);
            playerControls.setVisibility(View.GONE);
            titleLabel.setText("");return;
        }
        emptyVideo.setVisibility(View.GONE);
        fullButton.setVisibility(View.VISIBLE);playbackStatus.setVisibility(View.VISIBLE);
        revealControls();
    }
    private void updateRoom(JSONObject updated){
        currentRoom=updated;
        isHost=myId.equals(updated.optString("hostId"));
        JSONObject next=updated.optJSONObject("source");
        String key=next==null?"":next.optString("id");
        if(!key.equals(sourceKey)){
            sourceKey=key;currentSource=next;
            if(next==null){video.stop();setNowWatching(null);}
            else{
                setNowWatching(next);
                if("file".equals(next.optString("type"))&&!next.optBoolean("uploaded"))beginUpload(next);
                else video.load(next,socket.backend(),socket.token());
            }
        }else currentSource=next;
        roomLabel=playbackStatus;
        JSONObject playing=updated.optJSONObject("playback");
        if(playing!=null&&next!=null){
            video.applyPlayback(playing,false);
            boolean isPlaying=playing.optBoolean("playing");
            playButton.setText(isPlaying?"Ⅱ":"▶");
            playbackStatus.setText(video.isLive()?isPlaying?"LIVE":"Live paused":isPlaying?"Playing together":"Paused together");
        }
        JSONArray people=updated.optJSONArray("people");
        if(people!=null){call.updatePeople(people);}
    }
    private void onWelcome(JSONObject m){
        myId=m.optString("id");
        JSONObject r=m.optJSONObject("room");if(r==null)return;
        seenMessages.clear();chatRows.removeAllViews();
        call.reset();call.setIdentity(myId,m.optJSONArray("iceServers"));
        enterRoom();sourceKey="";
        updateRoom(r);
        JSONArray history=m.optJSONArray("history");
        if(history!=null)for(int i=0;i<history.length();i++){JSONObject h=history.optJSONObject(i);if(h!=null)addMessage(h);}
        toast("Room "+r.optString("code")+" connected");
    }
    @Override public void onEvent(JSONObject m){
        String type=m.optString("type");
        switch(type){
            case "welcome":onWelcome(m);break;
            case "state":{
                JSONObject r=m.optJSONObject("room");if(r!=null)updateRoom(r);break;
            }
            case "playback":case "anchor":{
                if(currentRoom!=null&&currentSource!=null&&currentSource.optString("id").equals(m.optString("sourceId"))){
                    JSONObject state=m.optJSONObject("playback");
                    RoomSocket.put(currentRoom,"playback",state);
                    video.applyPlayback(state,type.equals("playback")||m.optBoolean("resync"));
                    if(state!=null)playButton.setText(state.optBoolean("playing")?"Ⅱ":"▶");
                }
                break;
            }
            case "chat":addMessage(m);break;
            case "signal":call.onSignal(m.optString("from"),m.optJSONObject("signal"));break;
            case "ended":case "kicked":case "resume-failed":toast(m.optString("message","Room closed"));leaveRoom();break;
            case "error":case "chat-error":toast(m.optString("message","Room error"));break;
            case "request-status":toast("Request sent to host");break;
        }
    }
    @Override public void onStatus(String message){if(inRoom&&playbackStatus!=null&&video!=null&&video.hasSource())playbackStatus.setText(message);else if(connection!=null)connection.setText(message);}
    @Override public void onReady(String id){
        if(!id.equals(sourceKey)||currentRoom==null)return;
        JSONObject ready=RoomSocket.with("sourceId",id);RoomSocket.put(ready,"ready",true);RoomSocket.put(ready,"status","Native playback ready");
        socket.send("ready",ready);
        if(currentRoom.optJSONObject("playback")!=null)video.applyPlayback(currentRoom.optJSONObject("playback"),true);
    }
    @Override public void onEnded(){
        if(isHost&&currentSource!=null){
            socket.send("playback-ended",RoomSocket.with("sourceId",sourceKey));
        }
    }
    private void toggleMic(){
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},REQ_MIC);return;
        }
        call.toggleMic();
        JSONObject m=RoomSocket.with("mic",call.isMicOn());RoomSocket.put(m,"camera",call.isCameraOn());
        socket.send("media",m);
        toast(call.isMicOn()?"Microphone on":"Microphone off");
    }
    private void toggleCamera(){
        if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){
            requestPermissions(new String[]{Manifest.permission.CAMERA},REQ_CAMERA);return;
        }
        if(callSurface.getVisibility()!=View.VISIBLE)callSurface.setVisibility(View.VISIBLE);
        call.toggleCamera();
        JSONObject m=RoomSocket.with("mic",call.isMicOn());RoomSocket.put(m,"camera",call.isCameraOn());
        socket.send("media",m);
        toast(call.isCameraOn()?"Camera on":"Camera off");
    }
    @Override public void onRequestPermissionsResult(int request,String[] perms,int[] grants){
        super.onRequestPermissionsResult(request,perms,grants);
        if(grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED){
            if(request==REQ_MIC)toggleMic();
            if(request==REQ_CAMERA)toggleCamera();
        }else toast("Permission not granted");
    }
    @Override public void onConfigurationChanged(Configuration next){super.onConfigurationChanged(next);}
    @Override public void onBackPressed(){
        if(fullscreen){toggleFullscreen();return;}
        if(inRoom){confirmLeave();return;}super.onBackPressed();
    }
    private void toast(String message){runOnUiThread(()->Toast.makeText(this,message,Toast.LENGTH_SHORT).show());}
    @Override protected void onDestroy(){
        ui.removeCallbacksAndMessages(null);
        sourcePicker.close();uploader.close();video.destroy();call.destroy();socket.destroy();
        io.shutdownNow();client.dispatcher().executorService().shutdown();
        super.onDestroy();
    }
}
