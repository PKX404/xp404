package com.pkx404.xpartynative;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.PixelCopy;
import android.view.SurfaceView;
import android.view.View;
import android.webkit.WebView;
import androidx.media3.ui.PlayerView;

/**
 * Native analogue of XParty v31.6 immersive.js/ambient.js.
 * Fast, small on-device frame sampling, broad blended color and a dark text scrim.
 * Never alters the player size, attempts video extraction or writes frames to disk.
 */
final class NativeImmersiveBackdrop {
  private final Handler main=new Handler(Looper.getMainLooper());
  private final Activity activity;
  private final View target;
  private final PlayerView player;
  private final WebView youtube;
  private final RoomDrawable drawable=new RoomDrawable();
  private boolean enabled=true,running=false,busy=false,hasSource=false,usingYouTube=false;
  private Bitmap frame;
  private long lastImageAt=0;
  private final Runnable ticker=new Runnable(){
    @Override public void run(){
      if(!running)return;
      if(enabled&&hasSource)sample();
      main.postDelayed(this,200); // v31.6 follows decoded frames; this is a bounded ~5 FPS compromise.
    }
  };
  NativeImmersiveBackdrop(Activity activity,View target,PlayerView player,WebView youtube){
    this.activity=activity;
    this.target=target;
    this.player=player;
    this.youtube=youtube;
    target.setBackground(drawable);
  }
  void setSource(String type,boolean exists){
    hasSource=exists;usingYouTube="youtube".equals(type);
    if(!exists){drawable.setImage(null);return;}
    refresh();
  }
  void setEnabled(boolean on){
    enabled=on;
    if(!on){drawable.setImage(null);target.invalidate();}
    else refresh();
  }
  void start(){
    if(running)return;
    running=true;
    main.postDelayed(ticker,250);
  }
  void refresh(){
    if(running&&enabled&&hasSource)main.post(this::sample);
  }
  void stop(){
    running=false;
    main.removeCallbacks(ticker);
    busy=false;
    frame=null;
    drawable.setImage(null);
  }
  private void sample(){
    if(!running||!enabled||!hasSource||busy||Build.VERSION.SDK_INT<26)return;
    if(!target.isShown())return;
    if(frame==null||frame.isRecycled())frame=Bitmap.createBitmap(64,36,Bitmap.Config.ARGB_8888);
    View nativeSurface=player.getVideoSurfaceView();
    boolean direct=!usingYouTube&&nativeSurface instanceof SurfaceView
      &&nativeSurface.isShown()
      &&((SurfaceView)nativeSurface).getHolder().getSurface().isValid();
    View playingView=usingYouTube?youtube:player;
    if(!direct&&(playingView==null||!playingView.isShown()))return;
    busy=true;
    try{
      if(direct){
        PixelCopy.request((SurfaceView)nativeSurface,frame,this::onCopy,main);
      }else{
        int[] location=new int[2];
        playingView.getLocationInWindow(location);
        int width=playingView.getWidth(),height=playingView.getHeight();
        if(width<=0||height<=0){busy=false;return;}
        Rect crop=new Rect(location[0],location[1],location[0]+width,location[1]+height);
        PixelCopy.request(activity.getWindow(),crop,frame,this::onCopy,main);
      }
    }catch(Exception ignored){busy=false;}
  }
  private void onCopy(int result){
    busy=false;
    if(result!=PixelCopy.SUCCESS||!enabled||!running||frame==null)return;
    // Avoid default black/frozen frames dimming the room during source startup.
    int total=0;
    for(int y=4;y<32;y+=7)for(int x=4;x<60;x+=7){
      int c=frame.getPixel(x,y);
      total+=Color.red(c)+Color.green(c)+Color.blue(c);
    }
    if(total<450)return;
    long now=android.os.SystemClock.uptimeMillis();
    if(now-lastImageAt<155)return;
    lastImageAt=now;
    drawable.setImage(frame.copy(Bitmap.Config.ARGB_8888,false));
    target.invalidate();
  }

  private static final class RoomDrawable extends Drawable {
    private final Paint p=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
    private Bitmap bitmap;
    private int left=0xFF332563,mid=0xFF23182F,right=0xFF222D49;
    void setImage(Bitmap value){
      if(value!=null&&!value.isRecycled()){
        left=avg(value,0,20);
        mid=avg(value,20,43);
        right=avg(value,43,64);
      }else{
        left=0xFF332563;mid=0xFF23182F;right=0xFF222D49;
      }
      bitmap=value;
      invalidateSelf();
    }
    private static int avg(Bitmap im,int x0,int x1){
      long rr=0,gg=0,bb=0,n=0;
      for(int y=3;y<im.getHeight()-2;y+=3)
        for(int x=x0;x<x1;x+=2){
          int c=im.getPixel(x,y);
          rr+=Color.red(c);gg+=Color.green(c);bb+=Color.blue(c);n++;
        }
      if(n==0)return 0xFF282038;
      // Strongly retain the film's scene color while keeping chat text legible.
      int r=(int)Math.min(255,rr/n*1.19+8);
      int g=(int)Math.min(255,gg/n*1.19+7);
      int b=(int)Math.min(255,bb/n*1.23+10);
      return Color.rgb(r,g,b);
    }
    private static int glow(int color,int alpha){
      return Color.argb(alpha,Color.red(color),Color.green(color),Color.blue(color));
    }
    @Override public void draw(Canvas canvas){
      Rect bounds=getBounds();
      if(bounds.isEmpty())return;
      float w=bounds.width(),h=bounds.height();
      canvas.drawColor(0xFF101021);
      if(bitmap!=null&&!bitmap.isRecycled()){
        p.setShader(null);p.setColor(Color.WHITE);p.setAlpha(154);
        canvas.drawBitmap(bitmap,null,bounds,p);
      }
      float radius=Math.max(w,h)*.93f;
      p.setAlpha(255);
      p.setShader(new RadialGradient(w*.1f,h*.08f,radius,
        new int[]{glow(left,155),glow(mid,50),Color.TRANSPARENT},
        new float[]{0f,.45f,1f},Shader.TileMode.CLAMP));
      canvas.drawRect(bounds,p);
      p.setShader(new RadialGradient(w*.95f,h*.55f,radius,
        new int[]{glow(right,117),glow(mid,58),Color.TRANSPARENT},
        new float[]{0f,.5f,1f},Shader.TileMode.CLAMP));
      canvas.drawRect(bounds,p);
      p.setShader(new LinearGradient(0,0,0,h,
        new int[]{0x87110C1F,0x94110C1A,0xD70C0A15},
        new float[]{0f,.55f,1f},Shader.TileMode.CLAMP));
      canvas.drawRect(bounds,p);
      p.setShader(null);p.setAlpha(255);
    }
    @Override public void setAlpha(int alpha){}
    @Override public void setColorFilter(ColorFilter filter){}
    @Override public int getOpacity(){return PixelFormat.OPAQUE;}
  }
}
