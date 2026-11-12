package com.pkx404.xpartynative;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import org.webrtc.AudioSource;
import org.webrtc.AudioTrack;
import org.webrtc.Camera1Enumerator;
import org.webrtc.Camera2Enumerator;
import org.webrtc.CameraEnumerator;
import org.webrtc.CameraVideoCapturer;
import org.webrtc.DataChannel;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpReceiver;
import org.webrtc.RtpTransceiver;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;
import org.webrtc.SoftwareVideoDecoderFactory;
import org.webrtc.SoftwareVideoEncoderFactory;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.SurfaceViewRenderer;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;
import org.webrtc.audio.JavaAudioDeviceModule;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Independent native calling engine v0.4.6. Rebuilt without WebView capture or
 * old renderer state. Room presence alone never starts WebRTC JNI, mic or camera.
 * Permissions, call seat, audio and video have separate, explicit lifecycles.
 */
final class NativeCallController {
  interface Events {
    void signal(String recipient,JSONObject payload);
    void sendMedia(boolean mic,boolean camera);
    void action(String type);
    void status(String message);
  }
  private static final String TAG="XPartyCallV2";
  private static final int WHITE=0xFFF5F1FF, ACCENT=0xFFB9A3EF;
  private static boolean nativeInitialized=false;
  private final Activity activity;
  private final Events events;
  private final AudioManager audio;
  private final Handler main=new Handler(Looper.getMainLooper());
  private final Map<String,Peer> peers=new HashMap<>();
  private final ArrayList<PeerConnection.IceServer> ice=new ArrayList<>();
  private final Set<String> inRoom=new HashSet<>();
  private FrameLayout callRoot,videoStage;
  private LinearLayout videos,buttons;
  private TextView status,placeholder,micLabel,cameraLabel;
  private XPControl micControl,cameraControl,speakerControl;
  private JSONObject lastRoom;
  private String self="";
  private boolean manualRoute;
  private int savedMode;
  private boolean savedSpeaker;
  private int cameraTier=1,upgradeSamples;
  private long statsGeneration;
  private boolean inCall=false,micOn=false,cameraOn=false,speaker=true,joining=false,stopped=false;
  private boolean pendingMic=false,pendingCamera=false,booted=false,captureActive=false;
  private PeerConnectionFactory factory;
  private AudioSource audioSource;
  private AudioTrack audioTrack;
  private VideoSource videoSource;
  private VideoTrack videoTrack;
  private EglBase egl;
  private SurfaceTextureHelper captureHelper;
  private CameraVideoCapturer capturer;
  private SurfaceViewRenderer localView;
  private final class Peer {
    final String id;
    final PeerConnection pc;
    final boolean initiator;
    final List<IceCandidate> iceQueue=new ArrayList<>();
    VideoTrack remoteVideo;
    SurfaceViewRenderer view;
    Peer(String id,PeerConnection pc,boolean initiator){
      this.id=id;this.pc=pc;this.initiator=initiator;
    }
  }

