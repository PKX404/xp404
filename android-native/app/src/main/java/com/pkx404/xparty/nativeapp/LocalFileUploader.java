package com.pkx404.xparty.nativeapp;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Upload user-approved local video files in <=2MB chunks; no full-file memory loading. */
public final class LocalFileUploader{
    public interface Feedback{void onProgress(int percent);void onError(String error);void onFinished();}
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final Context context;
    private boolean stopped=false;
    public LocalFileUploader(Context context){this.context=context.getApplicationContext();}
    public void upload(Uri file,String url,String token,long total,Feedback feedback){
        stopped=false;
        worker.execute(()->{
            long offset=0;
            try(InputStream input=context.getContentResolver().openInputStream(file)){
                if(input==null)throw new IllegalStateException("Cannot open selected video");
                byte[] chunk=new byte[1024*1024];
                while(offset<total&&!stopped){
                    int length=0,limit=(int)Math.min(chunk.length,total-offset);
                    while(length<limit){int count=input.read(chunk,length,limit-length);if(count<0)break;length+=count;}
                    if(length==0)throw new IllegalStateException("Video file ended early");
                    HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
                    try{
                        c.setRequestMethod("PUT");c.setConnectTimeout(15000);c.setReadTimeout(25000);
                        c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("X-File-Offset",Long.toString(offset));
                        c.setFixedLengthStreamingMode(length);c.setDoOutput(true);
                        try(OutputStream out=c.getOutputStream()){out.write(chunk,0,length);}
                        if(c.getResponseCode()!=200)throw new IllegalStateException("Server rejected the upload: "+c.getResponseCode());
                    }finally{c.disconnect();}
                    offset+=length;
                    final int percent=(int)(100*offset/Math.max(1,total));ui.post(()->feedback.onProgress(percent));
                }
                if(!stopped)ui.post(feedback::onFinished);
            }catch(Exception error){if(!stopped)ui.post(()->feedback.onError(error.getMessage()));}
        });
    }
    public void cancel(){stopped=true;}
    public void close(){cancel();worker.shutdownNow();}
}
