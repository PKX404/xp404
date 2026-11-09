package com.pkx404.xpartynative;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.PixelCopy;
import android.view.SurfaceView;
import android.view.View;
import androidx.media3.ui.PlayerView;

/**
 * Native counterpart to the WebGL immersive room color effect.
 *
 * Every ~2.8 s, PixelCopy samples a 64x36 decoded Media3 frame; the tiny
 * bitmap is stretched smoothly behind the native chat panel with a dark
 * readability scrim. No window resizing, overlays over the player or WebView
 * dependency. Copyrighted video frames are never written to disk.
 */
final class NativeImmersiveBackdrop {
  private final Handler ui=new Handler(Looper.getMainLooper());
  private final View target;
  private final PlayerView playerView;
  private final RoomDrawable background=new RoomDrawable();
  private boolean enabled=true,running=false,busy=false;
  private Bitmap sample;
  private final Runnable ticker=new Runnable(){
    @Override public void run(){
      if(!running||!enabled)return;
      sampleFrame();
      ui.postDelayed(this,2800);
    }
  };
  NativeImmersiveBackdrop(View target,PlayerView player){
    this.target=target;this.playerView=player;
    target.setBackground(background);
  }
  void setEnabled(boolean enabled){
    this.enabled=enabled;
    if(!enabled){background.setImage(null);target.invalidate();}
    else if(running)sampleFrame();
  }
  void start(){
    if(running)return;
    running=true;ui.postDelayed(ticker,600);
  }
  void stop(){
    running=false;
    ui.removeCallbacks(ticker);
    busy=false;sample=null;
  }
  private void sampleFrame(){
    if(!enabled||!running||busy||Build.VERSION.SDK_INT<26||!target.isShown())return;
    View surface=playerView.getVideoSurfaceView();
    if(!(surface instanceof SurfaceView))return;
    SurfaceView visible=(SurfaceView)surface;
    if(!visible.getHolder().getSurface().isValid())return;
    if(sample==null||sample.isRecycled())sample=Bitmap.createBitmap(64,36,Bitmap.Config.ARGB_8888);
    busy=true;
    try{
      PixelCopy.request(visible,sample,result->{
        busy=false;
        if(running&&enabled&&result==PixelCopy.SUCCESS){
          // The copied data are only used as short-lived in-memory ambient color.
          background.setImage(sample.copy(Bitmap.Config.ARGB_8888,false));
          target.invalidate();
        }
      },ui);
    }catch(Exception ignored){busy=false;}
  }
  private static final class RoomDrawable extends Drawable {
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
    private Bitmap image;
    void setImage(Bitmap frame){image=frame;invalidateSelf();}
    @Override public void draw(Canvas canvas){
      Rect rect=getBounds();
      paint.setColor(Color.WHITE);paint.setAlpha(255);paint.setShader(null);
      canvas.drawColor(0xFF1B1232);
      if(image!=null&&!image.isRecycled()){
        paint.setAlpha(120);paint.setFilterBitmap(true);
        canvas.drawBitmap(image,null,rect,paint);
      }
      // Text/UI stays legible regardless of the brightness of video content.
      paint.setShader(new LinearGradient(0,rect.top,0,rect.bottom,
        new int[]{0xAE1E0F3E,0xBD120D23,0xF70E0B1B},null,Shader.TileMode.CLAMP));
      paint.setAlpha(255);
      canvas.drawRect(rect,paint);paint.setShader(null);
    }
    @Override public void setAlpha(int alpha){}
    @Override public void setColorFilter(ColorFilter filter){}
    @Override public int getOpacity(){return PixelFormat.OPAQUE;}
  }
}