  NativeCallController(Activity activity,Events events) {
    this.activity=activity;this.events=events;
    this.audio=(AudioManager)activity.getSystemService(Context.AUDIO_SERVICE);
    addIce("stun:stun.l.google.com:19302","","");
  }
  private int dp(int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
  private void onMain(Runnable task) {
    if(Looper.myLooper()==Looper.getMainLooper())task.run();else main.post(task);
  }
  private void log(String stage){Log.i(TAG,stage);}
  private void status(String message){
    log(message);
    onMain(()->{
      if(stopped)return;
      if(status!=null)status.setText(message);
      events.status(message);
    });
  }
  private TextView text(String value,int size){
    TextView view=new TextView(activity);
    view.setText(value);view.setTextSize(size);view.setTextColor(WHITE);
    view.setGravity(Gravity.CENTER);
    return view;
  }
  private XPControl icon(String kind,String description,Runnable click){
    XPControl icon=new XPControl(activity,kind);
    icon.setContentDescription(description);
    icon.setOnClickListener(v->click.run());
    return icon;
  }
  void attach(FrameLayout frame){
    if(stopped)return;
    callRoot=frame;frame.removeAllViews();
    frame.setBackground(NativeImmersiveBackdrop.sheetSkin());
    LinearLayout root=new LinearLayout(activity);root.setOrientation(LinearLayout.VERTICAL);
    frame.addView(root,new FrameLayout.LayoutParams(-1,-1));
    status=text("Join a call to start. Microphone and camera are off.",12);
    status.setGravity(Gravity.CENTER_VERTICAL);
    status.setPadding(dp(12),dp(4),dp(8),dp(4));
    root.addView(status,new LinearLayout.LayoutParams(-1,dp(43)));
    videoStage=new FrameLayout(activity);
    root.addView(videoStage,new LinearLayout.LayoutParams(-1,0,1));
    placeholder=text("◉\nVoice & video call\nMic and camera start off",15);
    placeholder.setTextColor(0xFFD2C4EF);
    videoStage.addView(placeholder,new FrameLayout.LayoutParams(-1,-1));
    videos=new LinearLayout(activity);videos.setOrientation(LinearLayout.VERTICAL);
    videoStage.addView(videos,new FrameLayout.LayoutParams(-1,-1));
    buttons=new LinearLayout(activity);buttons.setGravity(Gravity.CENTER);
    buttons.setPadding(dp(5),dp(2),dp(5),dp(4));
    buttons.setBackground(NativeImmersiveBackdrop.headerSkin());
    root.addView(buttons,new LinearLayout.LayoutParams(-1,dp(60)));
    micControl=icon("mic_off","Microphone on or off",this::toggleMic);
    cameraControl=icon("camera","Camera on or off",this::toggleCamera);
    speakerControl=icon("volume","Toggle speaker",this::toggleSpeaker);
    addButton(micControl);
    addButton(cameraControl);
    addButton(speakerControl);
    TextView flip=text("↻",23);flip.setContentDescription("Switch camera");
    flip.setOnClickListener(v->flipCamera());
    addButton(flip);
    TextView leave=text("Leave",12);leave.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
    leave.setTextColor(0xFFFFBBC7);leave.setContentDescription("Leave call seat");
    leave.setOnClickListener(v->leaveSeat());
    addButton(leave);
    updateButtons();
    // Critically: no PeerConnectionFactory.initialize() in attach or tab switch.
  }
  private void addButton(View control){
    LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(48),1);
    lp.leftMargin=dp(3);buttons.addView(control,lp);
  }
  private void updateButtons(){
    if(micControl!=null){
      micControl.active(micOn);
      micControl.setContentDescription(micOn?"Mute microphone":"Turn on microphone");
    }
    if(cameraControl!=null){
      cameraControl.active(cameraOn);
      cameraControl.setContentDescription(cameraOn?"Turn off camera":"Turn on camera");
    }
    if(speakerControl!=null)speakerControl.active(speaker);
  }

