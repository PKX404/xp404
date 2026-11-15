package com.pkx404.xpartynative;

import android.os.Handler;
import android.os.Looper;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;
import okhttp3.*;
import org.json.JSONObject;

/** Public provider metadata only; never resolves protected media URLs. */
final class TrackMetadata {
  private final Handler ui=new Handler(Looper.getMainLooper());
  private final ExecutorService workers=Executors.newFixedThreadPool(4);
  private final OkHttpClient http=new OkHttpClient.Builder().callTimeout(6,TimeUnit.SECONDS).build();
  private final Map<String,JSONObject> cache=new LinkedHashMap<>();
  private final Map<String,List<Consumer<JSONObject>>> pending=new HashMap<>();
  private boolean closed;
  void resolve(JSONObject item,Consumer<JSONObject> callback){
    if(closed||item==null)return;
    String type=item.optString("type",item.optString("provider","youtube")),id=item.optString("videoId");
    String url;
    if("youtube".equals(type)&&id.matches("[A-Za-z0-9_-]{11}"))url="https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v="+id;
    else if("soundcloud".equals(type)&&id.matches("https://soundcloud\\.com/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+"))url="https://soundcloud.com/oembed?format=json&url="+android.net.Uri.encode(id);
    else return;
    String key=type+":"+id;
    if(cache.containsKey(key)){JSONObject data=cache.get(key);if(data!=null)callback.accept(data);return;}
    if(pending.containsKey(key)){pending.get(key).add(callback);return;}
    List<Consumer<JSONObject>> callbacks=new ArrayList<>();callbacks.add(callback);pending.put(key,callbacks);
    workers.execute(()->{
      JSONObject result=null;
      try(Response response=http.newCall(new Request.Builder().url(url).build()).execute()){
        if(response.isSuccessful()&&response.body()!=null){
          JSONObject data=new JSONObject(response.body().string());
          String title=data.optString("title"),artist=data.optString("author_name"),art=data.optString("thumbnail_url");
          if(!title.trim().isEmpty())result=new JSONObject().put("title",title).put("artist",artist).put("artwork",art.startsWith("https://")?art:"");
        }
      }catch(Exception ignored){}
      JSONObject resolved=result;
      ui.post(()->{
        if(closed)return;
        if(cache.size()>256)cache.clear();cache.put(key,resolved);
        List<Consumer<JSONObject>> waiting=pending.remove(key);
        if(resolved!=null&&waiting!=null)for(Consumer<JSONObject> cb:waiting)cb.accept(resolved);
      });
    });
  }
  void close(){closed=true;pending.clear();workers.shutdownNow();http.dispatcher().cancelAll();}
}
