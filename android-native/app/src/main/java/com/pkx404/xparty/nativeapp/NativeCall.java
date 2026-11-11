package com.pkx404.xparty.nativeapp;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;
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
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Collections;

/** Native camera/mic/peer connection engine. Signaling reuses XParty's existing room socket. */
public final class NativeCall {
    public interface SignalSender { void send(String to,JSONObject signal); }
    public interface Feedback { void report(String text); }
    private final Context context;
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final SignalSender sender;
    private final Feedback feedback;
    private final FrameLayout remoteContainer;
    private final EglBase egl;
    private final PeerConnectionFactory factory;
    private final Map<String,Peer> peers=new HashMap<>();
    private final List<PeerConnection.IceServer> ice=new ArrayList<>();
    private AudioSource audioSource;
    private AudioTrack audioTrack;
    private VideoSource videoSource;
    private VideoTrack videoTrack;
    private CameraVideoCapturer camera;
    private SurfaceTextureHelper helper;
    private SurfaceViewRenderer localPreview;
    private String me="";
    private boolean micOn=false,cameraOn=false;
    public NativeCall(Context ctx,FrameLayout panel,SignalSender sender,Feedback feedback){
        context=ctx;remoteContainer=panel;this.sender=sender;this.feedback=feedback;
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(ctx).createInitializationOptions());
        egl=EglBase.create();
        factory=PeerConnectionFactory.builder()
            .setVideoEncoderFactory(new DefaultVideoEncoderFactory(egl.getEglBaseContext(),true,true))
            .setVideoDecoderFactory(new DefaultVideoDecoderFactory(egl.getEglBaseContext()))
            .createPeerConnectionFactory();
    }
    public void setIdentity(String id,JSONArray iceServers){
        me=id;
        ice.clear();
        if(iceServers!=null)for(int i=0;i<iceServers.length();i++){
            JSONObject item=iceServers.optJSONObject(i);if(item==null)continue;
            Object urls=item.opt("urls");String username=item.optString("username"),password=item.optString("credential");
            if(urls instanceof JSONArray){JSONArray a=(JSONArray)urls;for(int n=0;n<a.length();n++)addIce(a.optString(n),username,password);}
            else addIce(String.valueOf(urls),username,password);
        }
        if(ice.isEmpty())addIce("stun:stun.l.google.com:19302","","");
    }
    private void addIce(String url,String user,String pass){
        if(!url.startsWith("stun:")&&!url.startsWith("turn:")&&!url.startsWith("turns:"))return;
        ice.add(PeerConnection.IceServer.builder(url).setUsername(user).setPassword(pass).createIceServer());
    }
    public boolean isMicOn(){return micOn;}
    public boolean isCameraOn(){return cameraOn;}
    private void initAudio(){
        if(audioTrack!=null)return;
        MediaConstraints constraints=new MediaConstraints();
        constraints.mandatory.add(new MediaConstraints.KeyValuePair("googEchoCancellation","true"));
        constraints.mandatory.add(new MediaConstraints.KeyValuePair("googNoiseSuppression","true"));
        audioSource=factory.createAudioSource(constraints);
        audioTrack=factory.createAudioTrack("xparty_audio",audioSource);
        audioTrack.setEnabled(false);
    }
    private void initCamera(){
        if(videoTrack!=null)return;
        Camera2Enumerator e=new Camera2Enumerator(context);
        String[] devices=e.getDeviceNames();String selected=null;
        for(String name:devices)if(e.isFrontFacing(name)){selected=name;break;}
        if(selected==null&&devices.length>0)selected=devices[0];
        if(selected==null){feedback.report("No camera available");return;}
        camera=e.createCapturer(selected,null);
        if(camera==null)return;
        videoSource=factory.createVideoSource(false);
        helper=SurfaceTextureHelper.create("XPartyCapture",egl.getEglBaseContext());
        camera.initialize(helper,context,videoSource.getCapturerObserver());
        videoTrack=factory.createVideoTrack("xparty_video",videoSource);
        videoTrack.setEnabled(false);
        localPreview=new SurfaceViewRenderer(context);
        localPreview.init(egl.getEglBaseContext(),null);
        localPreview.setMirror(true);
        FrameLayout.LayoutParams p=new FrameLayout.LayoutParams(200,260,android.view.Gravity.RIGHT|android.view.Gravity.TOP);
        remoteContainer.addView(localPreview,p);
        videoTrack.addSink(localPreview);
    }
    public void toggleMic(){
        initAudio();micOn=!micOn;
        audioTrack.setEnabled(micOn);
        for(Peer peer:peers.values())peer.refreshTracks();
    }
    public void toggleCamera(){
        if(videoTrack==null)initCamera();
        if(videoTrack==null)return;
        cameraOn=!cameraOn;videoTrack.setEnabled(cameraOn);
        try{if(cameraOn)camera.startCapture(640,480,18);else camera.stopCapture();}catch(Exception e){feedback.report("Camera could not start");}
        localPreview.setVisibility(cameraOn?android.view.View.VISIBLE:android.view.View.GONE);
        for(Peer peer:peers.values())peer.refreshTracks();
    }
    public void updatePeople(JSONArray people){
        if(me.isEmpty()||people==null)return;
        List<String> visible=new ArrayList<>();
        for(int i=0;i<people.length();i++){
            JSONObject p=people.optJSONObject(i);if(p==null)continue;
            String id=p.optString("id");
            if(me.equals(id)||!p.optBoolean("online")||!p.optBoolean("inCall"))continue;
            visible.add(id);
            if(!peers.containsKey(id)){
                Peer peer=new Peer(id,p.optInt("session",0));peers.put(id,peer);
                if(me.compareTo(id)<0)peer.offer();
            }else if(peers.get(id).session!=p.optInt("session",0)){
                peers.get(id).close();Peer peer=new Peer(id,p.optInt("session",0));peers.put(id,peer);
                if(me.compareTo(id)<0)peer.offer();
            }
        }
        for(String id:new ArrayList<>(peers.keySet()))if(!visible.contains(id)){peers.get(id).close();peers.remove(id);}
    }
    public void onSignal(String from,JSONObject signal){
        if(from==null||signal==null)return;
        Peer peer=peers.get(from);if(peer==null){peer=new Peer(from,0);peers.put(from,peer);}
        JSONObject desc=signal.optJSONObject("description");
        if(desc!=null){
            String type=desc.optString("type"),sdp=desc.optString("sdp");
            SessionDescription.Type descriptionType="offer".equals(type)?SessionDescription.Type.OFFER:"answer".equals(type)?SessionDescription.Type.ANSWER:null;
            if(descriptionType==null||sdp.isEmpty())return;
            Peer target=peer;
            target.pc.setRemoteDescription(new PlainSdpObserver(){
                @Override public void onSetSuccess(){if(descriptionType==SessionDescription.Type.OFFER)target.answer();}
            },new SessionDescription(descriptionType,sdp));
        }
        JSONObject candidate=signal.optJSONObject("candidate");
        if(candidate!=null){
            String sdp=candidate.optString("candidate");
            if(!sdp.isEmpty())peer.pc.addIceCandidate(new IceCandidate(candidate.optString("sdpMid"),candidate.optInt("sdpMLineIndex",0),sdp));
        }
    }
    private class Peer{
        final String id;final int session;final PeerConnection pc;
        private SurfaceViewRenderer remote;
        private boolean hasAudio=false,hasVideo=false;
        Peer(String id,int session){
            this.id=id;this.session=session;
            PeerConnection.RTCConfiguration config=new PeerConnection.RTCConfiguration(ice);
            config.sdpSemantics=PeerConnection.SdpSemantics.UNIFIED_PLAN;
            pc=factory.createPeerConnection(config,new PeerConnection.Observer(){
                @Override public void onSignalingChange(PeerConnection.SignalingState state){}
                @Override public void onIceConnectionChange(PeerConnection.IceConnectionState state){}
                @Override public void onIceConnectionReceivingChange(boolean receiving){}
                @Override public void onIceGatheringChange(PeerConnection.IceGatheringState state){}
                @Override public void onIceCandidate(IceCandidate c){
                    JSONObject item=RoomSocket.with("candidate",c.sdp);
                    RoomSocket.put(item,"sdpMid",c.sdpMid);RoomSocket.put(item,"sdpMLineIndex",c.sdpMLineIndex);
                    sender.send(id,RoomSocket.with("candidate",item));
                }
                @Override public void onIceCandidatesRemoved(IceCandidate[] c){}
                @Override public void onAddStream(MediaStream stream){
                    if(!stream.videoTracks.isEmpty())attachRemote(stream.videoTracks.get(0));
                }
                @Override public void onRemoveStream(MediaStream stream){}
                @Override public void onDataChannel(DataChannel channel){}
                @Override public void onRenegotiationNeeded(){}
                @Override public void onAddTrack(RtpReceiver receiver,MediaStream[] streams){
                    if(receiver.track() instanceof VideoTrack)attachRemote((VideoTrack)receiver.track());
                }
            });
            if(pc==null)throw new IllegalStateException("WebRTC peer initialization failed");
            refreshTracks();
        }
        void refreshTracks(){
            boolean changed=false;
            if(audioTrack!=null&&!hasAudio){pc.addTrack(audioTrack,Collections.singletonList("xparty"));hasAudio=true;changed=true;}
            if(videoTrack!=null&&!hasVideo){pc.addTrack(videoTrack,Collections.singletonList("xparty"));hasVideo=true;changed=true;}
            if(changed&&peers.containsKey(id))ui.postDelayed(()->{if(pc.signalingState()==PeerConnection.SignalingState.STABLE)offer();},220);
        }
        void attachRemote(VideoTrack track){
            ui.post(()->{
                if(remote!=null)return;
                remote=new SurfaceViewRenderer(context);
                remote.init(egl.getEglBaseContext(),null);
                remote.setMirror(false);
                FrameLayout.LayoutParams p=new FrameLayout.LayoutParams(-1,-1);
                remoteContainer.addView(remote,0,p);
                track.addSink(remote);
            });
        }
        private void create(boolean answer){
            MediaConstraints media=new MediaConstraints();
            PlainSdpObserver observer=new PlainSdpObserver(){
                @Override public void onCreateSuccess(SessionDescription sdp){
                    pc.setLocalDescription(new PlainSdpObserver(){
                        @Override public void onSetSuccess(){
                            JSONObject item=RoomSocket.with("type",sdp.type.canonicalForm());
                            RoomSocket.put(item,"sdp",sdp.description);
                            sender.send(id,RoomSocket.with("description",item));
                        }
                    },sdp);
                }
                @Override public void onCreateFailure(String error){feedback.report("Cannot establish a call");}
            };
            if(answer)pc.createAnswer(observer,media);else pc.createOffer(observer,media);
        }
        void offer(){create(false);}
        void answer(){create(true);}
        void close(){pc.close();pc.dispose();if(remote!=null){remoteContainer.removeView(remote);remote.release();remote=null;}}
    }
    private static class PlainSdpObserver implements SdpObserver{
        @Override public void onCreateSuccess(SessionDescription description){}
        @Override public void onSetSuccess(){}
        @Override public void onCreateFailure(String error){}
        @Override public void onSetFailure(String error){}
    }
    public void reset(){
        for(Peer p:new ArrayList<>(peers.values()))p.close();peers.clear();
        if(camera!=null){try{camera.stopCapture();}catch(Exception ignored){}camera.dispose();camera=null;}
        if(videoTrack!=null){videoTrack.dispose();videoTrack=null;}
        if(videoSource!=null){videoSource.dispose();videoSource=null;}
        if(helper!=null){helper.dispose();helper=null;}
        if(audioTrack!=null){audioTrack.dispose();audioTrack=null;}
        if(audioSource!=null){audioSource.dispose();audioSource=null;}
        if(localPreview!=null){remoteContainer.removeView(localPreview);localPreview.release();localPreview=null;}
        micOn=false;cameraOn=false;me="";
    }
    public void destroy(){reset();factory.dispose();egl.release();}
}
