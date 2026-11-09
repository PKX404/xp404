package com.pkx404.xpartynative;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.MotionEvent;
import android.view.View;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Native GPU Canvas port of XParty v31.6 world-home.js, using the same
 * orthographic rotation/projection and offline simplified country geometry.
 * No browser, network fetch or frame-by-frame map parsing.
 */
public final class NativeWorldGlobeView extends View {
  private static final class Country{
    String code;List<float[]> rings=new ArrayList<>();
  }
  private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
  private final List<Country> countries=new ArrayList<>();
  private float longitude=77,latitude=20,downX,downY,originalLon,originalLat;
  private boolean dragged=false;
  private Runnable onTap;
  public NativeWorldGlobeView(Context context){
    super(context);
    setLayerType(View.LAYER_TYPE_HARDWARE,null);
    setContentDescription("Interactive XParty globe. Drag to explore countries.");
    setFocusable(true);setClickable(true);
    load();
  }
  public void setOnGlobeTap(Runnable action){onTap=action;}
  private void load(){
    try(InputStream input=getContext().getAssets().open("xparty_world_coastlines.json");
        ByteArrayOutputStream output=new ByteArrayOutputStream()){
      byte[] buffer=new byte[8192];int n;
      while((n=input.read(buffer))>0)output.write(buffer,0,n);
      JSONArray set=new JSONObject(output.toString("UTF-8")).getJSONArray("c");
      for(int i=0;i<set.length();i++){
        JSONObject obj=set.getJSONObject(i);Country country=new Country();
        country.code=obj.optString("i","");
        JSONArray rings=obj.getJSONArray("r");
        for(int j=0;j<rings.length();j++){
          JSONArray ring=rings.getJSONArray(j);
          if(ring.length()<3)continue;
          float[] coords=new float[ring.length()*2];
          for(int k=0;k<ring.length();k++){
            JSONArray point=ring.getJSONArray(k);
            coords[k*2]=(float)point.getDouble(0);
            coords[k*2+1]=(float)point.getDouble(1);
          }
          country.rings.add(coords);
        }
        countries.add(country);
      }
    }catch(Exception ignored){}
  }
  @Override protected void onDraw(Canvas canvas){
    super.onDraw(canvas);
    float w=getWidth(),h=getHeight();if(w<5||h<5)return;
    canvas.drawColor(0xFF030714);
    for(int i=0;i<85;i++){
      float x=((i*7919)%997)/997f*w;
      float y=((i*3571)%991)/991f*h;
      paint.setShader(null);paint.setColor(0x349FB0D0);
      canvas.drawCircle(x,y,(i%3==0?1.15f:.55f),paint);
    }
    float radius=Math.min(w*.39f,h*.43f),cx=w*.56f,cy=h*.54f;
    paint.setStyle(Paint.Style.FILL);paint.setShader(null);
    for(int d=7;d>0;d--){
      paint.setColor(Color.argb(5,68,155,255));
      canvas.drawCircle(cx,cy,radius+d*3.5f,paint);
    }
    paint.setShader(new RadialGradient(cx-radius*.35f,cy-radius*.45f,radius*1.38f,
      new int[]{0xFF173852,0xFF08192E,0xFF020711},null,Shader.TileMode.CLAMP));
    canvas.drawCircle(cx,cy,radius,paint);paint.setShader(null);
    canvas.save();
    Path circle=new Path();circle.addCircle(cx,cy,radius,Path.Direction.CW);canvas.clipPath(circle);
    final double lon0=Math.toRadians(longitude),lat0=Math.toRadians(latitude);
    final double sinLat=Math.sin(lat0),cosLat=Math.cos(lat0);
    for(Country country:countries){
      for(float[] ring:country.rings){
        Path shape=new Path();boolean drawing=false;
        for(int i=0;i<ring.length;i+=2){
          double lon=Math.toRadians(ring[i]),lat=Math.toRadians(ring[i+1]);
          double angle=lon-lon0;
          double cosL=Math.cos(lat),sinL=Math.sin(lat);
          double z=sinLat*sinL+cosLat*cosL*Math.cos(angle);
          if(z<0){drawing=false;continue;}
          float x=cx+(float)(cosL*Math.sin(angle)*radius);
          float y=cy+(float)((-cosLat*sinL+sinLat*cosL*Math.cos(angle))*radius);
          if(!drawing){shape.moveTo(x,y);drawing=true;}
          else shape.lineTo(x,y);
        }
        if(shape.isEmpty())continue;
        shape.close();
        paint.setColor("in".equals(country.code)?0xFF6BBFFF:0xFF36516A);
        paint.setStyle(Paint.Style.FILL);canvas.drawPath(shape,paint);
        paint.setColor(0x666F91B5);paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(.5f);canvas.drawPath(shape,paint);paint.setStyle(Paint.Style.FILL);
      }
    }
    paint.setShader(new LinearGradient(cx-radius,cy-radius,cx+radius,cy+radius,
      new int[]{0x155A9CFF,0x00000000,0xA9000000},
      new float[]{0,.6f,1},Shader.TileMode.CLAMP));
    canvas.drawRect(cx-radius,cy-radius,cx+radius,cy+radius,paint);
    canvas.restore();
    paint.setShader(null);paint.setStyle(Paint.Style.STROKE);
    paint.setColor(0x6676B5FF);paint.setStrokeWidth(1.15f);
    canvas.drawCircle(cx,cy,radius,paint);paint.setStyle(Paint.Style.FILL);
  }
  @Override public boolean onTouchEvent(MotionEvent event){
    if(event.getPointerCount()>1)return true;
    switch(event.getActionMasked()){
      case MotionEvent.ACTION_DOWN:
        downX=event.getX();downY=event.getY();originalLon=longitude;originalLat=latitude;
        dragged=false;return true;
      case MotionEvent.ACTION_MOVE:
        float dx=event.getX()-downX,dy=event.getY()-downY;
        if(Math.abs(dx)+Math.abs(dy)>8)dragged=true;
        longitude=originalLon-dx*.35f;
        latitude=Math.max(-70,Math.min(70,originalLat+dy*.25f));
        postInvalidateOnAnimation();return true;
      case MotionEvent.ACTION_UP:
        if(!dragged&&onTap!=null)onTap.run();
        performClick();return true;
      case MotionEvent.ACTION_CANCEL:return true;
      default:return true;
    }
  }
  @Override public boolean performClick(){super.performClick();return true;}
}
