package com.pkx404.xparty.nativeapp;

import android.app.Activity;
import android.app.AlertDialog;
import android.net.Uri;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/** Native, compact source sheet: controls don't appear over empty playback. */
public final class SourcePicker {
    public interface Result {
        void source(JSONObject item);
        void localFile();
        void message(String message);
    }
    private final Activity activity;private final RoomSocket socket;private final Result result;
    private final OkHttpClient client=new OkHttpClient();
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    SourcePicker(Activity activity,RoomSocket socket,Result result){
        this.activity=activity;this.socket=socket;this.result=result;
    }
    private TextView sheetChip(String title,Runnable action){
        TextView item=NativeUi.text(activity,title,14,true);
        item.setGravity(Gravity.CENTER);
        item.setPadding(NativeUi.dp(activity,12),0,NativeUi.dp(activity,12),0);
        item.setBackground(NativeUi.shape(0xFF292236,16,activity));
        item.setOnClickListener(v->action.run());
        return item;
    }
    public void show(){
        // Restore the original XParty dark bottom-sheet arrangement using native Views.
        android.app.Dialog dialog=new android.app.Dialog(activity);
        LinearLayout panel=NativeUi.vertical(activity);
        panel.setBackground(NativeUi.shape(0xFF161322,25,activity));
        panel.setPadding(NativeUi.dp(activity,18),NativeUi.dp(activity,12),
            NativeUi.dp(activity,18),NativeUi.dp(activity,12));
        TextView handle=NativeUi.text(activity,"━━━━",20,true);
        handle.setTextColor(0xFF686073);handle.setGravity(Gravity.CENTER);
        panel.addView(handle,NativeUi.lp(activity,-1,20));
        LinearLayout heading=NativeUi.horizontal(activity);
        TextView title=NativeUi.text(activity,"Find something to watch",21,true);
        heading.addView(title,new LinearLayout.LayoutParams(0,NativeUi.dp(activity,52),1));
        TextView close=NativeUi.icon(activity,"×",dialog::dismiss);
        heading.addView(close,NativeUi.lp(activity,40,44));
        panel.addView(heading);
        LinearLayout toolbar=NativeUi.horizontal(activity);
        TextView sources=sheetChip("All sources",()->{
            dialog.dismiss();
            String[] menu={"YouTube","Live TV","Direct video","Local file"};
            new AlertDialog.Builder(activity).setTitle("Choose source").setItems(menu,(d,i)->{
                if(i==0)youtubeMenu();if(i==1)countryMenu();
                if(i==2)videoLink();if(i==3)result.localFile();
            }).show();
        });
        toolbar.setGravity(Gravity.RIGHT|Gravity.CENTER_VERTICAL);
        toolbar.addView(sources,NativeUi.lp(activity,124,42));
        panel.addView(toolbar,NativeUi.lp(activity,-1,49));
        NativeUi.space(activity,panel,8);
        LinearLayout top=NativeUi.horizontal(activity);
        String[] names={"Video links","Local file"};
        TextView links=sheetChip(names[0],()->{dialog.dismiss();youtubeMenu();});
        TextView files=sheetChip(names[1],()->{dialog.dismiss();result.localFile();});
        links.setBackground(NativeUi.shape(0xFF392848,16,activity));
        LinearLayout.LayoutParams wide=new LinearLayout.LayoutParams(0,NativeUi.dp(activity,44),1);
        wide.rightMargin=NativeUi.dp(activity,6);
        LinearLayout.LayoutParams narrow=new LinearLayout.LayoutParams(0,NativeUi.dp(activity,44),1);
        narrow.leftMargin=NativeUi.dp(activity,6);
        top.addView(links,wide);top.addView(files,narrow);
        panel.addView(top);
        NativeUi.space(activity,panel,10);
        LinearLayout searches=NativeUi.horizontal(activity);
        TextView search=sheetChip("Search",()->{dialog.dismiss();ask("Search videos","Artist, video or music",this::searchYoutube);});
        TextView suggestions=sheetChip("Suggestions",()->{dialog.dismiss();searchYoutube("music live performance");});
        LinearLayout.LayoutParams half=new LinearLayout.LayoutParams(0,NativeUi.dp(activity,44),1);
        half.rightMargin=NativeUi.dp(activity,6);searches.addView(search,half);
        half=new LinearLayout.LayoutParams(0,NativeUi.dp(activity,44),1);half.leftMargin=NativeUi.dp(activity,6);
        searches.addView(suggestions,half);
        panel.addView(searches);
        NativeUi.space(activity,panel,21);
        TextView explainer=NativeUi.label(activity,"Find videos, live TV channels and music to watch together.",13);
        panel.addView(explainer);
        NativeUi.space(activity,panel,20);
        LinearLayout topics=NativeUi.horizontal(activity);
        for(String[] topic:new String[][]{{"For this room","trending music"},{"Music","live music"},{"Comedy","comedy clips"},{"Gaming","gaming highlights"}}){
            TextView t=sheetChip(topic[0],()->{dialog.dismiss();searchYoutube(topic[1]);});
            LinearLayout.LayoutParams cell=new LinearLayout.LayoutParams(0,NativeUi.dp(activity,43),1);
            cell.rightMargin=NativeUi.dp(activity,4);topics.addView(t,cell);
        }
        panel.addView(topics);
        NativeUi.space(activity,panel,20);
        TextView upNext=NativeUi.text(activity,"Up next",16,true);
        panel.addView(upNext);
        NativeUi.space(activity,panel,6);
        TextView queue=NativeUi.label(activity,"Choose a video, or let the host select from the room queue.",13);
        panel.addView(queue);
        NativeUi.space(activity,panel,14);
        LinearLayout quick=NativeUi.horizontal(activity);
        TextView tv=sheetChip("📺 Live TV",()->{dialog.dismiss();countryMenu();});
        TextView direct=sheetChip("▶ Video URL",()->{dialog.dismiss();videoLink();});
        LinearLayout.LayoutParams a=new LinearLayout.LayoutParams(0,NativeUi.dp(activity,46),1);
        a.rightMargin=NativeUi.dp(activity,6);
        LinearLayout.LayoutParams b=new LinearLayout.LayoutParams(0,NativeUi.dp(activity,46),1);
        b.leftMargin=NativeUi.dp(activity,6);
        quick.addView(tv,a);quick.addView(direct,b);panel.addView(quick);
        dialog.setContentView(panel);
        android.view.Window window=dialog.getWindow();
        if(window!=null){
            window.setBackgroundDrawableResource(android.R.color.transparent);
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            android.view.WindowManager.LayoutParams attrs=window.getAttributes();
            attrs.gravity=Gravity.BOTTOM;attrs.dimAmount=0.68f;attrs.windowAnimations=0;
            window.setAttributes(attrs);
        }
        dialog.show();
        window=dialog.getWindow();
        if(window!=null)window.setLayout(-1,-2);
    }
    private void ask(String title,String hint,java.util.function.Consumer<String> answer){
        EditText input=NativeUi.edit(activity,hint);
        input.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        LinearLayout wrap=NativeUi.vertical(activity);wrap.setPadding(NativeUi.dp(activity,18),8,NativeUi.dp(activity,18),0);
        wrap.addView(input,NativeUi.lp(activity,-1,52));
        new AlertDialog.Builder(activity).setTitle(title).setView(wrap)
            .setPositiveButton("Continue",(dialog,button)->answer.accept(input.getText().toString().trim()))
            .setNegativeButton("Cancel",null).show();
    }
    private void youtubeMenu(){
        new AlertDialog.Builder(activity).setTitle("YouTube")
            .setItems(new String[]{"Paste YouTube link","Search YouTube"},(d,index)->{
                if(index==0)ask("YouTube link","https://youtu.be/…",this::youtubeLink);
                else ask("Search YouTube","Video or music name",this::searchYoutube);
            }).show();
    }
    private void youtubeLink(String link){
        String id=null;
        if(link.matches("[A-Za-z0-9_-]{11}"))id=link;
        else try{
            Uri u=Uri.parse(link);String host=u.getHost();
            if(host!=null&&(host.equals("youtu.be")||host.equals("www.youtube.com")||host.equals("youtube.com")||host.equals("m.youtube.com"))){
                if(host.equals("youtu.be"))id=u.getPathSegments().get(0);
                else if(u.getQueryParameter("v")!=null)id=u.getQueryParameter("v");
                else if(u.getPathSegments().size()>=2)id=u.getPathSegments().get(1);
            }
        }catch(Exception ignored){}
        if(id==null||!id.matches("[A-Za-z0-9_-]{11}")){result.message("Invalid YouTube link");return;}
        JSONObject item=RoomSocket.with("type","youtube");RoomSocket.put(item,"videoId",id);RoomSocket.put(item,"title","YouTube video");
        result.source(item);
    }
    private void searchYoutube(String q){
        if(q.length()<2){result.message("Enter at least two characters");return;}
        worker.execute(()->{
            try{
                String link=socket.backend()+"/api/search?q="+java.net.URLEncoder.encode(q,"UTF-8");
                Request req=new Request.Builder().url(link).header("Authorization","Bearer "+socket.token()).build();
                try(Response response=client.newCall(req).execute()){
                    if(!response.isSuccessful())throw new IllegalStateException("Search is unavailable");
                    JSONArray items=new JSONObject(response.body().string()).optJSONArray("items");
                    activity.runOnUiThread(()->showYoutubeResults(items));
                }
            }catch(Exception e){activity.runOnUiThread(()->result.message("YouTube search unavailable. Paste a link instead."));}
        });
    }
    private void showYoutubeResults(JSONArray items){
        if(items==null||items.length()==0){result.message("No videos found");return;}
        ArrayList<JSONObject> sources=new ArrayList<>();ArrayList<String> names=new ArrayList<>();
        for(int i=0;i<items.length()&&i<25;i++){
            JSONObject item=items.optJSONObject(i);if(item==null)continue;
            String id=item.optString("videoId",item.optString("id"));
            if(!id.matches("[A-Za-z0-9_-]{11}"))continue;
            JSONObject source=RoomSocket.with("type","youtube");RoomSocket.put(source,"videoId",id);
            RoomSocket.put(source,"title",item.optString("title","YouTube video"));
            sources.add(source);names.add(item.optString("title","YouTube video"));
        }
        if(sources.isEmpty()){result.message("No playable video results");return;}
        new AlertDialog.Builder(activity).setTitle("YouTube results")
            .setItems(names.toArray(new String[0]),(d,i)->result.source(sources.get(i))).show();
    }
    private void videoLink(){
        ask("HTTPS video link","https://example.com/video.mp4",url->{
            Uri u=Uri.parse(url);
            if(!"https".equalsIgnoreCase(u.getScheme())||u.getHost()==null){result.message("Choose a secure HTTPS video URL");return;}
            JSONObject item=RoomSocket.with("type","direct");RoomSocket.put(item,"url",url);
            RoomSocket.put(item,"title","Shared video");result.source(item);
        });
    }
    private void countryMenu(){
        String[] labels={"India","United States","United Kingdom","Canada","Australia","Germany","France","Worldwide"};
        String[] codes={"in","us","uk","ca","au","de","fr",""};
        new AlertDialog.Builder(activity).setTitle("Live TV · choose region")
            .setItems(labels,(d,i)->loadChannels(codes[i])).show();
    }
    private static class Channel{String title,url,logo;Channel(String title,String url,String logo){this.title=title;this.url=url;this.logo=logo;}}
    private void loadChannels(String country){
        result.message("Loading channels");
        worker.execute(()->{
            String url="https://iptv-org.github.io/iptv/"+(country.isEmpty()?"index.m3u":"countries/"+country+".m3u");
            ArrayList<Channel> channels=new ArrayList<>();
            try{
                Request r=new Request.Builder().url(url).build();
                try(Response response=client.newCall(r).execute()){
                    if(!response.isSuccessful())throw new IllegalStateException("Directory unavailable");
                    if(response.body()==null)throw new IllegalStateException("Empty directory");
                    String content=response.body().string();
                    String title="",logo="";
                    for(String line:content.split("\\r?\\n")){
                        line=line.trim();
                        if(line.startsWith("#EXTINF:")){
                            title=line.contains(",")?line.substring(line.lastIndexOf(',')+1).trim():"Live channel";
                            java.util.regex.Matcher match=java.util.regex.Pattern.compile("tvg-logo=\\\"([^\\\"]+)\\\"").matcher(line);
                            logo=match.find()?match.group(1):"";
                        }else if(line.startsWith("https://")&&channels.size()<550&&!title.isEmpty()){
                            channels.add(new Channel(title,line,logo));title="";logo="";
                        }
                    }
                }
                activity.runOnUiThread(()->channelFilter(channels));
            }catch(Exception e){activity.runOnUiThread(()->result.message("Channel directory unavailable. Try a video link."));}
        });
    }
    private void channelFilter(ArrayList<Channel> all){
        if(all.isEmpty()){result.message("No playable HTTPS channels found");return;}
        EditText field=NativeUi.edit(activity,"Search channel name");
        LinearLayout layout=NativeUi.vertical(activity);
        layout.setPadding(NativeUi.dp(activity,12),NativeUi.dp(activity,12),NativeUi.dp(activity,12),0);
        layout.addView(field,NativeUi.lp(activity,-1,48));
        ScrollView scroll=new ScrollView(activity);LinearLayout options=NativeUi.vertical(activity);
        scroll.addView(options);layout.addView(scroll,new LinearLayout.LayoutParams(-1,NativeUi.dp(activity,360)));
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("Live TV").setView(layout).setNegativeButton("Close",null).create();
        Runnable rebuild=()->{
            options.removeAllViews();int shown=0;String term=field.getText().toString().toLowerCase(Locale.ROOT).trim();
            for(Channel channel:all){
                if(!channel.title.toLowerCase(Locale.ROOT).contains(term))continue;
                TextView item=NativeUi.text(activity,"📺  "+channel.title,15,false);
                item.setPadding(12,10,12,10);
                item.setOnClickListener(v->{
                    JSONObject source=RoomSocket.with("type","iptv");
                    RoomSocket.put(source,"url",channel.url);RoomSocket.put(source,"title",channel.title);
                    if(channel.logo.startsWith("https://"))RoomSocket.put(source,"logo",channel.logo);
                    result.source(source);dialog.dismiss();
                });
                options.addView(item,NativeUi.lp(activity,-1,52));
                if(++shown>=75)break;
            }
        };
        field.addTextChangedListener(new android.text.TextWatcher(){
            public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            public void onTextChanged(CharSequence s,int start,int before,int count){rebuild.run();}
            public void afterTextChanged(android.text.Editable s){}
        });
        dialog.show();rebuild.run();
    }
    public void close(){worker.shutdownNow();client.dispatcher().executorService().shutdown();}
}
