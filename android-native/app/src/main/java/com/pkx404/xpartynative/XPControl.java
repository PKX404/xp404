package com.pkx404.xpartynative;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.drawable.RippleDrawable;
import android.graphics.drawable.GradientDrawable;
import android.view.View;

/** Native stroke icon control modeled on XParty v31.6 control geometry. */
public final class XPControl extends View {
  private final Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);
  private final String kind;
  private int ink=0xFFF9F9FF;
  private boolean active=false;
  public XPControl(Context ctx,String kind){
    super(ctx);this.kind=kind;setClickable(true);setFocusable(true);
    setContentDescription(kind.replace('_',' '));
    GradientDrawable mask=new GradientDrawable();
    mask.setColor(Color.WHITE);mask.setCornerRadius(dp(13));
    setBackground(new RippleDrawable(ColorStateList.valueOf(0x665B69FF),null,mask));
    setMinimumWidth(dp(42));setMinimumHeight(dp(44));
  }
  public void tint(int color){ink=color;invalidate();}
  public void active(boolean value){active=value;invalidate();}
  private int dp(float size){return Math.round(size*getResources().getDisplayMetrics().density);}
  private void line(Canvas c,float a,float b,float x,float y){c.drawLine(a,b,x,y,p);}
  private void circle(Canvas c,float x,float y,float r){c.drawCircle(x,y,r,p);}
  private void path(Canvas c,float...pts){
    if(pts.length<4)return;Path path=new Path();path.moveTo(pts[0],pts[1]);
    for(int i=2;i<pts.length;i+=2)path.lineTo(pts[i],pts[i+1]);c.drawPath(path,p);
  }
  @Override protected void onDraw(Canvas original){
    super.onDraw(original);
    original.save();
    float unit=Math.min(getWidth(),getHeight())/43f;
    float dx=(getWidth()-36*unit)/2,dy=(getHeight()-36*unit)/2;
    original.translate(dx,dy);original.scale(unit,unit);
    Canvas c=original;
    p.setStyle(Paint.Style.STROKE);p.setStrokeCap(Paint.Cap.ROUND);
    p.setStrokeJoin(Paint.Join.ROUND);p.setStrokeWidth(2.7f);p.setColor(active?0xFFBDA7FF:ink);
    switch(kind){
      case "exit":
        p.setStrokeWidth(3.2f);line(c,8,8,28,28);line(c,28,8,8,28);break;
      case "settings":
        c.drawCircle(18,18,8.8f,p);circle(c,18,18,3.6f);
        for(int i=0;i<8;i++){double angle=Math.PI*i/4;float x=(float)Math.cos(angle),y=(float)Math.sin(angle);
          line(c,18+x*11.5f,18+y*11.5f,18+x*15,18+y*15);}
        break;
      case "key":
        circle(c,12,12,7);path(c,17,17,30,30,32,26,29,24,27,26,24,23,26,21);break;
      case "queue":
        for(int y:new int[]{9,18,27}){line(c,12,y,30,y);circle(c,6,y,1);}break;
      case "search":
        circle(c,15.5f,14.5f,8.3f);line(c,22,22,29.5f,30);break;
      case "home":
        path(c,5,17,18,5,31,17);path(c,9,17,9,31,27,31,27,17);
        path(c,15,31,15,23,21,23,21,31);break;
      case "messages":
        path(c,6,7,30,7,30,26,14,26,8,32,8,26,6,26,6,7);break;
      case "profile":
        circle(c,18,12,6);c.drawArc(new RectF(6,19,30,34),193,154,false,p);break;
      case "info":
        circle(c,18,18,13);line(c,18,16,18,27);circle(c,18,10,1);break;
      case "playsearch":
        circle(c,17,17,12);path(c,14,10.5f,14,23,23,17,14,10.5f);line(c,26,26,31,31);break;
      case "share":
        circle(c,10,18,3);circle(c,27,9,3);circle(c,27,28,3);
        line(c,13,16,24,10);line(c,13,20,24,27);break;
      case "people":
        // Keep all strokes inside the 36x36 canvas; previous arcs were clipped.
        circle(c,13,12,4.9f);circle(c,26,14,4.1f);
        c.drawArc(new RectF(3,19,23,33),182,176,false,p);
        c.drawArc(new RectF(21,21,34,32),198,148,false,p);break;
      case "file":
        path(c,10,4,23,4,29,10,29,32,10,32,10,4);
        path(c,23,4,23,10,29,10);line(c,15,19,24,19);line(c,15,24,24,24);break;
      case "gallery":
        c.drawRoundRect(new RectF(4,7,32,29),3,3,p);
        circle(c,24,14,3);path(c,7,26,14,18,20,24,24,20,30,27);break;
      case "fullscreen":
        if(active){
          // Four corners point inward when the viewer is already fullscreen.
          path(c,6,14,14,14,14,6);line(c,6,6,14,14);
          path(c,30,22,22,22,22,30);line(c,22,22,30,30);
        }else{
          path(c,14,7,7,7,7,14);line(c,7,7,15,15);
          path(c,22,29,29,29,29,22);line(c,22,22,29,29);
        }
        break;
      case "heart":
        Path h=new Path();h.moveTo(18,30);
        h.cubicTo(14,26,5,21,5,14);
        h.cubicTo(5,4,15,4,18,12);
        h.cubicTo(22,4,31,5,31,14);
        h.cubicTo(31,21,23,27,18,30);
        h.close();
        p.setColor(active?0xFFFF304E:ink);
        p.setStyle(active?Paint.Style.FILL:Paint.Style.STROKE);
        c.drawPath(h,p);break;
      case "scale":
        c.drawRoundRect(new RectF(4,7,32,29),3,3,p);
        path(c,15,15,10,18,15,21);path(c,21,15,26,18,21,21);break;
      case "volume":
        path(c,4,14,12,14,19,6,19,28,12,22,6,22,6,14);
        c.drawArc(new RectF(14,10,27,26),-58,116,false,p);
        c.drawArc(new RectF(11,5,33,31),-58,116,false,p);break;
      case "mic":
        c.drawRoundRect(new RectF(14,5,22,23),4,4,p);
        c.drawArc(new RectF(9,15,27,29),0,180,false,p);
        line(c,18,29,18,33);line(c,12,33,24,33);break;
      case "mic_off":
        c.drawRoundRect(new RectF(14,5,22,23),4,4,p);
        c.drawArc(new RectF(9,15,27,29),0,180,false,p);
        line(c,18,29,18,32);line(c,11,32,25,32);line(c,5,5,31,31);break;
      case "smile":
        circle(c,18,18,13);p.setStyle(Paint.Style.FILL);
        circle(c,13,14,1.6f);circle(c,23,14,1.6f);p.setStyle(Paint.Style.STROKE);
        c.drawArc(new RectF(10,13,26,26),20,140,false,p);break;
      case "camera":
        c.drawRoundRect(new RectF(4,10,25,27),2,2,p);path(c,26,15,32,11,32,26,26,22);break;
      case "send":
        path(c,4,7,31,18,4,29,8,19,20,18,8,17,4,7);break;
      case "plus":
        p.setStrokeWidth(3.1f);line(c,18,5,18,31);line(c,5,18,31,18);break;
      case "at":
        circle(c,17,18,7);Path a=new Path();
        a.addArc(new RectF(4,4,32,32),70,310);c.drawPath(a,p);
        c.drawArc(new RectF(17,11,26,25),-90,245,false,p);break;
      case "next":
        path(c,6,9,17,18,6,27,6,9);path(c,17,9,29,18,17,27,17,9);
        line(c,30,10,30,26);break;
      case "pause":
        p.setStrokeWidth(5);line(c,13,10,13,26);line(c,23,10,23,26);break;
      case "play":
        path(c,11,7,11,29,28,18,11,7);break;
      case "back":
        line(c,28,18,8,18);path(c,16,9,7,18,16,27);break;
      case "crown":
        path(c,4,11,11,20,18,9,25,20,32,11,29,27,7,27,4,11);
        line(c,9,31,27,31);break;
      default:circle(c,18,18,9);
    }
    original.restore();
  }
}
