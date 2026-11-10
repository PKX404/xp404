package com.pkx404.xpartynative;

import android.app.Activity;
import android.content.Context;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.graphics.Color;

import org.json.JSONArray;
import org.json.JSONObject;
import org.webrtc.AudioSource;
import org.webrtc.AudioTrack;
import org.webrtc.Camera2Enumerator;
import org.webrtc.CameraVideoCapturer;
import org.webrtc.DataChannel;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.JavaAudioDeviceModule;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.MediaStreamTrack;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpReceiver;
import org.webrtc.RtpSender;
import org.webrtc.RtpTransceiver;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.SurfaceViewRenderer;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;
import org.webrtc.VideoCapturer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Native WebRTC calling and on-screen video surfaces. Signaling is sent through
 * the existing room's {type:"signal",to,signal} WebSocket protocol.
 * No arbitrary capture of playback surfaces and no DRM video access.
 */
public final class NativeCallManager {
  public interface Events {
    void sendSignal(String to, JSONObject signal);
    void sendMedia(boolean mic,boolean camera);
    void showStatus(String text);
  }
  private static final String AUDIO_ID="xparty-native-audio",VIDEO_ID="xparty-native-camera";
  private final Activity activity;
  private final Handler main=new Handler(Looper.getMainLooper());
  private final Events events;
  private final EglBase egl;
  private final PeerConnectionFactory factory;
  private final AudioSource audioSource;
  private final AudioTrack audioTrack;
  private final Map<String,Peer> peers=new HashMap<>();
  private final Set<String> available=new HashSet<>();
  private final AudioManager audioManager;
  private final FrameLayout videoPanel;
  private final LinearLayout tileRow;
  private SurfaceViewRenderer localView;
  private VideoSource videoSource;
  private VideoTrack cameraTrack;
  private VideoCapturer cameraCapturer;
  private SurfaceTextureHelper cameraThread;
  private String selfId="";
  private JSONArray iceServers=new JSONArray();
  private boolean micEnabled=false, cameraEnabled=false,closed=false,inCall=false;
  private boolean originallySpeaker, speakerModeChanged=false;

  private static class Peer {
    final String id;
    PeerConnection connection;
    final ArrayList<IceCandidate> pendingCandidates=new ArrayList<>();
    SessionDescription pendingRemote;
    VideoTrack video;
    SurfaceViewRenderer view;
    int session;
    boolean initiator,negotiated=false;
    Peer(String id){this.id=id;}
  }
  private final class SdpActions implements SdpObserver {
    final Runnable ok;
    SdpActions(Runnable done){ok=done;}
    @Override public void onCreateSuccess(SessionDescription desc){}
    @Override public void onSetSuccess(){if(ok!=null)main.post(ok);}
    @Override public void onCreateFailure(String reason){main.post(()->events.showStatus("Call offer failed"));}
    @Override public void onSetFailure(String reason){main.post(()->events.showStatus("Call negotiation failed"));}
  }