  void configureIce(JSONArray entries){
    ice.clear();
    if(entries!=null){
      for(int i=0;i<entries.length();i++){
        JSONObject e=entries.optJSONObject(i);
        if(e==null)continue;
        String user=e.optString("username",""),pwd=e.optString("credential","");
        JSONArray addresses=e.optJSONArray("urls");
        if(addresses!=null){
          for(int j=0;j<addresses.length();j++)addIce(addresses.optString(j),user,pwd);
        } else addIce(e.optString("urls"),user,pwd);
      }
    }
    if(ice.isEmpty())addIce("stun:stun.l.google.com:19302","","");
  }
  private void addIce(String address,String user,String pwd){
    if(address==null||!(address.startsWith("stun:")||address.startsWith("turn:")||address.startsWith("turns:")))return;
    ice.add(PeerConnection.IceServer.builder(address).setUsername(user).setPassword(pwd).createIceServer());
  }
  void syncRoom(JSONObject room,String selfId){
    if(stopped||room==null)return;
    self=selfId==null?"":selfId;lastRoom=room;
    JSONArray members=room.optJSONArray("people");
    if(members==null)return;
    boolean wasInCall=inCall;
    inCall=false;inRoom.clear();
    for(int i=0;i<members.length();i++){
      JSONObject m=members.optJSONObject(i);
      if(m==null)continue;
      String id=m.optString("id","");
      if(id.equals(self))inCall=m.optBoolean("inCall",false);
      else if(m.optBoolean("inCall")&&m.optBoolean("online"))inRoom.add(id);
    }
    for(String old:new ArrayList<>(peers.keySet()))
      if(!inCall||!inRoom.contains(old))dropPeer(old);
    if(!inCall){
      if(wasInCall){disableMedia();status("Call ended. Microphone and camera are off.");}
      else if(!joining)status("Tap microphone or camera to request a call seat.");
      return;
    }
    joining=false;
    if(pendingMic){pendingMic=false;onMain(this::toggleMic);}
    if(pendingCamera){pendingCamera=false;onMain(this::toggleCamera);}
    if(booted)connectPeers();
  }
  private boolean requireSeat(boolean camera){
    if(stopped)return false;
    if(inCall)return true;
    if(camera)pendingCamera=true;else pendingMic=true;
    if(!joining){joining=true;events.action("call-join");}
    status("Joining voice/video call… waiting for room approval");
    return false;
  }
  private boolean requestPermission(String permission,int code){
    if(Build.VERSION.SDK_INT<23||activity.checkSelfPermission(permission)==PackageManager.PERMISSION_GRANTED)return true;
    activity.requestPermissions(new String[]{permission},code);
    status("Allow "+(code==2201?"microphone":"camera")+" access to continue");
    return false;
  }
  void onPermissionResult(int code,boolean granted){
    if(stopped)return;
    if(!granted){status(code==2201?"Microphone permission denied":"Camera permission denied");return;}
    if(code==2201&&!micOn)main.post(this::toggleMic);
    if(code==2202&&!cameraOn)main.post(this::toggleCamera);
  }

  private void startEngine(){
    if(booted||stopped)return;
    if(!inCall)throw new IllegalStateException("Call seat not approved");
    // Stage log makes any JNI failure attributable, unlike the previous controller.
    log("RTC_STAGE_1_BEFORE_LOAD");
    synchronized(NativeCallController.class){
      if(!nativeInitialized){
        PeerConnectionFactory.initialize(
          PeerConnectionFactory.InitializationOptions.builder(activity.getApplicationContext())
            .setEnableInternalTracer(false).createInitializationOptions());
        nativeInitialized=true;
      }
    }
    log("RTC_STAGE_2_LOADED");
    JavaAudioDeviceModule adm=JavaAudioDeviceModule.builder(activity.getApplicationContext())
      .setAudioSource(android.media.MediaRecorder.AudioSource.VOICE_COMMUNICATION)
      .setUseHardwareAcousticEchoCanceler(JavaAudioDeviceModule.isBuiltInAcousticEchoCancelerSupported())
      .setUseHardwareNoiseSuppressor(JavaAudioDeviceModule.isBuiltInNoiseSuppressorSupported())
      .createAudioDeviceModule();
    try{
      EglBase.Context context=null;
      try{ensureEgl();context=egl.getEglBaseContext();}catch(RuntimeException unavailable){Log.w(TAG,"Using software codecs",unavailable);}
      factory=PeerConnectionFactory.builder()
        .setAudioDeviceModule(adm)
        .setVideoEncoderFactory(new org.webrtc.DefaultVideoEncoderFactory(context,true,true))
        .setVideoDecoderFactory(new org.webrtc.DefaultVideoDecoderFactory(context))
        .createPeerConnectionFactory();
    }finally{adm.release();}
    if(factory==null)throw new IllegalStateException("Failed to create RTC factory");
    log("RTC_STAGE_3_FACTORY_READY");
    audioSource=factory.createAudioSource(new MediaConstraints());
    audioTrack=factory.createAudioTrack("xp-audio",audioSource);
    if(audioTrack==null)throw new IllegalStateException("Microphone media track unavailable");
    audioTrack.setEnabled(false);
    booted=true;log("RTC_STAGE_4_AUDIO_READY");
    connectPeers();
  }
  void toggleMic(){
    if(!requireSeat(false))return;
    if(micOn){
      micOn=false;
      if(audioTrack!=null)audioTrack.setEnabled(false);
      
      updateButtons();events.sendMedia(false,cameraOn);status("Microphone off");return;
    }
    if(!requestPermission(Manifest.permission.RECORD_AUDIO,2201))return;
    try{
      startEngine();
      // Preserve the active media route while unmuting capture.
      micOn=true;audioTrack.setEnabled(true);
      updateButtons();events.sendMedia(true,cameraOn);
      status("Microphone on");
    }catch(Throwable error){
      micOn=false;
      Log.e(TAG,"Microphone startup failed",error);
      status("Microphone unavailable: "+error.getClass().getSimpleName());
      updateButtons();
    }
  }

