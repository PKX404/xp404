package com.pkx404.xpartynative;

import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.view.PixelCopy;
import android.view.SurfaceView;

/**
 * Samples a tiny image of the app's own non-protected Media3 SurfaceView to
 * tint the room surroundings. Never samples third-party DRM/protected apps.
 * Sampling stops with the source and avoids full-resolution frame allocations.
 */
public final class NativeImmersiveSampler {
  public interface FrameConsumer { void onFrame(Bitmap smallFrame); }
  private final Handler main=new Handler(Looper.getMainLooper());
  private final FrameConsumer consumer;
  private SurfaceView surface;
  private long generation=0;
  private boolean running=false,busy=false;
  private int failures=0;
  public NativeImmersiveSampler(FrameConsumer consumer){this.consumer=consumer;}
  public void start(SurfaceView view){
    stop();
    if(view==null)return;
    this.surface=view;running=true;failures=0;sample(++generation);
  }
  private void sample(long n){
    if(!running||n!=generation||surface==null||busy)return;
    if(!surface.isAttachedToWindow()||!surface.getHolder().getSurface().isValid()){
      main.postDelayed(()->sample(n),450);return;
    }
    busy=true;
    Bitmap frame=Bitmap.createBitmap(28,16,Bitmap.Config.ARGB_8888);
    try{
      PixelCopy.request(surface,frame,result->{
        busy=false;
        if(!running||n!=generation){frame.recycle();return;}
        if(result==PixelCopy.SUCCESS&&hasPicture(frame)){
          failures=0;
          consumer.onFrame(frame);
        }else{frame.recycle();failures++;}
        if(failures<6)main.postDelayed(()->sample(n),460);
      },main);
    }catch(RuntimeException ex){
      frame.recycle();busy=false;failures++;
      if(failures<6)main.postDelayed(()->sample(n),700);
    }
  }
  private boolean hasPicture(Bitmap b){
    int colored=0;
    for(int y=1;y<b.getHeight()-1;y+=3)for(int x=1;x<b.getWidth()-1;x+=3){
      int color=b.getPixel(x,y);
      int r=(color>>>16)&255,g=(color>>>8)&255,bl=color&255;
      if(Math.max(r,Math.max(g,bl))>22)colored++;
    }
    return colored>=6;
  }
  public void stop(){
    running=false;surface=null;busy=false;generation++;
  }
}