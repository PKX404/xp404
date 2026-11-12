package com.pkx404.xpartynative;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import org.json.JSONObject;

/** Exercise provider and chat routing in Android views without paid accounts. */
public final class RoomUiCheck extends Instrumentation {
  private String media;
  @Override public void onCreate(Bundle args){super.onCreate(args);media=args==null?null:args.getString("media");start();}
  private static TextView find(View root,String text){
    if(root instanceof TextView&&text.contentEquals(((TextView)root).getText()))return (TextView)root;
    if(root instanceof ViewGroup){
      ViewGroup group=(ViewGroup)root;
      for(int i=0;i<group.getChildCount();i++){TextView match=find(group.getChildAt(i),text);if(match!=null)return match;}
    }
    return null;
  }
  private static View findDescription(View root,String expected){
    CharSequence description=root.getContentDescription();
    if(description!=null&&expected.contentEquals(description))return root;
    if(root instanceof ViewGroup){
      ViewGroup group=(ViewGroup)root;
      for(int i=0;i<group.getChildCount();i++){
        View found=findDescription(group.getChildAt(i),expected);
        if(found!=null)return found;
      }
    }
    return null;
  }
  private static void require(boolean value,String msg){if(!value)throw new AssertionError(msg);}
  @Override public void onStart(){
    Bundle result=new Bundle();
    try {
      Intent launch=new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      MainActivity app=(MainActivity)startActivitySync(launch);
      if("bridge".equals(media)){
        java.util.concurrent.atomic.AtomicBoolean ready=new java.util.concurrent.atomic.AtomicBoolean(false);
        runOnMainSync(()->{try{
          JSONObject room=new JSONObject().put("code","ROOM234").put("hostId","me");
          app.message(new JSONObject().put("type","welcome").put("id","me").put("room",room));
          JSONObject song=new JSONObject().put("type","youtube").put("id","fixture").put("videoId","M7lc1UVf-VE").put("title","Bridge check");
          room.put("source",song);app.message(new JSONObject().put("type","state").put("room",room));
          java.lang.reflect.Field field=MainActivity.class.getDeclaredField("youtube");field.setAccessible(true);
          android.webkit.WebView browser=(android.webkit.WebView)field.get(app);
          String bridge;try(java.io.InputStream in=app.getAssets().open("providers/player-port.html");java.util.Scanner reader=new java.util.Scanner(in,"UTF-8")){bridge=reader.useDelimiter("\\A").next();}
          String document="<html><head>"+bridge+"</head><body><script>XpartyYT.error(713);</script></body></html>";
          browser.loadDataWithBaseURL("https://xparty-native-room.onrender.com/",document,"text/html","UTF-8",null);
        }catch(Exception e){throw new IllegalStateException(e);}});
        for(int i=0;i<50&&!ready.get();i++){android.os.SystemClock.sleep(200);
          runOnMainSync(()->ready.set(find(app.findViewById(android.R.id.content),"YouTube player error 713 · choose another video")!=null));}
        require(ready.get(),"Top document player port could not reach Android");runOnMainSync(app::finish);
        result.putString("result","PASS bridge activation");finish(Activity.RESULT_OK,result);return;
      }
      if("mic".equals(media)||"camera".equals(media)){
        NativeCallController[] controller=new NativeCallController[1];
        runOnMainSync(()->{
          NativeCallController calls=new NativeCallController(app,new NativeCallController.Events(){
            public void signal(String peer,JSONObject data){} public void sendMedia(boolean mic,boolean camera){}
            public void action(String action){} public void status(String value){}
          });
          controller[0]=calls;calls.attach(new android.widget.FrameLayout(app));
          try{
            org.json.JSONArray people=new org.json.JSONArray();
            for(String id:new String[]{"me","peer"})people.put(new JSONObject().put("id",id).put("online",true).put("inCall",true));
            calls.syncRoom(new JSONObject().put("people",people),"me");
            if("mic".equals(media))calls.toggleMic();else calls.toggleCamera();
          }catch(Exception e){throw new IllegalStateException(e);}
        });
        android.os.SystemClock.sleep(5000);
        runOnMainSync(()->{require("mic".equals(media)?controller[0].isMicOn():controller[0].isCameraOn(),"media activation");controller[0].stop();app.finish();});
        result.putString("result","PASS "+media+" activation");finish(Activity.RESULT_OK,result);return;
      }
      Throwable[] failure=new Throwable[1];
      runOnMainSync(()->{
        try{
          JSONObject room=new JSONObject().put("code","ROOM234").put("hostId","me");
          app.message(new JSONObject().put("type","welcome").put("id","me").put("room",room));
          View root=app.findViewById(android.R.id.content);
          String[][] cases={{"vimeo","https://vimeo.com/76979871","76979871"},
            {"twitch","https://www.twitch.tv/videos/123456789","video:123456789"},
            {"twitch","https://www.twitch.tv/nasa","channel:nasa"},
            {"netflix","https://www.netflix.com/title/80057281","80057281"},
            {"prime","https://www.primevideo.com/detail/B012345678","B012345678"}};
          for(String[] c:cases){
            JSONObject source=ProviderLink.parse(c[0],c[1],null);
            require(source!=null&&c[2].equals(source.optString("videoId")),"parse "+c[0]);
            source.put("id","selection-"+c[2]);room.put("source",source);
            app.message(new JSONObject().put("type","state").put("room",room));
            if(ProviderLink.companion(c[0]))require(find(root,"Open title in "+ProviderLink.name(c[0]))!=null,"title action");
          }
          require(ProviderLink.parse("netflix","https://netflix.com.example.org/title/80057281",null)==null,"origin validation");
          JSONObject mine=new JSONObject().put("type","chat").put("id","a").put("from","me").put("text","My message");
          JSONObject other=new JSONObject().put("type","chat").put("id","b").put("from","other").put("name","Maya").put("text","Hi there");
          app.message(mine);app.message(other);
          require(find(root,"Maya: Hi there")!=null,"sender and message");
          app.message(new JSONObject().put("type","read").put("id","a").put("by","other"));
          require(find(root,"My message  ✓✓")!=null,"receipt");
          other.put("text","Edited");app.message(new JSONObject().put("type","message-update").put("message",other));
          require(find(root,"Maya: Hi there")==null&&find(root,"Maya: Edited")!=null,"in-place update");
          require(findDescription(root,"Share room invite")!=null,"visible native room Share button");
          android.app.Instrumentation.ActivityMonitor monitor=addMonitor(new android.content.IntentFilter(Intent.ACTION_CHOOSER),new ActivityResult(Activity.RESULT_CANCELED,null),true);
          findDescription(root,"Share room invite").performClick();
          require(monitor.getHits()==1,"Share must launch Android chooser");removeMonitor(monitor);
          java.lang.reflect.Method lobby=MainActivity.class.getDeclaredMethod("showLobby");
          lobby.setAccessible(true);lobby.invoke(app);
          java.lang.reflect.Method profile=MainActivity.class.getDeclaredMethod("showProfileHome");
          profile.setAccessible(true);profile.invoke(app);
          View page=app.findViewById(android.R.id.content);
          require(find(page,"Recently opened")!=null,"profile recent media");
          require(find(page,"Liked videos")!=null,"profile liked media");
          require(find(page,"Interests & keywords")!=null,"profile keyword editor");
          require(find(page,"Top sources")!=null,"profile source rankings");
          app.finish();
        }catch(Throwable e){failure[0]=e;}
      });
      if(failure[0]!=null)throw new AssertionError(failure[0]);
      result.putString("result","PASS provider routes and chat");finish(Activity.RESULT_OK,result);
    }catch(Throwable e){result.putString("result","FAIL "+android.util.Log.getStackTraceString(e));finish(Activity.RESULT_CANCELED,result);}
  }
}
