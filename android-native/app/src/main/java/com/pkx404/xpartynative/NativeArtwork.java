package com.pkx404.xpartynative;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.view.View;
import android.widget.ImageView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.WeakHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Real channel/video thumbnail loader: independent requests, cache, bounded I/O. */
final class NativeArtwork {
  private final ExecutorService queue=Executors.newFixedThreadPool(4);
  private final Handler main=new Handler(Looper.getMainLooper());
  private final WeakHashMap<ImageView,Integer> generations=new WeakHashMap<>();
  private final LruCache<String,Bitmap> cache=new LruCache<>(64);
  private int requestId=0;
  void show(String url,ImageView target){
    final int request=++requestId;
    synchronized(generations){generations.put(target,request);}
    target.setImageDrawable(null);target.setVisibility(View.INVISIBLE);
    if(url==null||!url.startsWith("https://")||url.length()>2048)return;
    Bitmap present=cache.get(url);
    if(present!=null){target.setImageBitmap(present);target.setVisibility(View.VISIBLE);return;}
    queue.execute(()->{
      Bitmap bitmap=fetch(url);
      if(bitmap==null)return;
      cache.put(url,bitmap);
      main.post(()->{
        synchronized(generations){
          if(!Integer.valueOf(request).equals(generations.get(target)))return;
        }
        target.setImageBitmap(bitmap);target.setVisibility(View.VISIBLE);
      });
    });
  }
  private Bitmap fetch(String uri){
    HttpURLConnection connection=null;
    try{
      connection=(HttpURLConnection)new URL(uri).openConnection();
      connection.setConnectTimeout(6000);connection.setReadTimeout(6000);
      connection.setInstanceFollowRedirects(false);
      if(connection.getResponseCode()!=200)return null;
      int size=connection.getContentLength();
      if(size>400000)return null;
      try(InputStream input=connection.getInputStream();
          ByteArrayOutputStream output=new ByteArrayOutputStream()){
        byte[] buffer=new byte[8192];int count,total=0;
        while((count=input.read(buffer))>0){
          total+=count;if(total>400000)return null;
          output.write(buffer,0,count);
        }
        byte[] bytes=output.toByteArray();
        BitmapFactory.Options opts=new BitmapFactory.Options();
        opts.inJustDecodeBounds=true;
        BitmapFactory.decodeByteArray(bytes,0,bytes.length,opts);
        if(opts.outWidth<=0||opts.outHeight<=0||opts.outWidth>4000||opts.outHeight>4000)return null;
        opts.inJustDecodeBounds=false;
        opts.inSampleSize=Math.max(1,Math.max(opts.outWidth,opts.outHeight)/260);
        return BitmapFactory.decodeByteArray(bytes,0,bytes.length,opts);
      }
    }catch(Exception ignored){return null;}
    finally{if(connection!=null)connection.disconnect();}
  }
  void shutdown(){queue.shutdownNow();cache.evictAll();}
}
