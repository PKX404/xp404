package com.pkx404.xpartynative;

import android.content.SharedPreferences;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Device-only profile analytics. No inferred interests, no tracking SDK and
 * no server upload. "Recent" means opened, never a claim of completed viewing.
 */
final class NativeProfileStore {
  private static final String HISTORY="profile_recent_sources_v1";
  private static final String LIKES="profile_liked_sources_v1";
  private static final String WATCH="profile_local_play_seconds_v1";
  private static final String KEYWORDS="profile_keywords_v1";
  private static final String BIO="profile_bio_v1";
  private final SharedPreferences prefs;
  private String lastRecorded="";
  private long lastRecordedAt=0L;

  NativeProfileStore(SharedPreferences preferences){this.prefs=preferences;}

  private JSONArray read(String key){
    try{return new JSONArray(prefs.getString(key,"[]"));}
    catch(Exception ignored){return new JSONArray();}
  }
  JSONArray history(){return read(HISTORY);}
  JSONArray likes(){return read(LIKES);}
  JSONArray favorites(){return read("favorite_sources");}
  long watchSeconds(){return Math.max(0,prefs.getLong(WATCH,0L));}
  String bio(){return prefs.getString(BIO,"");}
  String keywords(){return prefs.getString(KEYWORDS,"");}
  void setBio(String value){
    String clean=value==null?"":value.trim();
    if(clean.length()>300)clean=clean.substring(0,300);
    prefs.edit().putString(BIO,clean).apply();
  }
  void setKeywords(String value){
    String[] split=(value==null?"":value).split("[,\\n]");
    StringBuilder result=new StringBuilder();
    for(String raw:split){
      String item=raw.trim().replaceAll("\\s+"," ");
      if(item.isEmpty())continue;
      if(item.length()>28)item=item.substring(0,28);
      if(result.length()>0)result.append(", ");
      result.append(item);
      if(result.toString().split(",").length>=12)break;
    }
    prefs.edit().putString(KEYWORDS,result.toString()).apply();
  }
  private static String identity(JSONObject source){
    if(source==null)return "";
    String type=source.optString("type","");
    String key=source.optString("videoId",source.optString("url",""));
    if(key.isEmpty())key=source.optString("url","");
    return type+"|"+key;
  }
  private static JSONObject entry(JSONObject src, long time, int opens){
    JSONObject result=new JSONObject();
    try{
      result.put("type",src.optString("type",""));
      result.put("videoId",src.optString("videoId",""));
      result.put("url",src.optString("url",""));
      result.put("title",src.optString("title","Untitled"));
      result.put("logo",src.optString("logo",""));
      result.put("openedAt",time);
      result.put("opens",opens);
    }catch(Exception ignored){}
    return result;
  }
  void recordOpened(JSONObject source){
    String key=identity(source);
    if(key.isEmpty()||key.equals("|"))return;
    long now=System.currentTimeMillis();
    // avoid duplicate entries when the same source is reloaded or socket state is refreshed.
    if(key.equals(lastRecorded)&&now-lastRecordedAt<30000)return;
    lastRecorded=key;lastRecordedAt=now;
    JSONArray old=history(),out=new JSONArray();
    int previousOpens=0;
    for(int i=0;i<old.length();i++){
      JSONObject item=old.optJSONObject(i);if(item==null)continue;
      if(key.equals(identity(item)))previousOpens=Math.max(previousOpens,item.optInt("opens",1));
      else if(out.length()<39)out.put(item);
    }
    JSONArray ordered=new JSONArray().put(entry(source,now,previousOpens+1));
    for(int i=0;i<out.length();i++)ordered.put(out.optJSONObject(i));
    prefs.edit().putString(HISTORY,ordered.toString()).apply();
  }
  private boolean has(JSONArray array,JSONObject src){
    String id=identity(src);
    if(id.isEmpty()||id.equals("|"))return false;
    for(int i=0;i<array.length();i++)if(id.equals(identity(array.optJSONObject(i))))return true;
    return false;
  }
  boolean isLiked(JSONObject source){return has(likes(),source);}
  boolean setLiked(JSONObject source,boolean liked){
    String id=identity(source);
    if(id.isEmpty()||id.equals("|"))return false;
    JSONArray before=likes(),out=new JSONArray();
    if(liked)out.put(entry(source,System.currentTimeMillis(),1));
    for(int i=0;i<before.length();i++){
      JSONObject old=before.optJSONObject(i);
      if(old!=null&&!id.equals(identity(old))&&out.length()<40)out.put(old);
    }
    prefs.edit().putString(LIKES,out.toString()).apply();
    return liked;
  }
  void addWatchSeconds(long seconds){
    if(seconds<=0||seconds>15)return;
    long before=watchSeconds();
    prefs.edit().putLong(WATCH,Math.min(1000000000L,before+seconds)).apply();
  }
  void clearHistory(){prefs.edit().remove(HISTORY).apply();lastRecorded="";lastRecordedAt=0L;}
  void clearLikes(){prefs.edit().remove(LIKES).apply();}
}
