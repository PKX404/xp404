package com.pkx404.xpartynative;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.widget.ImageView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native artwork loading; bounded, asynchronous and dismisses stale results. */
final class NativeArtwork {
  private final ExecutorService queue=Executors.newSingleThreadExecutor();
  private final Handler ui=new Handler(Looper.getMainLooper());
  private int generation=0;
  void show(String url,ImageView destination){
    final int request=++generation;
    destination.setImageDrawable(null);
    if(url==null||!url.startsWith("https://")||url.length()>2048)return;
    queue.execute(()->{
      HttpURLConnection con=null;
      Bitmap bitmap=null;
      try{
        con=(HttpURLConnection)new URL(url).openConnection();
        con.setConnectTimeout(5500);con.setReadTimeout(5500);
        con.setInstanceFollowRedirects(false);
        if(con.getResponseCode()!=200)return;
        int length=con.getContentLength();
        if(length>280000)return;
        try(InputStream in=con.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
          byte[] buf=new byte[8192];int n,total=0;
          while((n=in.read(buf))!=-1){
            total+=n;if(total>280000)break;
            out.write(buf,0,n);
          }
          if(total<=280000){
            byte[] data=out.toByteArray();
            BitmapFactory.Options info=new BitmapFactory.Options();
            info.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(data,0,data.length,info);
            if(info.outWidth>0&&info.outHeight>0&&info.outWidth<=3000&&info.outHeight<=3000){
              info.inJustDecodeBounds=false;info.inSampleSize=Math.max(1,Math.min(info.outWidth,info.outHeight)/120);
              bitmap=BitmapFactory.decodeByteArray(data,0,data.length,info);
            }
          }
        }
      }catch(Exception ignored){}finally{if(con!=null)con.disconnect();}
      Bitmap image=bitmap;
      if(image!=null)ui.post(()->{if(request==generation)destination.setImageBitmap(image);});
    });
  }
  void shutdown(){queue.shutdownNow();}
}
