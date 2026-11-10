package com.pkx404.xpartynative;

import android.os.Handler;
import android.os.Looper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Simple native IPTV-org category browser using publicly listed HLS channels. */
final class ChannelCatalog {
  static final class Channel {
    final String title,url,logo;
    Channel(String title,String url,String logo){
      this.title=title;this.url=url;this.logo=logo;
    }
  }
  interface Result {void loaded(List<Channel> channels,String error);}
  private final Handler ui=new Handler(Looper.getMainLooper());
  // Browse repeated categories instantly without re-fetching hundreds of stream entries.
  private static final long CACHE_TTL_MS=5*60*1000L;
  private static final class CacheEntry {
    final List<Channel> channels;final long savedAt;
    CacheEntry(List<Channel> items){channels=new ArrayList<>(items);savedAt=System.currentTimeMillis();}
  }
  private final Map<String,CacheEntry> cache=new ConcurrentHashMap<>();
  private final ExecutorService worker=Executors.newFixedThreadPool(3);
  void load(String category,Result callback){
    CacheEntry hit=cache.get(category);
    if(hit!=null&&System.currentTimeMillis()-hit.savedAt<CACHE_TTL_MS){
      ui.post(()->callback.loaded(new ArrayList<>(hit.channels),null));
      return;
    }
    worker.execute(()->{
      List<Channel> channels=new ArrayList<>();
      String error=null;
      String group=category.matches("[a-z]{2}")?"countries":"categories";
      String endpoint="https://iptv-org.github.io/iptv/"+group+"/"+category+".m3u";
      HttpURLConnection con=null;
      try{
        con=(HttpURLConnection)new URL(endpoint).openConnection();
        con.setConnectTimeout(6000);con.setReadTimeout(8500);
        con.setRequestProperty("User-Agent","XPartyNative/0.1");
        if(con.getResponseCode()!=200)throw new Exception("Channel list HTTP "+con.getResponseCode());
        try(BufferedReader br=new BufferedReader(new InputStreamReader(con.getInputStream()))){
          String name=null,logo=null,line;int size=0;
          while((line=br.readLine())!=null&&++size<22000&&channels.size()<750){
            if(line.length()>2500)continue;
            if(line.startsWith("#EXTINF")){
              int idx=line.lastIndexOf(',');
              name=idx>=0?line.substring(idx+1).trim():"Live channel";
              if(name.length()>65)name=name.substring(0,65);
              java.util.regex.Matcher match=java.util.regex.Pattern.compile("tvg-logo=\\\"([^\\\"]+)\\\"").matcher(line);
              logo=match.find()?match.group(1):"";
              if(!logo.startsWith("https://"))logo="";
            }else if(name!=null&&line.startsWith("https://")&&line.toLowerCase(Locale.ROOT).matches("https://[^ ]+\\.m3u8(?:\\?.*)?")){
              channels.add(new Channel(name,line.trim(),logo));
              name=null;logo=null;
            }else if(!line.startsWith("#"))name=null;
          }
        }
      }catch(Exception ex){error="Unable to load live channels: "+ex.getMessage();}
      finally{if(con!=null)con.disconnect();}
      if(!channels.isEmpty())cache.put(category,new CacheEntry(channels));
      else if(hit!=null&&!hit.channels.isEmpty())channels=new ArrayList<>(hit.channels);
      List<Channel> response=channels;String message=channels.isEmpty()?error:null;
      ui.post(()->callback.loaded(response,message));
    });
  }
  void shutdown(){worker.shutdownNow();}
}
