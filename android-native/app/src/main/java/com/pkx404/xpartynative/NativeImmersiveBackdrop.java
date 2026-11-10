package com.pkx404.xpartynative;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.RadialGradient;
import android.graphics.drawable.GradientDrawable;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.PixelCopy;
import android.view.SurfaceView;
import android.view.View;
import android.webkit.WebView;
import androidx.media3.ui.PlayerView;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native port of XParty v31.6 immersive.js:
 * 1) acquire a presented frame in a tiny off-screen bitmap;
 * 2) two-pass separable Gaussian (same sigma/radius ratio as the WebGL source);
 * 3) original v31.6 saturation/luminance grading and dark glass scrim.
 * This deliberately avoids copying recognizable video detail to the chat panel.
 */
final class NativeImmersiveBackdrop {
  // Small source texture + broad blur stops recognizable video copies in the chat panel.
  private static final int W=80,H=45,R=8;
  private static volatile int ambientTop=0xFF283E67,ambientMid=0xFF1E2A50,ambientEnd=0xFF2E1B4F;
  static GradientDrawable sheetSkin(){
    GradientDrawable d=new GradientDrawable(GradientDrawable.Orientation.TL_BR,
      new int[]{ambientTop,ambientMid,ambientEnd});
    d.setCornerRadius(28f);d.setStroke(1,0xFF64547E);return d;
  }
  private final Activity activity;
  private final View target;
  private final PlayerView player;
  private final WebView youtube;
  private final RoomDrawable drawable=new RoomDrawable();
  private final Handler ui=new Handler(Looper.getMainLooper());
  private final ExecutorService worker=Executors.newSingleThreadExecutor();
  private final Bitmap input=Bitmap.createBitmap(W,H,Bitmap.Config.ARGB_8888);
  private final float[] weights=new float[R+1];
  private volatile boolean enabled=true,running=false,hasSource=false,usingYoutube=false,busy=false;
  private long lastCopy=0;
  private final Runnable loop=new Runnable(){
    @Override public void run(){
      if(!running)return;
      if(enabled&&hasSource)sample();
      ui.postDelayed(this,260);
    }
  };
  NativeImmersiveBackdrop(Activity activity,View target,PlayerView player,WebView youtube){
    this.activity=activity;this.target=target;this.player=player;this.youtube=youtube;
    float total=0;
    for(int i=0;i<=R;i++){
      float v=(float)Math.exp(-.5f*i*i/36f);weights[i]=v;
      total+=i==0?v:2*v;
    }
    for(int i=0;i<=R;i++)weights[i]/=total;
    target.setBackground(drawable);
  }
  void start(){
    if(running)return;
    running=true;
    ui.postDelayed(loop,280);
  }
  void stop(){
    running=false;busy=false;
    ui.removeCallbacks(loop);
    worker.shutdownNow();
    drawable.frame=null;target.invalidate();
  }
  void setEnabled(boolean yes){
    enabled=yes;
    if(!yes){drawable.frame=null;target.invalidate();}
    else refresh();
  }
  void setSource(String type,boolean selected){
    hasSource=selected;usingYoutube="youtube".equals(type);
    drawable.frame=null;target.invalidate();refresh();
  }
  void refresh(){if(running&&enabled&&hasSource)ui.post(this::sample);}
  private void sample(){
    if(!running||!enabled||!hasSource||busy||Build.VERSION.SDK_INT<26)return;
    if(!target.isShown())return;
    if(SystemClock.uptimeMillis()-lastCopy<250)return;
    View surface=player.getVideoSurfaceView();
    boolean nativeSurface=!usingYoutube&&surface instanceof SurfaceView
      &&surface.isShown()&&((SurfaceView)surface).getHolder().getSurface().isValid();
    View video=usingYoutube?youtube:player;
    if(!nativeSurface&&(video==null||!video.isShown()))return;
    busy=true;lastCopy=SystemClock.uptimeMillis();
    try{
      if(nativeSurface){
        PixelCopy.request((SurfaceView)surface,input,this::onFrame,ui);
      }else{
        int[] xy=new int[2];video.getLocationInWindow(xy);
        int w=video.getWidth(),h=video.getHeight();
        if(w<1||h<1){busy=false;return;}
        PixelCopy.request(activity.getWindow(),new Rect(xy[0],xy[1],xy[0]+w,xy[1]+h),
          input,this::onFrame,ui);
      }
    }catch(Exception ignored){busy=false;}
  }
  private void onFrame(int result){
    if(result!=PixelCopy.SUCCESS||!running||!enabled){busy=false;return;}
    int[] pixels=new int[W*H];input.getPixels(pixels,0,W,0,0,W,H);
    try{worker.execute(()->{
      try{
        Bitmap blur=gradeAndBlur(pixels);
        ui.post(()->{
          if(running&&enabled&&hasSource){
            drawable.frame=blur;
            ambientTop=extractColor(blur,0,blur.getWidth()/3);
            ambientMid=extractColor(blur,blur.getWidth()/3,blur.getWidth()*2/3);
            ambientEnd=extractColor(blur,blur.getWidth()*2/3,blur.getWidth());
            target.invalidate();
          }
          busy=false;
        });
      }catch(Throwable error){busy=false;}
    });}catch(java.util.concurrent.RejectedExecutionException stopped){busy=false;}
  }
  private Bitmap gradeAndBlur(int[] pixels){
    final int N=W*H;
    final int[] intermediate=new int[N],out=new int[N];
    // WebGL v31.6 uses a two-pass Gaussian blur. At half render resolution,
    // a 6px kernel with sigma 4 matches the original 12px kernel / sigma 8.
    for(int y=0;y<H;y++){
      int row=y*W;
      for(int x=0;x<W;x++){
        float red=0,green=0,blue=0;
        for(int k=-R;k<=R;k++){
          int c=pixels[row+Math.max(0,Math.min(W-1,x+k))],weight=Math.abs(k);
          red+=Color.red(c)*weights[weight];
          green+=Color.green(c)*weights[weight];
          blue+=Color.blue(c)*weights[weight];
        }
        intermediate[row+x]=Color.rgb(clamp(red),clamp(green),clamp(blue));
      }
    }
    for(int y=0;y<H;y++)for(int x=0;x<W;x++){
      float red=0,green=0,blue=0;
      for(int k=-R;k<=R;k++){
        int c=intermediate[Math.max(0,Math.min(H-1,y+k))*W+x],weight=Math.abs(k);
        red+=Color.red(c)*weights[weight];
        green+=Color.green(c)*weights[weight];
        blue+=Color.blue(c)*weights[weight];
      }
      float lum=(.213f*red+.715f*green+.072f*blue);
      red=lum+(red-lum)*1.5f;
      green=lum+(green-lum)*1.5f;
      blue=lum+(blue-lum)*1.5f;
      float light=Math.max(.0001f,.213f*red+.715f*green+.072f*blue)/255f;
      float gain=Math.min(1f,.75f/light);
      out[y*W+x]=Color.rgb(clamp(red*gain),clamp(green*gain),clamp(blue*gain));
    }
    Bitmap b=Bitmap.createBitmap(W,H,Bitmap.Config.RGB_565);
    b.setPixels(out,0,W,0,0,W,H);
    return b;
  }
  private static int extractColor(Bitmap bitmap,int x0,int x1){
    long rr=0,gg=0,bb=0,total=0;
    for(int y=3;y<bitmap.getHeight();y+=3){
      for(int x=x0;x<x1;x+=3){
        int c=bitmap.getPixel(x,y);
        rr+=Color.red(c);gg+=Color.green(c);bb+=Color.blue(c);total++;
      }
    }
    if(total==0)return 0xFF242548;
    // 31.6 scene colours survive, but the glass skin remains dark enough for text.
    return Color.rgb((int)(rr/total*.62+15),(int)(gg/total*.62+12),(int)(bb/total*.7+28));
  }
  private static int clamp(float v){return Math.max(0,Math.min(255,Math.round(v)));}
  private static final class RoomDrawable extends Drawable {
    private final Paint paint=new Paint(Paint.FILTER_BITMAP_FLAG|Paint.ANTI_ALIAS_FLAG);
    volatile Bitmap frame;
    @Override public void draw(Canvas canvas){
      Rect b=getBounds();if(b.isEmpty())return;
      canvas.drawColor(0xFF101027);
      Bitmap image=frame;
      if(image!=null&&!image.isRecycled()){
        // CSS .immersive-frame: inset:-6%; width:112%; object-fit:cover.
        float overX=b.width()*.06f,overY=b.height()*.06f;
        float targetRatio=(b.width()+2*overX)/(b.height()+2*overY);
        float sourceRatio=(float)image.getWidth()/image.getHeight();
        int x0=0,y0=0,x1=image.getWidth(),y1=image.getHeight();
        if(sourceRatio>targetRatio){
          int width=Math.round(image.getHeight()*targetRatio);
          x0=(image.getWidth()-width)/2;x1=x0+width;
        }else{
          int height=Math.round(image.getWidth()/targetRatio);
          y0=(image.getHeight()-height)/2;y1=y0+height;
        }
        paint.setAlpha(105);paint.setShader(null);
        canvas.drawBitmap(image,new Rect(x0,y0,x1,y1),
          new RectF(b.left-overX,b.top-overY,b.right+overX,b.bottom+overY),paint);
      }
      // Diffuse scene-colour wash, not a stretched ghost image of the video.
      paint.setAlpha(255);
      paint.setShader(new RadialGradient(b.width()*.18f,b.height()*.15f,
        Math.max(b.width(),b.height())*.88f,
        new int[]{0xAA233766,0x502A244B,0x00212B4F},
        new float[]{0f,.50f,1f},Shader.TileMode.CLAMP));
      canvas.drawRect(b,paint);paint.setShader(null);
      // Conceptual overlay from v31.6 ambient.css:
      // #05081275 -> #06091238 (35%) -> #070a128f
      paint.setAlpha(255);
      paint.setShader(new LinearGradient(0,b.top,0,b.bottom,
        new int[]{0x75050812,0x38060912,0x8F070A12},
        new float[]{0,.35f,1},Shader.TileMode.CLAMP));
      canvas.drawRect(b,paint);paint.setShader(null);
      // Original XParty chat surface is a semi-transparent #0b1026a6.
      paint.setColor(0x620B1026);
      canvas.drawRect(b,paint);paint.setColor(Color.WHITE);
    }
    @Override public void setAlpha(int alpha){}
    @Override public void setColorFilter(ColorFilter filter){}
    @Override public int getOpacity(){return PixelFormat.OPAQUE;}
  }
}