  private void ensureEgl(){
    if(egl==null)egl=EglBase.create();
  }
  private void prepareLocalRenderer(){
    if(localView!=null||videoStage==null)return;
    ensureEgl();
    localView=new SurfaceViewRenderer(activity);
    localView.init(egl.getEglBaseContext(),null);
    localView.setZOrderMediaOverlay(true);
    localView.setMirror(true);
    FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(dp(104),dp(138),Gravity.TOP|Gravity.RIGHT);
    lp.topMargin=dp(8);lp.rightMargin=dp(8);
    videoStage.addView(localView,lp);
  }
  private void createVideoTrack(){
    if(videoTrack!=null)return;
    ensureEgl();
    videoSource=factory.createVideoSource(false);
    videoTrack=factory.createVideoTrack("xp-video",videoSource);
    if(videoTrack==null)throw new IllegalStateException("Camera video track unavailable");
    videoTrack.setEnabled(false);
    for(Peer p:new ArrayList<>(peers.values())){
      p.pc.addTrack(videoTrack,Collections.singletonList("xp-call"));
      if(p.initiator)offer(p);
      else try{sendPeer(p.id,new JSONObject().put("restart",true));}catch(Exception ignored){}
    }
  }
  private boolean startCapture(){
    if(captureActive)return true;
    try{
      CameraEnumerator enumeration=Camera2Enumerator.isSupported(activity)
        ?new Camera2Enumerator(activity):new Camera1Enumerator(false);
      String chosen=null;
      for(String name:enumeration.getDeviceNames())if(enumeration.isFrontFacing(name)){chosen=name;break;}
      if(chosen==null){
        String[] names=enumeration.getDeviceNames();
        if(names.length>0)chosen=names[0];
      }
      if(chosen==null){status("No camera detected");return false;}
      if(capturer!=null){cameraTier=1;upgradeSamples=0;capturer.startCapture(640,480,20);captureActive=true;return true;}
      capturer=(CameraVideoCapturer)enumeration.createCapturer(chosen,null);
      if(capturer==null){status("Camera capturer unavailable");return false;}
      captureHelper=SurfaceTextureHelper.create("XPartyCallCamera",egl.getEglBaseContext());
      capturer.initialize(captureHelper,activity.getApplicationContext(),videoSource.getCapturerObserver());
      cameraTier=1;upgradeSamples=0;capturer.startCapture(640,480,20);
      captureActive=true;return true;
    }catch(Throwable error){
      Log.e(TAG,"Camera capture failed",error);
      status("Camera could not start");
      return false;
    }
  }
  private void stopCaptureOnly(){
    ++statsGeneration;main.removeCallbacks(sampleNetwork);
    if(capturer!=null&&captureActive){try{capturer.stopCapture();}catch(Exception ignored){}captureActive=false;}
  }
  private final Runnable sampleNetwork=new Runnable(){
    public void run(){
      if(!cameraOn||!captureActive||stopped)return;
      long generation=++statsGeneration;
      ArrayList<Peer> active=new ArrayList<>(peers.values());
      int[] remaining={active.size()};double[] slowest={Double.POSITIVE_INFINITY};
      for(Peer peer:active)peer.pc.getStats(report->{
        double capacity=0;
        for(org.webrtc.RTCStats stat:report.getStatsMap().values()){
          if(!"candidate-pair".equals(stat.getType()))continue;
          Map<String,Object> data=stat.getMembers();
          if(!"succeeded".equals(data.get("state"))||!Boolean.TRUE.equals(data.get("nominated")))continue;
          Object rate=data.get("availableOutgoingBitrate");
          if(rate instanceof Number)capacity=((Number)rate).doubleValue();
        }
        final double sample=capacity;
        main.post(()->{
          if(generation!=statsGeneration||!cameraOn||!captureActive)return;
          slowest[0]=Math.min(slowest[0],sample);
          if(--remaining[0]==0)adaptCamera(slowest[0],active.size());
        });
      });
      main.postDelayed(this,4000);
    }
  };
  private void adaptCamera(double bps,int count){
    if(bps<=0||!Double.isFinite(bps))return;
    int target=bps<450000?0:bps<1600000?1:bps<4200000||count>1?2:3;
    if(target==cameraTier){upgradeSamples=0;return;}
    if(target>cameraTier&&++upgradeSamples<3)return;
    int[][] formats={{320,240,12},{640,480,20},{1280,720,24},{1920,1080,30}};
    int[] format=formats[target];
    try{capturer.changeCaptureFormat(format[0],format[1],format[2]);cameraTier=target;}
    catch(RuntimeException ignored){}
    upgradeSamples=0;
  }
  void toggleCamera(){
    if(!requireSeat(true))return;
    if(cameraOn){
      cameraOn=false;stopCaptureOnly();
      if(videoTrack!=null)videoTrack.setEnabled(false);
      if(localView!=null)localView.setVisibility(View.INVISIBLE);
      
      updateButtons();events.sendMedia(micOn,false);status("Camera off");return;
    }
    if(!requestPermission(Manifest.permission.CAMERA,2202))return;
    try{
      startEngine();createVideoTrack();prepareLocalRenderer();
      if(!startCapture())return;
      cameraOn=true;videoTrack.setEnabled(true);main.removeCallbacks(sampleNetwork);main.postDelayed(sampleNetwork,3000);
      if(localView!=null){
        videoTrack.removeSink(localView);
        videoTrack.addSink(localView);
        localView.setVisibility(View.VISIBLE);
      }
      updateButtons();events.sendMedia(micOn,true);
      status("Camera on");
    }catch(Throwable error){
      cameraOn=false;
      Log.e(TAG,"Camera startup failed",error);
      status("Camera unavailable: "+error.getClass().getSimpleName());
      updateButtons();
    }
  }
  private void restoreAudioRoute(){
    if(!manualRoute)return;
    audio.setSpeakerphoneOn(savedSpeaker);audio.setMode(savedMode);manualRoute=false;
  }
  void toggleSpeaker(){
    if(!manualRoute){savedMode=audio.getMode();savedSpeaker=audio.isSpeakerphoneOn();manualRoute=true;}
    speaker=!speaker;
    audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
    audio.setSpeakerphoneOn(speaker);
    updateButtons();status(speaker?"Speaker on":"Earpiece on");
  }
  void flipCamera(){
    if(capturer==null||!captureActive){status("Start the camera before switching");return;}
    try{capturer.switchCamera(null);}catch(Throwable error){status("Camera switch unavailable");}
  }
  private void disableMedia(){
    micOn=false;cameraOn=false;stopCaptureOnly();
    if(audioTrack!=null)audioTrack.setEnabled(false);
    if(videoTrack!=null)videoTrack.setEnabled(false);
    if(localView!=null)localView.setVisibility(View.INVISIBLE);
    restoreAudioRoute();
    updateButtons();events.sendMedia(false,false);
  }
  void leaveSeat(){
    pendingMic=false;pendingCamera=false;joining=false;
    disableMedia();
    for(String id:new ArrayList<>(peers.keySet()))dropPeer(id);
    if(inCall)events.action("call-leave");
    inCall=false;status("Left video call");
  }
  boolean isMicOn(){return micOn;}
  boolean isCameraOn(){return cameraOn;}

