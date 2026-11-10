package com.pkx404.xpartynative;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import org.webrtc.AudioSource;
import org.webrtc.AudioTrack;
import org.webrtc.Camera1Enumerator;
import org.webrtc.Camera2Enumerator;
import org.webrtc.CameraEnumerator;
import org.webrtc.CameraVideoCapturer;
import org.webrtc.DataChannel;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
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
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.SurfaceViewRenderer;
import org.webrtc.VideoCapturer;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Genuine Android WebRTC peer media and server-compatible XParty JSON signaling.
 * No WebView, JavaScript or video-file simulation is used for microphone/camera.
 */
final class NativeCallController {
  interface Events {
    void signal(String target,JSONObject payload);
    void sendMedia(boolean mic,boolean camera);
    void action(String type);
    void status(String text);
  }
  private final Activity activity;
  private final Events events;
  private final Handler main=new Handler(Looper.getMainLooper());
  private final Map<String,Peer> peers=new HashMap<>();
  private final List<PeerConnection.IceServer> ice=new ArrayList<>();
  private PeerConnectionFactory factory;
  private EglBase egl;
  private AudioSource audioSource;
  private AudioTrack audioTrack;
  private VideoSource videoSource;
  private VideoTrack videoTrack;
  private SurfaceTextureHelper captureHelper;
  private CameraVideoCapturer cameraCapturer;
  private SurfaceViewRenderer localRenderer,remoteRenderer;
  private FrameLayout callRoot;
  private TextView statusText,micButton,cameraButton,speakerButton;
  private String me="";
  private JSONObject latestRoom;
  private boolean initialized=false,micOn=false,cameraOn=false,speakerOn=true,inCall=false,cameraStarted=false;
  private boolean destroyed=false;
  private final AudioManager audio;
  private static final int BG=0xFF141029,CARD=0xFF32234F,WHITE=0xFFF7F4FF;
  private final class Peer {
    final String id;
    final PeerConnection connection;
    final boolean initiator;
    final List<IceCandidate> pending=new ArrayList<>();
    VideoTrack incomingVideo;
    Peer(String id,PeerConnection connection,boolean initiator){
      this.id=id;this.connection=connection;this.initiator=initiator;
    }
  }
  NativeCallController(Activity activity,Events events){
    this.activity=activity;this.events=events;
    audio=(AudioManager)activity.getSystemService(Context.AUDIO_SERVICE);
  }
  private int dp(float n){return Math.round(n*activity.getResources().getDisplayMetrics().density);}
  private void report(String message){
    main.post(()->{if(!destroyed){if(statusText!=null)statusText.setText(message);events.status(message);}});
  }
  private TextView control(String label,Runnable command){
    TextView button=new TextView(activity);
    button.setText(label);button.setTextColor(WHITE);button.setTextSize(12);
    button.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
    button.setGravity(Gravity.CENTER);
    android.graphics.drawable.GradientDrawable background=new android.graphics.drawable.GradientDrawable();
    background.setColor(CARD);background.setCornerRadius(dp(15));
    background.setStroke(dp(1),0xFF68538B);
    button.setBackground(background);button.setOnClickListener(v->command.run());button.setMinHeight(dp(48));
    return button;
  }
  void attach(FrameLayout frame){
    callRoot=frame;
    frame.removeAllViews();
    frame.setBackgroundColor(0xFF171127);
    statusText=new TextView(activity);
    statusText.setTextColor(WHITE);statusText.setTextSize(12);
    statusText.setText("Tap Join Call; microphone and camera start OFF");
    statusText.setPadding(dp(12),dp(17),dp(10),dp(8));
    frame.addView(statusText,new FrameLayout.LayoutParams(-1,-2,Gravity.TOP));
    LinearLayout buttons=new LinearLayout(activity);
    buttons.setPadding(dp(6),dp(6),dp(6),dp(7));buttons.setGravity(Gravity.CENTER_VERTICAL);
    micButton=control("MIC OFF",this::toggleMic);
    cameraButton=control("CAM OFF",this::toggleCamera);
    speakerButton=control("SPEAKER",this::toggleSpeaker);
    TextView flip=control("FLIP",this::flipCamera);
    TextView hangup=control("LEAVE CALL",this::leaveSeat);
    TextView[] all={micButton,cameraButton,speakerButton,flip,hangup};
    for(int i=0;i<all.length;i++){
      LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(48),1);
      if(i>0)lp.leftMargin=dp(4);
      buttons.addView(all[i],lp);
    }
    frame.addView(buttons,new FrameLayout.LayoutParams(-1,dp(62),Gravity.BOTTOM));
    // No JNI/EGL/peer initialization here: ordinary mic and tab taps stay safe.
  }
  private void prepareVideoRenderers(){
    if(callRoot==null||localRenderer!=null||egl==null)return;
    try{
      remoteRenderer=new SurfaceViewRenderer(activity);
      remoteRenderer.init(egl.getEglBaseContext(),null);
      remoteRenderer.setEnableHardwareScaler(true);remoteRenderer.setMirror(false);
      FrameLayout.LayoutParams remoteLp=new FrameLayout.LayoutParams(-1,-1);
      remoteLp.bottomMargin=dp(70);remoteLp.topMargin=dp(40);
      callRoot.addView(remoteRenderer,0,remoteLp);
      localRenderer=new SurfaceViewRenderer(activity);
      localRenderer.init(egl.getEglBaseContext(),null);
      localRenderer.setZOrderMediaOverlay(true);localRenderer.setMirror(true);
      FrameLayout.LayoutParams preview=new FrameLayout.LayoutParams(dp(98),dp(130),Gravity.RIGHT|Gravity.TOP);
      preview.topMargin=dp(45);preview.rightMargin=dp(10);
      callRoot.addView(localRenderer,1,preview);
      localRenderer.setVisibility(View.INVISIBLE);
      if(videoTrack!=null)videoTrack.addSink(localRenderer);
    }catch(Throwable e){report("Video renderer is unavailable: "+e.getClass().getSimpleName());}
  }
  private void ensureSetup(){
    if(initialized||destroyed)return;
    PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(activity)
      .setEnableInternalTracer(false).createInitializationOptions());
    egl=EglBase.create();
    PeerConnectionFactory.Options options=new PeerConnectionFactory.Options();
    factory=PeerConnectionFactory.builder()
      .setOptions(options)
      .setVideoEncoderFactory(new DefaultVideoEncoderFactory(egl.getEglBaseContext(),true,true))
      .setVideoDecoderFactory(new DefaultVideoDecoderFactory(egl.getEglBaseContext()))
      .createPeerConnectionFactory();
    // Media tracks stay off until the user explicitly activates microphone/camera.
    audioSource=factory.createAudioSource(new MediaConstraints());
    audioTrack=factory.createAudioTrack("xparty-native-audio",audioSource);
    audioTrack.setEnabled(false);
    videoSource=factory.createVideoSource(false);
    videoTrack=factory.createVideoTrack("xparty-native-video",videoSource);
    videoTrack.setEnabled(false);
    initialized=true;
  }
  void configureIce(JSONArray servers){
    if(servers==null)return;
    ice.clear();
    for(int i=0;i<servers.length();i++){
      JSONObject entry=servers.optJSONObject(i);
      if(entry==null)continue;
      String username=entry.optString("username","");
      String password=entry.optString("credential","");
      JSONArray multi=entry.optJSONArray("urls");
      if(multi!=null){
        for(int j=0;j<multi.length();j++)addIce(multi.optString(j),username,password);
      }else addIce(entry.optString("urls"),username,password);
    }
    if(ice.isEmpty())addIce("stun:stun.l.google.com:19302","","");
  }
  private void addIce(String url,String username,String password){
    if(!(url.startsWith("stun:")||url.startsWith("turn:")||url.startsWith("turns:")))return;
    ice.add(PeerConnection.IceServer.builder(url).setUsername(username).setPassword(password).createIceServer());
  }
  void syncRoom(JSONObject room,String self){
    if(destroyed||room==null)return;
    me=self;latestRoom=room;
    JSONArray people=room.optJSONArray("people");
    if(people==null)return;
    Set<String> eligible=new HashSet<>();
    inCall=false;
    for(int i=0;i<people.length();i++){
      JSONObject p=people.optJSONObject(i);
      if(p==null)continue;
      if(self.equals(p.optString("id")))inCall=p.optBoolean("inCall",false);
      else if(p.optBoolean("inCall")&&p.optBoolean("online"))eligible.add(p.optString("id"));
    }
    for(String previous:new ArrayList<>(peers.keySet())){
      if(!eligible.contains(previous)||!inCall)removePeer(previous);
    }
    if(!inCall){report("Join a call seat to use microphone or camera.");return;}
    // Native library loading is deferred until user grants media permission.
    if(!initialized)return;
    for(String id:eligible)try{ensurePeer(id);}catch(Throwable e){report("Call peer unavailable: "+e.getClass().getSimpleName());}
  }
  private void removePeer(String id){
    Peer p=peers.remove(id);
    if(p==null)return;
    if(p.incomingVideo!=null&&remoteRenderer!=null)p.incomingVideo.removeSink(remoteRenderer);
    p.connection.close();p.connection.dispose();
    report("Participant left video call");
  }
  private void ensurePeer(String id){
    if(destroyed||id==null||id.isEmpty()||id.equals(me)||peers.containsKey(id)||factory==null)return;
    boolean initiator=me.compareTo(id)<0;
    PeerConnection.RTCConfiguration config=new PeerConnection.RTCConfiguration(new ArrayList<>(ice));
    config.sdpSemantics=PeerConnection.SdpSemantics.UNIFIED_PLAN;
    PeerConnection connection=factory.createPeerConnection(config,new PeerConnection.Observer(){
      @Override public void onSignalingChange(PeerConnection.SignalingState state){}
      @Override public void onIceConnectionChange(PeerConnection.IceConnectionState state){
        report("Peer "+state.name().toLowerCase());
      }
      @Override public void onIceConnectionReceivingChange(boolean receiving){}
      @Override public void onIceGatheringChange(PeerConnection.IceGatheringState state){}
      @Override public void onIceCandidate(IceCandidate candidate){
        try{
          JSONObject obj=new JSONObject().put("candidate",candidate.sdp)
            .put("sdpMid",candidate.sdpMid).put("sdpMLineIndex",candidate.sdpMLineIndex);
          sendSignal(id,new JSONObject().put("candidate",obj));
        }catch(Exception ignored){}
      }
      @Override public void onIceCandidatesRemoved(IceCandidate[] candidates){}
      @Override public void onAddStream(MediaStream stream){
        for(VideoTrack video:stream.videoTracks)attachRemote(id,video);
      }
      @Override public void onRemoveStream(MediaStream stream){}
      @Override public void onDataChannel(DataChannel dataChannel){}
      @Override public void onRenegotiationNeeded(){}
      @Override public void onAddTrack(RtpReceiver receiver,MediaStream[] streams){
        if(receiver.track() instanceof VideoTrack)attachRemote(id,(VideoTrack)receiver.track());
      }
      @Override public void onTrack(RtpTransceiver transceiver){
        if(transceiver.getReceiver().track() instanceof VideoTrack)
          attachRemote(id,(VideoTrack)transceiver.getReceiver().track());
      }
      @Override public void onConnectionChange(PeerConnection.PeerConnectionState state){
        report("Video peer: "+state.name().toLowerCase());
      }
    });
    if(connection==null){report("Unable to establish peer connection");return;}
    Peer p=new Peer(id,connection,initiator);
    peers.put(id,p);
    connection.addTrack(audioTrack,Collections.singletonList("xparty"));
    connection.addTrack(videoTrack,Collections.singletonList("xparty"));
    if(initiator)offer(p);
  }
  private void attachRemote(String id,VideoTrack track){
    main.post(()->{
      Peer p=peers.get(id);
      if(p==null||remoteRenderer==null)return;
      if(p.incomingVideo==track)return;
      if(p.incomingVideo!=null)p.incomingVideo.removeSink(remoteRenderer);
      p.incomingVideo=track;
      track.addSink(remoteRenderer);
      report("Remote video connected");
    });
  }
  private void sendSignal(String to,JSONObject payload){
    if(!destroyed)events.signal(to,payload);
  }
  private abstract class Callback implements SdpObserver {
    @Override public void onCreateSuccess(SessionDescription description){}
    @Override public void onSetSuccess(){}
    @Override public void onCreateFailure(String error){report("Call setup: "+error);}
    @Override public void onSetFailure(String error){report("Call setup: "+error);}
  }
  private void offer(Peer p){
    p.connection.createOffer(new Callback(){
      @Override public void onCreateSuccess(SessionDescription desc){setLocal(p,desc);}
    },new MediaConstraints());
  }
  private void answer(Peer p){
    p.connection.createAnswer(new Callback(){
      @Override public void onCreateSuccess(SessionDescription desc){setLocal(p,desc);}
    },new MediaConstraints());
  }
  private void setLocal(Peer p,SessionDescription desc){
    p.connection.setLocalDescription(new Callback(){
      @Override public void onSetSuccess(){
        try{sendSignal(p.id,new JSONObject().put("description",
          new JSONObject().put("type",desc.type.canonicalForm()).put("sdp",desc.description)));}
        catch(Exception ignored){}
      }
    },desc);
  }
  void signal(String from,JSONObject message){
    if(destroyed||from==null||message==null)return;
    try{ensureSetup();}catch(Exception e){report("WebRTC initialization failed");return;}
    if(!peers.containsKey(from))ensurePeer(from);
    Peer p=peers.get(from);
    if(p==null)return;
    if(message.optBoolean("restart",false)){if(p.initiator)offer(p);return;}
    JSONObject descr=message.optJSONObject("description");
    if(descr!=null){
      String type=descr.optString("type");
      if(!"offer".equals(type)&&!"answer".equals(type))return;
      SessionDescription sd=new SessionDescription(
        "offer".equals(type)?SessionDescription.Type.OFFER:SessionDescription.Type.ANSWER,
        descr.optString("sdp"));
      p.connection.setRemoteDescription(new Callback(){
        @Override public void onSetSuccess(){
          synchronized(p.pending){
            for(IceCandidate ice:p.pending)p.connection.addIceCandidate(ice);
            p.pending.clear();
          }
          if("offer".equals(type))answer(p);
        }
      },sd);
      return;
    }
    JSONObject candidate=message.optJSONObject("candidate");
    if(candidate!=null){
      IceCandidate parsed=new IceCandidate(candidate.optString("sdpMid"),
        candidate.optInt("sdpMLineIndex"),
        candidate.optString("candidate"));
      if(p.connection.getRemoteDescription()!=null)p.connection.addIceCandidate(parsed);
      else synchronized(p.pending){p.pending.add(parsed);}
    }
    if(message.optBoolean("reset",false)){removePeer(from);ensurePeer(from);}
  }
  private boolean askPermission(String permission){
    if(Build.VERSION.SDK_INT<23||activity.checkSelfPermission(permission)==PackageManager.PERMISSION_GRANTED)return true;
    activity.requestPermissions(new String[]{permission},Manifest.permission.CAMERA.equals(permission)?2202:2201);
    report("Grant "+(Manifest.permission.CAMERA.equals(permission)?"camera":"microphone")+" permission, then tap again.");
    return false;
  }
  void toggleMic(){
    if(destroyed)return;
    if(!askPermission(Manifest.permission.RECORD_AUDIO))return;
    if(!inCall){events.action("call-join");report("Joining the call · tap microphone again to speak");return;}
    try{
      ensureSetup();
      if(audioTrack==null){report("Microphone unavailable on this device");return;}
      micOn=!micOn;
      audioTrack.setEnabled(micOn);
      if(latestRoom!=null)syncRoom(latestRoom,me);
      if(micButton!=null)micButton.setText(micOn?"MIC ON":"MIC OFF");
      events.sendMedia(micOn,cameraOn);
    }catch(Throwable failure){
      micOn=false;
      report("Could not initialize microphone: "+failure.getClass().getSimpleName());
    }
  }
  void toggleCamera(){
    if(!inCall){events.action("call-join");report("Requesting a call seat…");return;}
    if(!askPermission(Manifest.permission.CAMERA))return;
    try{ensureSetup();}catch(Throwable e){report("Camera unavailable: "+e.getClass().getSimpleName());return;}
    if(!cameraOn){
      prepareVideoRenderers();
      if(!cameraStarted&&!startCamera())return;
      cameraOn=true;videoTrack.setEnabled(true);
      if(localRenderer!=null){videoTrack.addSink(localRenderer);localRenderer.setVisibility(View.VISIBLE);}
    }else{
      cameraOn=false;videoTrack.setEnabled(false);
      if(localRenderer!=null)localRenderer.setVisibility(View.INVISIBLE);
    }
    if(cameraButton!=null)cameraButton.setText(cameraOn?"CAM ON":"CAM OFF");
    events.sendMedia(micOn,cameraOn);
  }
  private boolean startCamera(){
    try{
      CameraEnumerator enumerator=Camera2Enumerator.isSupported(activity)
        ?new Camera2Enumerator(activity):new Camera1Enumerator(false);
      String front=null,rear=null;
      for(String name:enumerator.getDeviceNames()){
        if(enumerator.isFrontFacing(name))front=name;
        else if(rear==null)rear=name;
      }
      String name=front==null?rear:front;
      if(name==null){report("No camera available");return false;}
      VideoCapturer capturer=enumerator.createCapturer(name,null);
      if(!(capturer instanceof CameraVideoCapturer))return false;
      cameraCapturer=(CameraVideoCapturer)capturer;
      captureHelper=SurfaceTextureHelper.create("XPartyNativeCamera",egl.getEglBaseContext());
      cameraCapturer.initialize(captureHelper,activity,videoSource.getCapturerObserver());
      cameraCapturer.startCapture(360,480,15);
      cameraStarted=true;return true;
    }catch(Exception e){report("Could not start camera: "+e.getMessage());return false;}
  }
  void flipCamera(){
    if(cameraCapturer==null||!cameraStarted){report("Turn on the camera first");return;}
    try{cameraCapturer.switchCamera(null);}catch(Exception e){report("Unable to switch camera");}
  }
  void toggleSpeaker(){
    speakerOn=!speakerOn;
    audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
    audio.setSpeakerphoneOn(speakerOn);
    if(speakerButton!=null)speakerButton.setText(speakerOn?"SPEAKER":"EARPIECE");
  }
  void leaveSeat(){
    if(!inCall){report("Not currently in a call");return;}
    micOn=false;cameraOn=false;
    if(audioTrack!=null)audioTrack.setEnabled(false);
    if(videoTrack!=null)videoTrack.setEnabled(false);
    if(localRenderer!=null)localRenderer.setVisibility(View.INVISIBLE);
    if(micButton!=null)micButton.setText("MIC OFF");
    if(cameraButton!=null)cameraButton.setText("CAM OFF");
    events.sendMedia(false,false);events.action("call-leave");
    report("Left video call");
  }
  boolean isMicOn(){return micOn;}
  boolean isCameraOn(){return cameraOn;}
  void stop(){
    destroyed=true;
    for(String id:new ArrayList<>(peers.keySet()))removePeer(id);
    if(cameraCapturer!=null){
      try{cameraCapturer.stopCapture();}catch(Exception ignored){}
      cameraCapturer.dispose();cameraCapturer=null;
    }
    if(videoTrack!=null&&localRenderer!=null)videoTrack.removeSink(localRenderer);
    if(localRenderer!=null){localRenderer.release();localRenderer=null;}
    if(remoteRenderer!=null){remoteRenderer.release();remoteRenderer=null;}
    if(captureHelper!=null){captureHelper.dispose();captureHelper=null;}
    if(audioTrack!=null)audioTrack.dispose();
    if(videoTrack!=null)videoTrack.dispose();
    if(audioSource!=null)audioSource.dispose();
    if(videoSource!=null)videoSource.dispose();
    if(factory!=null)factory.dispose();
    if(egl!=null)egl.release();
    audio.setMode(AudioManager.MODE_NORMAL);
  }
}
