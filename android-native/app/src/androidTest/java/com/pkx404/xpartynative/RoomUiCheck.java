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
  @Override public void onCreate(Bundle args){super.onCreate(args);start();}
  private static TextView find(View root,String text){
    if(root instanceof TextView&&text.contentEquals(((TextView)root).getText()))return (TextView)root;
    if(root instanceof ViewGroup){
      ViewGroup group=(ViewGroup)root;
      for(int i=0;i<group.getChildCount();i++){TextView match=find(group.getChildAt(i),text);if(match!=null)return match;}
    }
    return null;
  }
  private static View findDescription(View root,String expected){
    if(expected.contentEquals(root.getContentDescription()))return root;
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
