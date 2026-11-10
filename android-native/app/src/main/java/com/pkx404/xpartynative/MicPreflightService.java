package com.pkx404.xpartynative;

import android.app.Service;
import android.content.Intent;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Bundle;
import android.os.IBinder;
import android.os.ResultReceiver;
import android.util.Log;
import org.webrtc.AudioSource;
import org.webrtc.AudioTrack;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.SoftwareVideoEncoderFactory;
import org.webrtc.SoftwareVideoDecoderFactory;

/**
 * An intentionally separate process. A fatal native WebRTC startup error must
 * not kill the XParty watch room. The service never transmits or stores audio.
 */
public final class MicPreflightService extends Service {
  static final int READY=1, FAILED=0;
  private static final String TAG="XPartyMicPreflight";
  @Override public IBinder onBind(Intent intent){return null;}
  @Override public int onStartCommand(Intent intent,int flags,int startId){
    final ResultReceiver callback=intent==null?null:intent.getParcelableExtra("xpartyMicCallback");
    new Thread(()->{
      AudioRecord input=null;
      PeerConnectionFactory factory=null;
      AudioSource source=null;
      AudioTrack track=null;
      int outcome=FAILED;
      String detail="unknown error";
      try{
        int sampleRate=16000;
        int min=AudioRecord.getMinBufferSize(sampleRate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
        if(min<=0)throw new IllegalStateException("Microphone buffer unsupported: "+min);
        input=new AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION,sampleRate,
          AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(min*2,4096));
        if(input.getState()!=AudioRecord.STATE_INITIALIZED)
          throw new IllegalStateException("Microphone cannot initialize");
        input.startRecording();
        if(input.getRecordingState()!=AudioRecord.RECORDSTATE_RECORDING)
          throw new IllegalStateException("Microphone could not start");
        short[] buffer=new short[256];
        int result=input.read(buffer,0,buffer.length,AudioRecord.READ_NON_BLOCKING);
        if(result<0)throw new IllegalStateException("Microphone read unavailable: "+result);
        input.stop();
        input.release();
        input=null;
        // This is the same JNI factory and local audio-track creation used by
        // NativeCallController, but inside :micprobe rather than the UI process.
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions
          .builder(getApplicationContext()).setEnableInternalTracer(false)
          .createInitializationOptions());
        factory=PeerConnectionFactory.builder()
          .setOptions(new PeerConnectionFactory.Options())
          .setVideoEncoderFactory(new SoftwareVideoEncoderFactory())
          .setVideoDecoderFactory(new SoftwareVideoDecoderFactory())
          .createPeerConnectionFactory();
        if(factory==null)throw new IllegalStateException("WebRTC factory unavailable");
        source=factory.createAudioSource(new org.webrtc.MediaConstraints());
        if(source==null)throw new IllegalStateException("WebRTC audio source unavailable");
        track=factory.createAudioTrack("xparty-mic-preflight",source);
        if(track==null)throw new IllegalStateException("WebRTC audio track unavailable");
        track.setEnabled(true);
        track.setEnabled(false);
        outcome=READY;
        detail="Microphone and WebRTC startup available";
        Log.i(TAG,"READY");
      }catch(Throwable t){
        detail=t.getClass().getSimpleName()+": "+String.valueOf(t.getMessage());
        Log.e(TAG,"Microphone/WebRTC probe failed",t);
      }finally{
        try{if(track!=null)track.dispose();}catch(Throwable ignored){}
        try{if(source!=null)source.dispose();}catch(Throwable ignored){}
        try{if(factory!=null)factory.dispose();}catch(Throwable ignored){}
        try{if(input!=null){if(input.getRecordingState()==AudioRecord.RECORDSTATE_RECORDING)input.stop();input.release();}}catch(Throwable ignored){}
        if(callback!=null){
          Bundle data=new Bundle();data.putString("detail",detail);
          try{callback.send(outcome,data);}catch(Throwable ignored){}
        }
        stopSelfResult(startId);
      }
    },"XPartyMicProbe").start();
    return START_NOT_STICKY;
  }
}
