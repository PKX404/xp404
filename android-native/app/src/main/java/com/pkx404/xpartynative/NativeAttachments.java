package com.pkx404.xpartynative;

import android.app.Activity;
import android.content.ContentValues;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.json.JSONObject;

/** XParty original /api/attachment protocol ported to Android (max 20 MB). */
final class NativeAttachments {
  interface Listener {
    void status(String message);
    void uploaded(String id,String name);
    void downloaded(String path);
    void error(String message);
  }
  interface PreviewListener {
    void ready(String cachePath,String mime);
    void error(String message);
  }
  private static final int MAX=20*1024*1024;
  private final Activity activity;
  private final Handler ui=new Handler(Looper.getMainLooper());
  private final ExecutorService worker=Executors.newSingleThreadExecutor();
  private final OkHttpClient http=new OkHttpClient.Builder()
    .callTimeout(java.time.Duration.ofSeconds(50)).build();
  private final String backend;
  NativeAttachments(Activity activity,String backend){this.activity=activity;this.backend=backend;}
  private void status(Listener listener,String value){ui.post(()->listener.status(value));}
  private void error(Listener listener,String value){ui.post(()->listener.error(value));}
  void upload(Uri uri,String token,Listener listener){
    upload(uri,token,null,listener);
  }
  void upload(Uri uri,String token,String recipient,Listener listener){
    worker.execute(()->{
      try{
        String name=fileName(uri);
        byte[] bytes;
        try(InputStream in=activity.getContentResolver().openInputStream(uri)){
          if(in==null)throw new Exception("Selected file cannot be opened");
          bytes=readBounded(in);
        }
        uploadData(name,bytes,token,recipient,listener);
      }catch(Exception e){error(listener,"Attachment: "+e.getMessage());}
    });
  }
  void uploadCamera(Bitmap bitmap,String token,Listener listener){
    uploadCamera(bitmap,token,null,listener);
  }
  void uploadCamera(Bitmap bitmap,String token,String recipient,Listener listener){
    if(bitmap==null){error(listener,"Camera did not return a picture");return;}
    worker.execute(()->{
      try{
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG,86,out);
        uploadData("XParty-camera-"+System.currentTimeMillis()+".jpg",out.toByteArray(),token,recipient,listener);
      }catch(Exception e){error(listener,"Camera: "+e.getMessage());}
    });
  }
  private void uploadData(String name,byte[] bytes,String token,String recipient,Listener listener)throws Exception{
    if(bytes.length<1||bytes.length>MAX)throw new Exception("Select an attachment under 20 MB");
    if(token==null||token.isEmpty())throw new Exception("Room connection is offline");
    status(listener,"Uploading "+name+"…");
    String encoded=URLEncoder.encode(name,"UTF-8").replace("+","%20");
    Request.Builder request=new Request.Builder().url(backend+"/api/attachment")
      .header("Authorization","Bearer "+token)
      .header("X-Attachment-Name",encoded);
    if(recipient!=null&&!recipient.isEmpty())request.header("X-Attachment-To",recipient);
    Request req=request
      .post(RequestBody.create(MediaType.parse("application/octet-stream"),bytes)).build();
    try(Response response=http.newCall(req).execute()){
      String body=response.body()==null?"{}":response.body().string();
      JSONObject result=new JSONObject(body);
      if(!response.isSuccessful())
        throw new Exception(result.optString("error","Upload rejected ("+response.code()+")"));
      JSONObject attachment=result.optJSONObject("attachment");
      if(attachment==null||attachment.optString("id").isEmpty())throw new Exception("Upload receipt missing");
      ui.post(()->listener.uploaded(attachment.optString("id"),attachment.optString("name",name)));
    }
  }
  void preview(String attachmentId,String filename,String token,PreviewListener listener){
    if(!attachmentId.matches("[a-fA-F0-9-]{36}")){
      ui.post(()->listener.error("Invalid attachment"));return;
    }
    worker.execute(()->{
      try{
        Request request=new Request.Builder().url(backend+"/api/attachment/"+attachmentId)
          .header("Authorization","Bearer "+token).build();
        byte[] bytes;String mime;
        try(Response response=http.newCall(request).execute()){
          if(!response.isSuccessful())throw new Exception("Media is unavailable or expired");
          if(response.body()==null)throw new Exception("Empty media response");
          mime=response.header("Content-Type","application/octet-stream").split(";")[0];
          try(InputStream input=response.body().byteStream()){bytes=readBounded(input);}
        }
        if(!mime.startsWith("image/")&&!mime.startsWith("video/")){
          String lower=filename.toLowerCase(java.util.Locale.ROOT);
          if(lower.matches(".*\\.(jpe?g|png|gif|webp)$"))mime="image/jpeg";
          else if(lower.matches(".*\\.(mp4|webm|m4v|mov)$"))mime="video/mp4";
          else throw new Exception("Preview unsupported; download to view");
        }
        File temp=File.createTempFile("xparty-media-",".tmp",activity.getCacheDir());
        try(OutputStream out=new FileOutputStream(temp)){out.write(bytes);}
        String readyPath=temp.getAbsolutePath(),readyMime=mime;
        ui.post(()->listener.ready(readyPath,readyMime));
      }catch(Exception error){
        ui.post(()->listener.error(error.getMessage()));
      }
    });
  }
  void download(String attachmentId,String filename,String token,Listener listener){
    if(!attachmentId.matches("[a-fA-F0-9-]{36}")){error(listener,"Invalid attachment");return;}
    worker.execute(()->{
      try{
        status(listener,"Downloading "+filename+"…");
        Request request=new Request.Builder().url(backend+"/api/attachment/"+attachmentId)
          .header("Authorization","Bearer "+token).build();
        byte[] bytes;
        try(Response response=http.newCall(request).execute()){
          if(!response.isSuccessful())throw new Exception("Attachment expired or unavailable");
          if(response.body()==null)throw new Exception("No file was received");
          try(InputStream stream=response.body().byteStream()){bytes=readBounded(stream);}
        }
        String name=filename.replaceAll("[\\\\/\\r\\n]","_");
        if(name.isEmpty())name="xparty-attachment";
        String destination;
        if(Build.VERSION.SDK_INT>=29){
          ContentValues values=new ContentValues();
          values.put(MediaStore.Downloads.DISPLAY_NAME,name);
          values.put(MediaStore.Downloads.MIME_TYPE,"application/octet-stream");
          values.put(MediaStore.Downloads.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/XParty");
          values.put(MediaStore.Downloads.IS_PENDING,1);
          Uri uri=activity.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
          if(uri==null)throw new Exception("Cannot create download");
          try(OutputStream out=activity.getContentResolver().openOutputStream(uri)){
            if(out==null)throw new Exception("Cannot write download");out.write(bytes);
          }
          ContentValues ready=new ContentValues();
          ready.put(MediaStore.Downloads.IS_PENDING,0);
          activity.getContentResolver().update(uri,ready,null,null);
          destination="Downloads / XParty / "+name;
        }else{
          File folder=activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
          if(folder==null)throw new Exception("Downloads folder unavailable");
          File file=new File(folder,name);
          try(OutputStream out=new FileOutputStream(file)){out.write(bytes);}
          destination=file.getAbsolutePath();
        }
        String finalDestination=destination;
        ui.post(()->listener.downloaded(finalDestination));
      }catch(Exception e){error(listener,"Download: "+e.getMessage());}
    });
  }
  private String fileName(Uri uri){
    String name="attachment";
    try(Cursor c=activity.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){
      if(c!=null&&c.moveToFirst())name=c.getString(0);
    }catch(Exception ignored){}
    if(name==null||name.isEmpty())name="attachment";
    name=name.replaceAll("[\\\\/\\r\\n]","_").trim();
    return name.substring(0,Math.min(100,name.length()));
  }
  private byte[] readBounded(InputStream stream)throws Exception{
    ByteArrayOutputStream out=new ByteArrayOutputStream();
    byte[] buffer=new byte[16384];int size=0,count;
    while((count=stream.read(buffer))>=0){
      size+=count;if(size>MAX)throw new Exception("File exceeds 20 MB");
      out.write(buffer,0,count);
    }
    return out.toByteArray();
  }
  void shutdown(){worker.shutdownNow();}
}