  private void connectPeers(){
    if(!inCall||!booted||stopped)return;
    for(String id:new ArrayList<>(inRoom)){
      if(id==null||id.isEmpty()||id.equals(self)||peers.containsKey(id))continue;
      openPeer(id);
    }
  }
  private void sendPeer(String id,JSONObject message){
    onMain(()->{if(!stopped)events.signal(id,message);});
  }
  private void openPeer(String id){
    if(peers.containsKey(id)||factory==null||!inCall)return;
    boolean initiator=self.compareTo(id)<0;
    PeerConnection.RTCConfiguration cfg=new PeerConnection.RTCConfiguration(new ArrayList<>(ice));
    cfg.sdpSemantics=PeerConnection.SdpSemantics.UNIFIED_PLAN;
    PeerConnection pc=factory.createPeerConnection(cfg,new PeerConnection.Observer(){
      @Override public void onSignalingChange(PeerConnection.SignalingState value){}
      @Override public void onIceConnectionChange(PeerConnection.IceConnectionState value){
        status("Call connection: "+value.name().toLowerCase());
      }
      @Override public void onIceConnectionReceivingChange(boolean value){}
      @Override public void onIceGatheringChange(PeerConnection.IceGatheringState value){}
      @Override public void onIceCandidate(IceCandidate c){
        try{
          JSONObject data=new JSONObject().put("candidate",c.sdp)
             .put("sdpMid",c.sdpMid).put("sdpMLineIndex",c.sdpMLineIndex);
          sendPeer(id,new JSONObject().put("candidate",data));
        }catch(Exception ignored){}
      }
      @Override public void onIceCandidatesRemoved(IceCandidate[] c){}
      @Override public void onAddStream(MediaStream stream){
        for(VideoTrack track:stream.videoTracks)showRemote(id,track);
      }
      @Override public void onRemoveStream(MediaStream stream){}
      @Override public void onDataChannel(DataChannel channel){}
      @Override public void onRenegotiationNeeded(){}
      @Override public void onAddTrack(RtpReceiver receiver,MediaStream[] stream){
        if(receiver.track() instanceof VideoTrack)showRemote(id,(VideoTrack)receiver.track());
      }
      @Override public void onTrack(RtpTransceiver transceiver){
        if(transceiver.getReceiver().track() instanceof VideoTrack)
          showRemote(id,(VideoTrack)transceiver.getReceiver().track());
      }
    });
    if(pc==null){status("Unable to connect to participant");return;}
    Peer peer=new Peer(id,pc,initiator);
    peers.put(id,peer);
    if(audioTrack!=null)pc.addTrack(audioTrack,Collections.singletonList("xp-call"));
    if(videoTrack!=null)pc.addTrack(videoTrack,Collections.singletonList("xp-call"));
    if(initiator)offer(peer);
  }
  private void showRemote(String id,VideoTrack track){
    onMain(()->{
      if(stopped||videoStage==null)return;
      Peer peer=peers.get(id);
      if(peer==null||peer.remoteVideo==track)return;
      try{
        ensureEgl();
        if(peer.view==null){
          peer.view=new SurfaceViewRenderer(activity);
          peer.view.init(egl.getEglBaseContext(),null);
          peer.view.setEnableHardwareScaler(true);
          peer.view.setMirror(false);
          LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(200));
          lp.bottomMargin=dp(5);
          videos.addView(peer.view,lp);
        }
        if(peer.remoteVideo!=null)peer.remoteVideo.removeSink(peer.view);
        peer.remoteVideo=track;track.addSink(peer.view);
        if(placeholder!=null)placeholder.setVisibility(View.GONE);
        status("Video connected");
      }catch(Throwable error){Log.e(TAG,"Remote video render failed",error);status("Video display unavailable");}
    });
  }
  private abstract class SDP implements SdpObserver {
    @Override public void onCreateSuccess(SessionDescription desc){}
    @Override public void onSetSuccess(){}
    @Override public void onCreateFailure(String error){status("Call negotiation error: "+error);}
    @Override public void onSetFailure(String error){status("Call negotiation error: "+error);}
  }
  private void sendLocal(Peer peer,SessionDescription description){
    peer.pc.setLocalDescription(new SDP(){
      @Override public void onSetSuccess(){
        try{sendPeer(peer.id,new JSONObject().put("description",
          new JSONObject().put("type",description.type.canonicalForm())
            .put("sdp",description.description)));}
        catch(Exception ignored){}
      }
    },description);
  }
  private void offer(Peer peer){
    peer.pc.createOffer(new SDP(){
      @Override public void onCreateSuccess(SessionDescription d){sendLocal(peer,d);}
    },new MediaConstraints());
  }
  private void answer(Peer peer){
    peer.pc.createAnswer(new SDP(){
      @Override public void onCreateSuccess(SessionDescription d){sendLocal(peer,d);}
    },new MediaConstraints());
  }
  void signal(String from,JSONObject data){
    if(stopped||!inCall||!booted||from==null||data==null)return;
    if(!peers.containsKey(from))openPeer(from);
    Peer peer=peers.get(from);
    if(peer==null)return;
    if(data.optBoolean("reset",false)){dropPeer(from);openPeer(from);return;}
    if(data.optBoolean("restart",false)){if(peer.initiator)offer(peer);return;}
    JSONObject description=data.optJSONObject("description");
    if(description!=null){
      String kind=description.optString("type","");
      if(!kind.equals("offer")&&!kind.equals("answer"))return;
      SessionDescription sdp=new SessionDescription(
        kind.equals("offer")?SessionDescription.Type.OFFER:SessionDescription.Type.ANSWER,
        description.optString("sdp",""));
      peer.pc.setRemoteDescription(new SDP(){
        @Override public void onSetSuccess(){
          synchronized(peer.iceQueue){
            for(IceCandidate candidate:peer.iceQueue)peer.pc.addIceCandidate(candidate);
            peer.iceQueue.clear();
          }
          if(kind.equals("offer"))answer(peer);
        }
      },sdp);
      return;
    }
    JSONObject candidate=data.optJSONObject("candidate");
    if(candidate!=null){
      IceCandidate value=new IceCandidate(candidate.optString("sdpMid"),
        candidate.optInt("sdpMLineIndex"),candidate.optString("candidate"));
      if(peer.pc.getRemoteDescription()!=null)peer.pc.addIceCandidate(value);
      else synchronized(peer.iceQueue){peer.iceQueue.add(value);}
    }
  }
  private void dropPeer(String id){
    Peer p=peers.remove(id);if(p==null)return;
    if(p.remoteVideo!=null&&p.view!=null)p.remoteVideo.removeSink(p.view);
    if(p.view!=null){
      onMain(()->{
        if(videos!=null)videos.removeView(p.view);
        p.view.release();
      });
    }
    p.pc.close();p.pc.dispose();
    if(peers.isEmpty()&&placeholder!=null)placeholder.setVisibility(View.VISIBLE);
  }
  void stop(){
    if(stopped)return;
    pendingMic=false;pendingCamera=false;
    disableMedia();stopped=true;
    for(String id:new ArrayList<>(peers.keySet()))dropPeer(id);
    if(capturer!=null){
      try{capturer.stopCapture();}catch(Exception ignored){}
      capturer.dispose();capturer=null;
    }
    if(videoTrack!=null&&localView!=null)videoTrack.removeSink(localView);
    if(localView!=null){localView.release();localView=null;}
    if(captureHelper!=null){captureHelper.dispose();captureHelper=null;}
    if(videoTrack!=null){videoTrack.dispose();videoTrack=null;}
    if(videoSource!=null){videoSource.dispose();videoSource=null;}
    if(audioTrack!=null){audioTrack.dispose();audioTrack=null;}
    if(audioSource!=null){audioSource.dispose();audioSource=null;}
    if(factory!=null){factory.dispose();factory=null;}
    if(egl!=null){egl.release();egl=null;}
    restoreAudioRoute();
    main.removeCallbacksAndMessages(null);
  }
}