  public NativeCallManager(Activity activity,FrameLayout host,Events events) {
    this.activity=activity;this.events=events;this.videoPanel=host;
    audioManager=(AudioManager)activity.getSystemService(Context.AUDIO_SERVICE);
    originallySpeaker=audioManager!=null&&audioManager.isSpeakerphoneOn();
    PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(activity.getApplicationContext()).createInitializationOptions());
    egl=EglBase.create();
    JavaAudioDeviceModule adm=JavaAudioDeviceModule.builder(activity)
       .setUseHardwareAcousticEchoCanceler(true)
       .setUseHardwareNoiseSuppressor(true)
       .createAudioDeviceModule();
    factory=PeerConnectionFactory.builder()
       .setAudioDeviceModule(adm)
       .setVideoEncoderFactory(new DefaultVideoEncoderFactory(egl.getEglBaseContext(),true,true))
       .setVideoDecoderFactory(new DefaultVideoDecoderFactory(egl.getEglBaseContext()))
       .createPeerConnectionFactory();
    adm.release();
    audioSource=factory.createAudioSource(new MediaConstraints());
    audioTrack=factory.createAudioTrack(AUDIO_ID,audioSource);
    audioTrack.setEnabled(false);
    tileRow=new LinearLayout(activity);
    tileRow.setOrientation(LinearLayout.HORIZONTAL);
    tileRow.setGravity(android.view.Gravity.CENTER_VERTICAL);
    videoPanel.addView(tileRow,new FrameLayout.LayoutParams(-1,-1));
    if(audioManager!=null){audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
      audioManager.setSpeakerphoneOn(true);speakerModeChanged=true;}
  }

  public boolean isMicOn(){return micEnabled;}
  public boolean isCameraOn(){return cameraEnabled;}
  public void updateRoom(String me,JSONObject room,JSONArray ice){
    if(closed||room==null)return;
    selfId=me;iceServers=ice==null?new JSONArray():ice;
    JSONArray people=room.optJSONArray("people");
    Set<String> wanted=new HashSet<>();
    boolean seated=false;
    if(people!=null)for(int i=0;i<people.length();i++){
      JSONObject p=people.optJSONObject(i);if(p==null)continue;
      if(me.equals(p.optString("id")))seated=p.optBoolean("inCall",false);
    }
    inCall=seated;
    if(!seated&&(micEnabled||cameraEnabled)){setMic(false);setCamera(false);}
    if(people!=null&&seated){
      for(int i=0;i<people.length();i++){
        JSONObject p=people.optJSONObject(i);if(p==null)continue;
        String id=p.optString("id");int session=p.optInt("session",0);
        if(!id.equals(me)&&p.optBoolean("inCall")&&p.optBoolean("online")){
          wanted.add(id);
          Peer old=peers.get(id);
          if(old!=null&&old.session!=session){removePeer(id);old=null;}
          if(old==null)createPeer(id,session);
        }
      }
    }
    for(String id:new ArrayList<>(peers.keySet()))if(!wanted.contains(id))removePeer(id);
  }
  private PeerConnection.RTCConfiguration config(){
    ArrayList<PeerConnection.IceServer> servers=new ArrayList<>();
    for(int i=0;i<iceServers.length();i++){
      JSONObject entry=iceServers.optJSONObject(i);if(entry==null)continue;
      ArrayList<String> urls=new ArrayList<>();
      JSONArray list=entry.optJSONArray("urls");
      if(list!=null)for(int j=0;j<list.length();j++)urls.add(list.optString(j));
      else if(!entry.optString("urls").isEmpty())urls.add(entry.optString("urls"));
      if(urls.isEmpty())continue;
      PeerConnection.IceServer.Builder b=PeerConnection.IceServer.builder(urls);
      if(entry.has("username"))b.setUsername(entry.optString("username"));
      if(entry.has("credential"))b.setPassword(entry.optString("credential"));
      servers.add(b.createIceServer());
    }
    PeerConnection.RTCConfiguration cfg=new PeerConnection.RTCConfiguration(servers);
    cfg.sdpSemantics=PeerConnection.SdpSemantics.UNIFIED_PLAN;
    return cfg;
  }
  private void createPeer(String id,int session){
    Peer peer=new Peer(id);peer.session=session;peer.initiator=selfId.compareTo(id)<0;peers.put(id,peer);
    peer.connection=factory.createPeerConnection(config(),new PeerConnection.Observer(){
      @Override public void onSignalingChange(PeerConnection.SignalingState state){}
      @Override public void onIceConnectionChange(PeerConnection.IceConnectionState state){
        if(state==PeerConnection.IceConnectionState.CONNECTED)
           main.post(()->events.showStatus("Call connected"));
        if(state==PeerConnection.IceConnectionState.FAILED)
           main.post(()->{if(peers.get(id)==peer&&peer.initiator){sendReset(peer);}});
      }
      @Override public void onIceConnectionReceivingChange(boolean value){}
      @Override public void onIceGatheringChange(PeerConnection.IceGatheringState state){}
      @Override public void onIceCandidate(IceCandidate candidate){
        try{
          JSONObject c=new JSONObject();
          c.put("candidate",candidate.sdp);
          c.put("sdpMid",candidate.sdpMid);
          c.put("sdpMLineIndex",candidate.sdpMLineIndex);
          signal(peer,new JSONObject().put("candidate",c));
        }catch(Exception ignored){}
      }
      @Override public void onIceCandidatesRemoved(IceCandidate[] candidates){}
      @Override public void onAddStream(MediaStream stream){}
      @Override public void onRemoveStream(MediaStream stream){}
      @Override public void onDataChannel(DataChannel channel){}
      @Override public void onRenegotiationNeeded(){}
      @Override public void onAddTrack(RtpReceiver receiver,MediaStream[] streams){
        MediaStreamTrack track=receiver.track();
        if(track instanceof VideoTrack)attachVideo(peer,(VideoTrack)track);
      }
      @Override public void onTrack(RtpTransceiver transceiver){
        MediaStreamTrack track=transceiver.getReceiver().track();
        if(track instanceof VideoTrack)attachVideo(peer,(VideoTrack)track);
      }
    });
    if(peer.connection==null){peers.remove(id);events.showStatus("Call connection unavailable");return;}
    RtpTransceiver audio=peer.connection.addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO);
    if(audio!=null){audio.setDirection(RtpTransceiver.RtpTransceiverDirection.SEND_RECV);audio.getSender().setTrack(audioTrack,false);}
    RtpTransceiver video=peer.connection.addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO);
    if(video!=null){video.setDirection(RtpTransceiver.RtpTransceiverDirection.SEND_RECV);if(cameraTrack!=null)video.getSender().setTrack(cameraTrack,false);}
    if(peer.initiator){
      peer.connection.createDataChannel("xparty-file",new DataChannel.Init());
      createOffer(peer);
    }
  }
  private void signal(Peer p,JSONObject s){main.post(()->{if(!closed&&peers.get(p.id)==p)events.sendSignal(p.id,s);});}
  private void sendReset(Peer p){signal(p,json("reset",true));removePeer(p.id);createPeer(p.id,p.session);}
  private JSONObject json(String key,Object v){
    JSONObject j=new JSONObject();try{j.put(key,v);}catch(Exception ignored){}return j;
  }
  private void createOffer(Peer p){
    PeerConnection pc=p.connection;
    if(pc==null||pc.signalingState()==PeerConnection.SignalingState.CLOSED)return;
    pc.createOffer(new SdpObserver(){
      @Override public void onCreateSuccess(SessionDescription d){
        pc.setLocalDescription(new SdpActions(()->sendDescription(p,d)),d);
      }
      @Override public void onCreateFailure(String reason){main.post(()->events.showStatus("Call offer unavailable"));}
      @Override public void onSetSuccess(){}
      @Override public void onSetFailure(String reason){}
    },new MediaConstraints());
  }
  private void sendDescription(Peer p,SessionDescription d){
    try{
      JSONObject desc=new JSONObject();
      desc.put("type",d.type.canonicalForm());desc.put("sdp",d.description);
      signal(p,new JSONObject().put("description",desc));
    }catch(Exception ignored){}
  }
  public void onSignal(String from,JSONObject signal){
    if(closed||from==null||signal==null)return;
    if(signal.optBoolean("reset")){
      Peer peer=peers.get(from);if(peer!=null){int session=peer.session;removePeer(from);createPeer(from,session);}return;
    }
    Peer p=peers.get(from);
    if(p==null){return;}
    JSONObject desc=signal.optJSONObject("description");
    if(desc!=null){
      try{
        SessionDescription sd=new SessionDescription(SessionDescription.Type.fromCanonicalForm(desc.getString("type")),desc.getString("sdp"));
        p.connection.setRemoteDescription(new SdpActions(()->{
          for(IceCandidate c:new ArrayList<>(p.pendingCandidates))p.connection.addIceCandidate(c);
          p.pendingCandidates.clear();
          if(sd.type==SessionDescription.Type.OFFER){
            p.connection.createAnswer(new SdpObserver(){
              @Override public void onCreateSuccess(SessionDescription answer){
                p.connection.setLocalDescription(new SdpActions(()->sendDescription(p,answer)),answer);
              }
              @Override public void onCreateFailure(String error){events.showStatus("Call answer unavailable");}
              @Override public void onSetSuccess(){}
              @Override public void onSetFailure(String error){}
            },new MediaConstraints());
          }
        }),sd);
      }catch(Exception e){events.showStatus("Invalid call description");}
    }else{
      JSONObject c=signal.optJSONObject("candidate");
      if(c!=null){
        IceCandidate candidate=new IceCandidate(c.optString("sdpMid"),c.optInt("sdpMLineIndex"),c.optString("candidate"));
        if(p.connection.getRemoteDescription()!=null)p.connection.addIceCandidate(candidate);
        else p.pendingCandidates.add(candidate);
      }
      if(signal.optBoolean("restart")&&p.initiator)sendReset(p);
    }
  }
  public boolean canStartMedia(){return inCall&&!closed;}
  public void setMic(boolean on){
    if(closed)return;
    micEnabled=on&&inCall;
    audioTrack.setEnabled(micEnabled);
    events.sendMedia(micEnabled,cameraEnabled);
    events.showStatus(micEnabled?"Microphone on · echo cancellation enabled":"Microphone off");
  }
  public void setCamera(boolean on){
    if(closed)return;
    boolean desired=on&&inCall;
    if(desired&&!cameraEnabled)startCamera();
    if(!desired&&cameraEnabled)stopCamera();
    cameraEnabled=desired&&cameraTrack!=null;
    events.sendMedia(micEnabled,cameraEnabled);
    events.showStatus(cameraEnabled?"Camera on":desired?"Camera unavailable":"Camera off");
  }
  private void startCamera(){
    try{
      Camera2Enumerator enumerator=new Camera2Enumerator(activity);
      String[] devices=enumerator.getDeviceNames();String selected=null;
      for(String device:devices)if(enumerator.isFrontFacing(device)){selected=device;break;}
      if(selected==null&&devices.length>0)selected=devices[0];
      if(selected==null)return;
      cameraCapturer=enumerator.createCapturer(selected,null);
      if(cameraCapturer==null)return;
      videoSource=factory.createVideoSource(false);
      cameraThread=SurfaceTextureHelper.create("XPartyCamera",egl.getEglBaseContext());
      cameraCapturer.initialize(cameraThread,activity,videoSource.getCapturerObserver());
      cameraCapturer.startCapture(320,240,15);
      cameraTrack=factory.createVideoTrack(VIDEO_ID,videoSource);
      cameraTrack.setEnabled(true);
      for(Peer p:peers.values()){
        if(p.connection==null)continue;
        for(RtpTransceiver t:p.connection.getTransceivers())
          if(t.getMediaType()==MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO)t.getSender().setTrack(cameraTrack,false);
      }
      showLocalVideo();
    }catch(Exception e){stopCamera();events.showStatus("Camera unavailable");}
  }
  private void showLocalVideo(){
    if(cameraTrack==null)return;
    if(localView==null){
      localView=new SurfaceViewRenderer(activity);localView.init(egl.getEglBaseContext(),null);
      localView.setMirror(true);tileRow.addView(localView,new LinearLayout.LayoutParams(0,-1,1));
    }
    cameraTrack.addSink(localView);
  }
  private void attachVideo(Peer p,VideoTrack video){
    main.post(()->{
      if(closed||peers.get(p.id)!=p)return;
      if(p.video==video)return;
      if(p.video!=null&&p.view!=null)p.video.removeSink(p.view);
      p.video=video;
      if(p.view==null){p.view=new SurfaceViewRenderer(activity);
        p.view.init(egl.getEglBaseContext(),null);
        tileRow.addView(p.view,new LinearLayout.LayoutParams(0,-1,1));
      }
      p.video.addSink(p.view);
    });
  }
  private void stopCamera(){
    for(Peer p:peers.values())if(p.connection!=null)for(RtpTransceiver t:p.connection.getTransceivers())
      if(t.getMediaType()==MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO)t.getSender().setTrack(null,false);
    if(cameraTrack!=null&&localView!=null)cameraTrack.removeSink(localView);
    if(localView!=null){tileRow.removeView(localView);localView.release();localView=null;}
    if(cameraCapturer!=null){try{cameraCapturer.stopCapture();}catch(InterruptedException e){Thread.currentThread().interrupt();}cameraCapturer.dispose();cameraCapturer=null;}
    if(cameraTrack!=null){cameraTrack.dispose();cameraTrack=null;}
    if(videoSource!=null){videoSource.dispose();videoSource=null;}
    if(cameraThread!=null){cameraThread.dispose();cameraThread=null;}
  }
  private void removePeer(String id){
    Peer p=peers.remove(id);if(p==null)return;
    if(p.video!=null&&p.view!=null)p.video.removeSink(p.view);
    if(p.view!=null){tileRow.removeView(p.view);p.view.release();p.view=null;}
    if(p.connection!=null){p.connection.close();p.connection.dispose();p.connection=null;}
  }
  public void close(){
    if(closed)return;
    micEnabled=false;cameraEnabled=false;inCall=false;
    stopCamera();
    for(String id:new ArrayList<>(peers.keySet()))removePeer(id);
    audioTrack.setEnabled(false);audioTrack.dispose();audioSource.dispose();
    factory.dispose();egl.release();
    if(audioManager!=null){audioManager.setMode(AudioManager.MODE_NORMAL);
      if(speakerModeChanged)audioManager.setSpeakerphoneOn(originallySpeaker);}
    closed=true;
  }
}
