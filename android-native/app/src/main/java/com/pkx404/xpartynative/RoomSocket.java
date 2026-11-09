package com.pkx404.xpartynative;

import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONException;
import org.json.JSONObject;

/** Real XParty v31.x room protocol; not a WebView socket. */
final class RoomSocket {
  interface Events {
    void status(String text);
    void message(JSONObject message);
  }
  private static final String URL="wss://xparty-native-room.onrender.com/ws";
  private final OkHttpClient client=new OkHttpClient.Builder()
     .pingInterval(20,TimeUnit.SECONDS)
     .readTimeout(0,TimeUnit.MILLISECONDS)
     .connectTimeout(20,TimeUnit.SECONDS).build();
  private final Handler ui=new Handler(Looper.getMainLooper());
  private final Events events;
  private WebSocket socket;
  private JSONObject pending;
  private String sessionToken;
  private boolean closed=true, welcomed;
  private int generation, retryCount;
  RoomSocket(Events events){this.events=events;}

  void start(String type,String name,String code,String existingToken) {
    disconnect(false);
    closed=false;welcomed=false;retryCount=0;sessionToken=existingToken;
    try {
      pending=new JSONObject().put("type",type);
      if("join".equals(type))pending.put("code",code);
      if("resume".equals(type))pending.put("token",existingToken);
      else pending.put("name",name);
    }catch(JSONException ignored){}
    connect(++generation);
  }
  private void emitStatus(String s){ui.post(()->events.status(s));}
  private void connect(int current){
    if(closed||generation!=current)return;
    emitStatus(retryCount==0?"Connecting to live room…":"Reconnecting ("+retryCount+"/6)…");
    Request request=new Request.Builder().url(URL).header("Origin","https://xparty-native-room.onrender.com").build();
    final java.util.concurrent.atomic.AtomicBoolean stopped=new java.util.concurrent.atomic.AtomicBoolean(false);
    socket=client.newWebSocket(request,new WebSocketListener(){
      @Override public void onOpen(WebSocket webSocket,Response response){
        if(closed||generation!=current){webSocket.close(1000,"Expired");return;}
        webSocket.send(pending.toString());
      }
      @Override public void onMessage(WebSocket webSocket,String text){
        if(closed||generation!=current)return;
        try{
          JSONObject event=new JSONObject(text);
          if("welcome".equals(event.optString("type"))){
            welcomed=true;retryCount=0;
            sessionToken=event.optString("token",sessionToken);
            emitStatus("Live room connected");
          }
          ui.post(()->events.message(event));
        }catch(JSONException ignored){}
      }
      @Override public void onFailure(WebSocket webSocket,Throwable error,Response response){
        if(stopped.compareAndSet(false,true))
          failed(current,error.getMessage()==null?"Connection failed":error.getMessage());
      }
      @Override public void onClosed(WebSocket webSocket,int code,String reason){
        if(stopped.compareAndSet(false,true))failed(current,"Room connection ended");
      }
    });
  }
  private void failed(int current,String reason){
    if(closed||current!=generation)return;
    if(retryCount>=6){emitStatus("Connection unavailable. Tap Retry.");return;}
    ++retryCount;
    long delay=Math.min(16000L,800L*(1L<<Math.min(4,retryCount)));
    try{
      if(sessionToken!=null&&!sessionToken.isEmpty())
        pending=new JSONObject().put("type","resume").put("token",sessionToken);
    }catch(JSONException ignored){}
    emitStatus("Room temporarily unreachable; retrying…");
    ui.postDelayed(()->connect(current),delay);
  }
  void send(JSONObject command){WebSocket ws=socket;if(!closed&&ws!=null)ws.send(command.toString());}
  void disconnect(boolean sendLeave){
    closed=true;generation++;ui.removeCallbacksAndMessages(null);
    if(socket!=null){
      if(sendLeave)socket.send("{\"type\":\"leave\"}");
      socket.close(1000,"Exit");socket=null;
    }
    pending=null;sessionToken=null;
  }
  boolean isConnected(){return welcomed&&!closed;}
}
