package com.pkx404.xpartyremote;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.MotionEvent;
import android.view.View;

/**
 * Native electric-blue Bluetooth touchpad. A one-finger swipe sends relative mouse
 * movement; a two-finger swipe emits HID wheel ticks, never accidental clicks.
 */
public final class RemoteTouchpadView extends View {
  public interface InputListener {
    void move(int x, int y);
    void scroll(int ticks);
    void click();
  }

  private static final int BLUE=0xFF0F6BFF;
  private static final int CYAN=0xFF49D5FF;
  private static final int LIGHT=0xFFF0F9FF;
  private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
  private final RectF rectangle=new RectF();
  private InputListener listener;
  private float scale=1.7f, wheelStep;
  private float startX,startY,lastX,lastY,lastTwoY,partialWheel;
  private float pointerX=-1,pointerY=-1;
  private boolean moved,twoFinger,touching;
  private float corner;
  private int dp(float value){return Math.round(value*getResources().getDisplayMetrics().density);}

  public RemoteTouchpadView(Context context){
    super(context);
    wheelStep=dp(17);
    corner=dp(25);
    setContentDescription("Blue touchpad. Move one finger to move cursor, tap to click, swipe two fingers to scroll.");
    setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
    setFocusable(true);
    setClickable(true);
  }
  public void setInputListener(InputListener listener){this.listener=listener;}
  public void configure(int pointerProgress,int scrollProgress){
    scale=0.8f+Math.max(0,Math.min(100,pointerProgress))/50f;
    wheelStep=dp(26-Math.round(Math.max(0,Math.min(100,scrollProgress))*.18f));
    wheelStep=Math.max(dp(7),wheelStep);
  }
  private static int clamp(int value){return Math.max(-127,Math.min(127,value));}

  @Override protected void onDraw(Canvas canvas){
    super.onDraw(canvas);
    final float w=getWidth(),h=getHeight();
    if(w<4||h<4)return;
    final float inset=dp(1.5f);
    rectangle.set(inset,inset,w-inset,h-inset);

    paint.setStyle(Paint.Style.FILL);
    paint.setShader(new LinearGradient(0,0,w,h,
      new int[]{0xFF092452,0xFF074BB3,0xFF0F6BFF,0xFF061D49},
      new float[]{0,.37f,.67f,1f},Shader.TileMode.CLAMP));
    canvas.drawRoundRect(rectangle,corner,corner,paint);paint.setShader(null);

    // A subtle lit boundary, never a distracting animation or overlay.
    paint.setStyle(Paint.Style.STROKE);
    paint.setStrokeWidth(dp(1.4f));paint.setColor(0xB64BD5FF);
    canvas.drawRoundRect(rectangle,corner,corner,paint);
    paint.setStrokeWidth(dp(1));paint.setColor(0x405DC3FE);
    rectangle.inset(dp(7),dp(7));canvas.drawRoundRect(rectangle,corner-dp(6),corner-dp(6),paint);
    paint.setStyle(Paint.Style.FILL);

    // Fine horizontal highlights keep the touch surface tactile and premium.
    paint.setColor(0x143CE6FF);paint.setStrokeWidth(dp(1));
    for(int i=1;i<5;i++){
      float y=h*i/5f;
      canvas.drawLine(dp(23),y,w-dp(23),y,paint);
    }

    float center=w/2f;
    paint.setTypeface(android.graphics.Typeface.create("sans-serif-medium",android.graphics.Typeface.BOLD));
    paint.setTextAlign(Paint.Align.CENTER);
    paint.setColor(LIGHT);paint.setTextSize(dp(16));
    canvas.drawText("BLUE TOUCHPAD",center,h*.38f,paint);
    paint.setTypeface(android.graphics.Typeface.create("sans-serif",android.graphics.Typeface.NORMAL));
    paint.setColor(0xFFDCF3FF);paint.setTextSize(dp(12));
    canvas.drawText("MOVE  ·  TAP  ·  SCROLL",center,h*.50f,paint);
    paint.setColor(0xFFB7DDFC);paint.setTextSize(dp(10));
    canvas.drawText("TWO-FINGER SWIPE TO SCROLL",center,h*.63f,paint);

    // Stable pointer ring provides tactile visual feedback without moving UI.
    if(touching&&pointerX>=0){
      paint.setColor(0x3349D5FF);
      canvas.drawCircle(pointerX,pointerY,dp(27),paint);
      paint.setColor(0xAAFFFFFF);
      paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(1.5f));
      canvas.drawCircle(pointerX,pointerY,dp(11),paint);
      paint.setStyle(Paint.Style.FILL);
      paint.setColor(CYAN);canvas.drawCircle(pointerX,pointerY,dp(3),paint);
    }
    // Native highlight dots in lower corners.
    paint.setColor(0xAAE6F6FF);
    canvas.drawCircle(dp(24),h-dp(22),dp(2.2f),paint);
    canvas.drawCircle(w-dp(24),h-dp(22),dp(2.2f),paint);
  }

  @Override public boolean onTouchEvent(MotionEvent event){
    int count=event.getPointerCount();
    switch(event.getActionMasked()){
      case MotionEvent.ACTION_DOWN:
        if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(true);
        startX=lastX=pointerX=event.getX();
        startY=lastY=pointerY=event.getY();
        touching=true;moved=false;twoFinger=false;partialWheel=0;
        invalidate();
        return true;
      case MotionEvent.ACTION_POINTER_DOWN:
        if(count>=2){
          twoFinger=true;moved=true;
          lastTwoY=(event.getY(0)+event.getY(1))*.5f;
          pointerX=(event.getX(0)+event.getX(1))*.5f;
          pointerY=lastTwoY;
          invalidate();
        }
        return true;
      case MotionEvent.ACTION_MOVE:
        if(count>=2){
          float twoY=(event.getY(0)+event.getY(1))*.5f;
          partialWheel+=twoY-lastTwoY;lastTwoY=twoY;
          int ticks=(int)(partialWheel/wheelStep);
          if(ticks!=0){
            ticks=Math.max(-7,Math.min(7,ticks));
            if(listener!=null)listener.scroll(clamp(-ticks));
            partialWheel+=ticks*wheelStep*-1f;
          }
          pointerX=(event.getX(0)+event.getX(1))*.5f;
          pointerY=twoY;
          twoFinger=true;moved=true;invalidate();
        }else if(!twoFinger){
          float x=event.getX(),y=event.getY();
          if(Math.abs(x-startX)+Math.abs(y-startY)>dp(8))moved=true;
          int dx=clamp(Math.round((x-lastX)*scale));
          int dy=clamp(Math.round((y-lastY)*scale));
          if((dx!=0||dy!=0)&&listener!=null)listener.move(dx,dy);
          lastX=x;lastY=y;pointerX=x;pointerY=y;
          invalidate();
        }
        return true;
      case MotionEvent.ACTION_POINTER_UP:
        twoFinger=true;moved=true;return true;
      case MotionEvent.ACTION_UP:
        touching=false;invalidate();
        if(!moved&&!twoFinger){performClick();if(listener!=null)listener.click();}
        return true;
      case MotionEvent.ACTION_CANCEL:
        touching=false;invalidate();return true;
      default:return true;
    }
  }
  @Override public boolean performClick(){super.performClick();return true;}
}
