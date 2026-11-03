package com.pkx404.xparty.nativeapp;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/** Native XParty room protocol. One socket and one presence identity per app session. */
public final class RoomSocket {
    public interface Events {
        void onEvent(JSONObject message);
        void onStatus(String status);
    }
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final OkHttpClient http = new OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS).pingInterval(18, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS).build();
    private final SharedPreferences prefs;
    private final Events events;
    private String backend, token="", roomCode="";
    private WebSocket ws;
    private int epoch=0, attempts=0;
    private boolean closed=false;
    private final Runnable heartbeat = new Runnable() {
        @Override public void run() {
            if (ws != null && !closed) send("ping", with("sent",System.currentTimeMillis()));
            if (!closed) ui.postDelayed(this, 7000);
        }
    };
    public RoomSocket(Context ctx, String base, Events events) {
        prefs=ctx.getSharedPreferences("xparty.native.room",Context.MODE_PRIVATE);
        backend=base.replaceAll("/+$","");
        this.events=events;
        token=prefs.getString("token","");
        roomCode=prefs.getString("room","");
    }
    public String backend(){return backend;}
    public String token(){return token;}
    public String roomCode(){return roomCode;}
    public boolean hasSession(){return !token.isEmpty();}
    public void resumeIfPossible(){
        if(!token.isEmpty())connect("resume",with("token",token));
    }
    public void create(String nickname){connect("create",with("name",nickname));}
    public void join(String code,String nickname){
        JSONObject data=with("name",nickname);
        put(data,"code",code.trim().toUpperCase(java.util.Locale.ROOT));
        connect("join",data);
    }
    private void connect(String action,JSONObject fields) {
        closed=false; epoch++;int generation=epoch;
        WebSocket old=ws;ws=null;
        if(old!=null)old.close(1000,"Replacing connection");
        String address=backend.replaceFirst("^https://","wss://")+"/ws";
        if(!address.startsWith("wss://")){emit("Secure HTTPS backend required");return;}
        emit("Connecting");
        Request request=new Request.Builder().url(address).header("Origin",backend).build();
        ws=http.newWebSocket(request,new WebSocketListener(){
            @Override public void onOpen(WebSocket connection,Response response){
                if(generation!=epoch){connection.close(1000,"Stale");return;}
                JSONObject message=with("type",action);
                java.util.Iterator<String> keys=fields.keys();
                while(keys.hasNext()){String key=keys.next();put(message,key,fields.opt(key));}
                connection.send(message.toString());emit("Connected");
            }
            @Override public void onMessage(WebSocket connection,String text){
                if(generation!=epoch)return;
                try{
                    JSONObject m=new JSONObject(text);
                    if("welcome".equals(m.optString("type"))){
                        attempts=0;
                        token=m.optString("token");
                        roomCode=m.optJSONObject("room")==null?"":m.optJSONObject("room").optString("code");
                        prefs.edit().putString("token",token).putString("room",roomCode).apply();
                    }
                    if("resume-failed".equals(m.optString("type"))||"ended".equals(m.optString("type"))||"kicked".equals(m.optString("type"))){
                        clearSession();
                    }
                    ui.post(()->{if(generation==epoch)events.onEvent(m);});
                }catch(JSONException ignored){}
            }
            @Override public void onFailure(WebSocket connection,Throwable error,Response response){
                if(generation!=epoch)return;
                emit("Disconnected");
                retry(generation);
            }
            @Override public void onClosed(WebSocket connection,int code,String reason){
                if(generation!=epoch)return;
                emit("Disconnected");
                retry(generation);
            }
        });
        ui.removeCallbacks(heartbeat);
        ui.postDelayed(heartbeat,7000);
    }
    private void retry(int generation){
        if(closed||token.isEmpty()||generation!=epoch)return;
        long ms=Math.min(30000L,1000L<<Math.min(5,attempts++));
        ui.postDelayed(()->{if(!closed&&generation==epoch)connect("resume",with("token",token));},ms);
    }
    public boolean send(String type,JSONObject fields){
        WebSocket connection=ws;
        if(connection==null)return false;
        JSONObject m=with("type",type);
        java.util.Iterator<String> it=fields.keys();
        while(it.hasNext()){String key=it.next();put(m,key,fields.opt(key));}
        return connection.send(m.toString());
    }
    public void leave(){
        closed=true;epoch++;
        if(ws!=null){send("leave",new JSONObject());ws.close(1000,"Leaving room");ws=null;}
        clearSession();ui.removeCallbacks(heartbeat);
    }
    public void destroy(){closed=true;epoch++;ui.removeCallbacks(heartbeat);if(ws!=null){ws.close(1000,"Activity stopped");ws=null;}http.dispatcher().executorService().shutdown();}
    private void clearSession(){token="";roomCode="";prefs.edit().remove("token").remove("room").apply();}
    private void emit(String state){ui.post(()->events.onStatus(state));}
    public static JSONObject with(String key,Object value){JSONObject o=new JSONObject();put(o,key,value);return o;}
    public static void put(JSONObject o,String key,Object v){try{o.put(key,v);}catch(JSONException ignored){}}
}
