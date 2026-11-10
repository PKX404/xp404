package com.pkx404.xpartynative;

import android.app.Activity;
import android.app.Dialog;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import java.io.IOException;

/** Source picker remains Android-native. YouTube Browse alone uses provider's website. */
final class NativeSourceSheet {
  interface Actions {
    void selected(JSONObject source);
    void pickLocal();
    void enterLink(String source);
    void notice(String message);
  }
  private static final int BG=0xFF151123, SURFACE=0xFF251E33, PURPLE=0xFF9C87CB;
  private static final int WHITE=0xFFF8F7FC, MUTED=0xFFB4AEC5, EDGE=0xFF4F4567;
  private final Activity activity;
  private final ChannelCatalog directory;
  private final NativeArtwork artwork;
  private final Actions actions;
  private final SharedPreferences prefs;
  private final Handler ui=new Handler(Looper.getMainLooper());
  private final OkHttpClient http=new OkHttpClient();
  private final String backend;
  private Dialog dialog;
  private WebView browseWeb;
  private final java.util.ArrayList<WebView> popupBrowsers=new java.util.ArrayList<>();
  private LinearLayout body,providerView;
  private EditText channelSearch,youtubeSearch;
  private String roomToken="",currentTab="all",category="All",typedSearch="",youtubeQuery="";
  private final List<ChannelCatalog.Channel> channels=new ArrayList<>();
  private final List<JSONObject> ytItems=new ArrayList<>();
  private int categoryRequest=0,youtubeRequest=0,shownChannels=28,shownYouTube=20,selectedTabIndex=1;
  private String nextYouTubePage="";
  private String tileMode="grid2";
  private String loadedCategory="";
  private Runnable youtubeDebounce;

  NativeSourceSheet(Activity activity,ChannelCatalog directory,NativeArtwork artwork,Actions actions,String backend){
    this.activity=activity;this.directory=directory;this.artwork=artwork;this.actions=actions;this.backend=backend;
    prefs=activity.getPreferences(Context.MODE_PRIVATE);
    category=prefs.getString("last_iptv_category","Movies");
    tileMode=prefs.getString("native_source_tile_layout","grid2");
  }
  private int dp(float n){return Math.round(n*activity.getResources().getDisplayMetrics().density);}
  private GradientDrawable rounded(int color,int radius){
    GradientDrawable shape=new GradientDrawable();
    shape.setColor(color);shape.setCornerRadius(dp(radius));shape.setStroke(dp(1),EDGE);return shape;
  }
  private TextView label(String text,int size,int color,boolean bold){
    TextView view=new TextView(activity);view.setText(text);view.setTextSize(size);view.setTextColor(color);
    if(bold)view.setTypeface(Typeface.create("sans-serif-medium",Typeface.BOLD));return view;
  }
  private EditText input(String hint){
    EditText edit=new EditText(activity);edit.setSingleLine(true);edit.setTextSize(16);
    edit.setTextColor(WHITE);edit.setHintTextColor(MUTED);edit.setHint(hint);
    edit.setPadding(dp(14),dp(9),dp(12),dp(9));edit.setBackground(rounded(0xFF191528,15));return edit;
  }
  private TextView chip(String text,boolean selected,Runnable action){
    TextView v=label(text,13,selected?WHITE:0xFFDFD9EC,true);
    v.setGravity(Gravity.CENTER);v.setMinHeight(dp(42));
    v.setPadding(dp(15),dp(10),dp(15),dp(10));
    GradientDrawable bg=rounded(selected?0xFF342A4B:0xFF251F33,22);
    bg.setStroke(dp(selected?2:1),selected?PURPLE:EDGE);v.setBackground(bg);
    v.setOnClickListener(w->action.run());
    return v;
  }
  private void add(LinearLayout parent,View child,int bottom){
    LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(bottom);
    parent.addView(child,lp);
  }
  private String title(String text){return text==null?"":text;}
  private int tileColumns(){
    // Only the Quick YouTube SEARCH result thumbnails use a configurable grid.
    switch(tileMode){
      case "grid3":return 3;
      case "grid4":return 4;
      case "list":case "poster":return 1;
      default:return 2;
    }
  }
  private boolean tileList(){return "list".equals(tileMode);}
  private void selectTileLayout(){
    final String[] keys={"grid2","grid3","grid4","poster","list"};
    final String[] labels={"2-column tiles (recommended)","3-column compact","4-column mini","Large posters","Detailed list"};
    int selected=0;
    for(int i=0;i<keys.length;i++)if(keys[i].equals(tileMode)){selected=i;break;}
    new AlertDialog.Builder(activity).setTitle("Source tile layout")
      .setSingleChoiceItems(labels,selected,(dialog,which)->{
        tileMode=keys[which];
        prefs.edit().putString("native_source_tile_layout",tileMode).apply();
        dialog.dismiss();
        if("youtube".equals(currentTab))renderYoutubeResults();
      }).setNegativeButton("Cancel",null).show();
  }
  private JSONArray saved(){
    try{return new JSONArray(prefs.getString("favorite_sources","[]"));}
    catch(Exception ignored){return new JSONArray();}
  }
  private boolean favorite(String key){
    JSONArray items=saved();
    for(int i=0;i<items.length();i++){
      JSONObject o=items.optJSONObject(i);
      if(o!=null&&key.equals(o.optString("url",o.optString("videoId"))))return true;
    }
    return false;
  }
  private void toggleFavorite(JSONObject source){
    JSONArray array=saved(),out=new JSONArray();
    String key=source.optString("url",source.optString("videoId"));
    boolean exists=false;
    for(int i=0;i<array.length();i++){
      JSONObject item=array.optJSONObject(i);
      if(item==null)continue;
      if(key.equals(item.optString("url",item.optString("videoId"))))exists=true;
      else out.put(item);
    }
    if(!exists)out.put(source);
    prefs.edit().putString("favorite_sources",out.toString()).apply();
    if("saved".equals(currentTab))showSaved();
  }
  private void choose(JSONObject source){
    prefs.edit().putString("last_source",source.optString("type","")).apply();
    actions.selected(source);dismiss();
  }
  void openYouTubeBrowse(String token){
    if(showing())dismiss();
    open("youtube",token,"");
    showYouTubeBrowse();
  }
  void open(String playing,String token,String name){
    roomToken=token==null?"":token;
    String recent=prefs.getString("last_source","");
    String initial=playing==null||playing.isEmpty()?recent:playing;
    dialog=new Dialog(activity);
    dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
    LinearLayout root=new LinearLayout(activity);root.setOrientation(LinearLayout.VERTICAL);
    root.setBackground(NativeImmersiveBackdrop.sheetSkin());
    root.setPadding(dp(12),dp(15),dp(12),dp(12));
    // Drag handle visually connects this dialog to the v31.6 source sheet.
    TextView handle=label("━━━━",15,0xFF6E677F,true);handle.setGravity(Gravity.CENTER);add(root,handle,5);
    LinearLayout tabs=new LinearLayout(activity);tabs.setGravity(Gravity.CENTER_VERTICAL);
    TextView quick=chip("Quick Search",false,()->showQuick());
    TextView all=chip("All sources",true,()->showProviders());
    TextView savedChip=chip("Saved",false,()->showSaved());
    tabs.addView(quick,new LinearLayout.LayoutParams(0,dp(48),1));
    LinearLayout.LayoutParams middle=new LinearLayout.LayoutParams(0,dp(48),1);middle.leftMargin=dp(6);
    tabs.addView(all,middle);
    LinearLayout.LayoutParams right=new LinearLayout.LayoutParams(0,dp(48),1);right.leftMargin=dp(6);
    tabs.addView(savedChip,right);
    TextView tiling=chip("▦",false,()->{
      if("youtube".equals(currentTab))selectTileLayout();
      else {showYoutube(false);selectTileLayout();}
    });
    tiling.setContentDescription("Choose YouTube search tile layout");
    LinearLayout.LayoutParams tilingLp=new LinearLayout.LayoutParams(dp(43),dp(47));
    tilingLp.leftMargin=dp(5);tabs.addView(tiling,tilingLp);
    XPControl close=new XPControl(activity,"exit");close.setOnClickListener(v->dismiss());
    LinearLayout.LayoutParams closeLp=new LinearLayout.LayoutParams(dp(43),dp(47));
    tabs.addView(close,closeLp);add(root,tabs,8);
    TextView returnButton=chip("Back to room",false,this::dismiss);
    LinearLayout home=new LinearLayout(activity);home.setGravity(Gravity.RIGHT);
    home.addView(returnButton,new LinearLayout.LayoutParams(-2,dp(43)));add(root,home,7);

    ScrollView scroller=new ScrollView(activity);scroller.setFillViewport(true);
    scroller.setVerticalScrollBarEnabled(false);
    body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);
    body.setPadding(dp(7),dp(10),dp(7),dp(6));
    scroller.addView(body);
    root.addView(scroller,new LinearLayout.LayoutParams(-1,0,1));
    dialog.setContentView(root);
    Window w=dialog.getWindow();
    if(w!=null){
      w.setBackgroundDrawableResource(android.R.color.transparent);
      w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
      w.setDimAmount(.47f);
      w.setGravity(Gravity.BOTTOM);
    }
    dialog.show();
    if(w!=null){
      w.setLayout(WindowManager.LayoutParams.MATCH_PARENT,
         Math.round(activity.getResources().getDisplayMetrics().heightPixels*.83f));
    }
    if("iptv".equals(initial))showIPTV(false);
    else if("quick".equals(initial))showQuick();
    else if("youtube".equals(initial))showYoutube(false);
    else showProviders();
  }
  boolean showing(){return dialog!=null&&dialog.isShowing();}
  void dismiss(){
    if(dialog!=null){dialog.dismiss();dialog=null;}
    clearBrowser();
    ui.removeCallbacksAndMessages(null);
  }
  private void clearBrowser(){
    if(browseWeb!=null){
      try{browseWeb.stopLoading();browseWeb.loadUrl("about:blank");browseWeb.destroy();}
      catch(Exception ignored){}
      browseWeb=null;
    }
    for(WebView popup:popupBrowsers){
      try{popup.stopLoading();popup.destroy();}catch(Exception ignored){}
    }
    popupBrowsers.clear();
  }
  private void clear(){
    if(body!=null){body.removeAllViews();channelSearch=null;youtubeSearch=null;}
    clearBrowser();
  }
  private void showProviders(){
    currentTab="all";clear();
    String[] labels={"Live IPTV","YouTube","YouTube Browse","Netflix","Prime Video","Twitch",
      "SoundCloud","Vimeo","Google Drive","Video link","Your files"};
    int[] logos={R.drawable.xp_brand_tv,R.drawable.xp_brand_youtube,
      R.drawable.xp_brand_youtube_browse,R.drawable.xp_brand_netflix,R.drawable.xp_brand_prime,
      R.drawable.xp_brand_twitch,R.drawable.xp_brand_soundcloud,R.drawable.xp_brand_vimeo,
      R.drawable.xp_brand_drive,R.drawable.xp_brand_link,R.drawable.xp_brand_files};
    LinearLayout row=null;
    final int columns=4; // Fixed source icons; not video-result grid.
    for(int i=0;i<labels.length;i++){
      final int index=i;
      if(i%columns==0){row=new LinearLayout(activity);row.setOrientation(LinearLayout.HORIZONTAL);add(body,row,dp(10));}
      LinearLayout tile=new LinearLayout(activity);tile.setOrientation(LinearLayout.VERTICAL);
      tile.setGravity(Gravity.CENTER);tile.setPadding(dp(1),dp(14),dp(1),dp(11));
      ImageView icon=new ImageView(activity);
      icon.setImageResource(logos[i]);
      icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
      icon.setContentDescription(labels[i]+" source logo");
      icon.setPadding(dp(8),dp(9),dp(8),dp(10));
      tile.addView(icon,new LinearLayout.LayoutParams(-1,dp(67)));
      TextView txt=label(labels[i],12,WHITE,true);txt.setGravity(Gravity.CENTER);txt.setMaxLines(2);
      tile.addView(txt,new LinearLayout.LayoutParams(-1,dp(42)));
      tile.setBackground(rounded(0xFF191527,13));tile.setOnClickListener(v->selectService(index));
      LinearLayout.LayoutParams tileLp=new LinearLayout.LayoutParams(0,dp(columns>=4?118:134),1);
      if(i%columns!=0)tileLp.leftMargin=dp(6);row.addView(tile,tileLp);
    }
  }
  private void selectService(int index){
    switch(index){
      case 0:showIPTV(false);return;
      case 1:showYoutube(false);return;
      case 2:showYouTubeBrowse();return;
      case 3:openOfficialProvider("Netflix","https://www.netflix.com/browse");return;
      case 4:openOfficialProvider("Prime Video","https://www.primevideo.com");return;
      case 9:dismiss();actions.enterLink("direct");return;
      case 10:dismiss();actions.pickLocal();return;
      default:
        // Do not claim native third-party DRM integrations work without provider authorization.
        actions.notice("This source requires a supported provider integration. Use Live IPTV, YouTube or Video link.");
    }
  }
  private void openOfficialProvider(String name,String url){
    new android.app.AlertDialog.Builder(activity)
      .setTitle(name+" · official app")
      .setMessage("This opens "+name+" through its official app or website. Each viewer must have their own eligible account or subscription. XParty cannot currently synchronize the provider's protected playback without an authorized integration.")
      .setNegativeButton("Cancel",null)
      .setPositiveButton("Open official provider",(d,which)->{
        try{
          android.content.Intent launch=new android.content.Intent(android.content.Intent.ACTION_VIEW,
            android.net.Uri.parse(url));
          activity.startActivity(launch);
        }catch(Exception error){actions.notice("No app can open "+name+" on this device.");}
      }).show();
  }
  private void showQuick(){
    clear();currentTab="quick";
    EditText search=input("Search Live IPTV or YouTube");add(body,search,15);
    add(body,label("SEARCH",12,PURPLE,true),9);
    TextView tv=chip("Search live channels",false,()->{
      typedSearch=search.getText().toString().trim();showIPTV(false);
    });add(body,tv,9);
    TextView yt=chip("Search YouTube videos",false,()->{
      youtubeQuery=search.getText().toString().trim();showYoutube(false);
    });add(body,yt,13);
    add(body,label("Your current source remains selected until you choose a different video.",12,MUTED,false),9);
  }
  private void showSaved(){
    clear();currentTab="saved";
    add(body,label("Saved channels and videos",17,WHITE,true),15);
    JSONArray items=saved();
    if(items.length()==0){add(body,label("Tap ♡ on a channel or YouTube result to save it here.",13,MUTED,false),14);return;}
    for(int i=0;i<items.length();i++){
      final JSONObject item=items.optJSONObject(i);if(item==null)continue;
      LinearLayout row=new LinearLayout(activity);row.setGravity(Gravity.CENTER_VERTICAL);
      TextView title=label(item.optString("title",item.optString("type","Video")),13,WHITE,true);
      title.setPadding(dp(10),dp(12),dp(9),dp(12));title.setMaxLines(2);
      row.addView(title,new LinearLayout.LayoutParams(0,-2,1));title.setOnClickListener(v->choose(item));
      TextView remove=chip("♥",true,()->toggleFavorite(item));row.addView(remove,new LinearLayout.LayoutParams(dp(53),dp(43)));
      add(body,row,8);
    }
  }
  private void changeIptvCategory(int delta){
    String[] cats={"All","Saved","Movies","Entertainment","News","Sports","Kids","Music","Radio"};
    int at=0;
    for(int i=0;i<cats.length;i++)if(cats[i].equals(category)){at=i;break;}
    category=cats[(at+delta+cats.length)%cats.length];
    prefs.edit().putString("last_iptv_category",category).apply();
    shownChannels=28;typedSearch="";showIPTV(false);
  }
  private void showIPTV(boolean keepSearch){
    currentTab="iptv";clear();
    // A dedicated swipe strip changes categories. Browsing and text-entry touches
    // remain untouched, so horizontal search/web scrolling cannot conflict.
    TextView swipe=label("‹  Swipe here to change Live TV category  ›",12,WHITE,false);
    swipe.setGravity(Gravity.CENTER);swipe.setBackground(rounded(0x503D3354,11));
    swipe.setOnTouchListener(new View.OnTouchListener(){
      float downX,downY;
      @Override public boolean onTouch(View v,MotionEvent e){
        if(e.getActionMasked()==MotionEvent.ACTION_DOWN){downX=e.getX();downY=e.getY();return true;}
        if(e.getActionMasked()==MotionEvent.ACTION_UP){
          float dx=e.getX()-downX,dy=e.getY()-downY;
          if(Math.abs(dx)>dp(58)&&Math.abs(dx)>Math.abs(dy)*1.5f)
            changeIptvCategory(dx<0?1:-1);
          else showIPTV(true);
          return true;
        }
        return true;
      }
    });
    add(body,swipe,7);
    HorizontalScrollView carousel=new HorizontalScrollView(activity);
    carousel.setHorizontalScrollBarEnabled(false);
    LinearLayout chips=new LinearLayout(activity);
    chips.setOrientation(LinearLayout.HORIZONTAL);
    String[] cats={"All","Saved","Movies","Entertainment","News","Sports","Kids","Music","Radio"};
    for(String cat:cats){
      TextView item=chip(cat,cat.equals(category),()->{
        category=cat;prefs.edit().putString("last_iptv_category",cat).apply();
        shownChannels=28;showIPTV(true);
      });
      LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,dp(43));lp.rightMargin=dp(7);
      chips.addView(item,lp);
    }
    carousel.addView(chips);add(body,carousel,14);
    channelSearch=input("Channel name or category");
    channelSearch.setText(typedSearch);
    add(body,channelSearch,11);
    add(body,label("Channel selected? Connecting? Tap another channel to retry.",11,MUTED,false),11);
    add(body,label("● Responding     ● Unverified / restricted     ● Unavailable",10,0xFFBFB6CD,false),14);
    providerView=new LinearLayout(activity);providerView.setOrientation(LinearLayout.VERTICAL);
    add(body,providerView,7);
    channelSearch.addTextChangedListener(new TextWatcher(){
      @Override public void beforeTextChanged(CharSequence s,int start,int count,int after){}
      @Override public void onTextChanged(CharSequence s,int start,int before,int count){
        typedSearch=s.toString();shownChannels=28;renderIPTV();
      }
      @Override public void afterTextChanged(Editable s){}
    });
    if("Saved".equals(category)){renderIPTV();return;}
    if(!channels.isEmpty()&&keepSearch&&loadedCategory.equals(category)){renderIPTV();return;}
    channels.clear();loadedCategory=category;
    int request=++categoryRequest;
    TextView loading=label("Loading live channels…",14,MUTED,false);add(providerView,loading,12);
    String target="All".equals(category)?"in":category.toLowerCase(Locale.ROOT);
    directory.load(target,(list,error)->{
      if(!showing()||request!=categoryRequest||!"iptv".equals(currentTab))return;
      channels.clear();channels.addAll(list);
      if(error!=null)actions.notice(error);
      renderIPTV();
    });
  }
  private void renderIPTV(){
    if(providerView==null||!"iptv".equals(currentTab))return;
    providerView.removeAllViews();
    List<JSONObject> rows=new ArrayList<>();
    if("Saved".equals(category)){
      JSONArray all=saved();
      for(int i=0;i<all.length();i++){
        JSONObject src=all.optJSONObject(i);
        if(src!=null&&"iptv".equals(src.optString("type")))rows.add(src);
      }
    }else{
      for(ChannelCatalog.Channel item:channels){
        if(!item.title.toLowerCase(Locale.ROOT).contains(typedSearch.toLowerCase(Locale.ROOT)))continue;
        try{rows.add(new JSONObject().put("type","iptv").put("url",item.url)
          .put("title",item.title).put("logo",item.logo));}catch(Exception ignored){}
      }
    }
    add(providerView,label(rows.size()+" channels · "+category,11,MUTED,false),8);
    int count=Math.min(shownChannels,rows.size());
    for(int i=0;i<count;i++){
      final JSONObject src=rows.get(i);
      LinearLayout line=new LinearLayout(activity);line.setGravity(Gravity.CENTER_VERTICAL);
      line.setPadding(dp(7),dp(4),dp(7),dp(4));
      // IPTV remains a compact list; never inherit YouTube video grid settings.
      line.setBackground(rounded(0x53251E32,12));
      FrameLayout artSlot=new FrameLayout(activity);
      artSlot.setBackground(rounded(0xFF868B97,11)); // white AND black logos remain legible
      ImageView art=new ImageView(activity);art.setScaleType(ImageView.ScaleType.FIT_CENTER);
      art.setPadding(dp(4),dp(4),dp(4),dp(4));
      artSlot.addView(art,new FrameLayout.LayoutParams(-1,-1));
      line.addView(artSlot,new LinearLayout.LayoutParams(dp(54),dp(54)));
      artwork.show(src.optString("logo",""),art);
      TextView name=label(src.optString("title","Channel"),13,WHITE,true);
      name.setMaxLines(2);name.setEllipsize(android.text.TextUtils.TruncateAt.END);
      name.setPadding(dp(11),0,dp(4),0);
      line.addView(name,new LinearLayout.LayoutParams(0,dp(57),1));
      TextView fav=label(favorite(src.optString("url"))?"♥":"♡",21,WHITE,false);
      fav.setGravity(Gravity.CENTER);
      fav.setOnClickListener(v->{toggleFavorite(src);renderIPTV();});
      line.addView(fav,new LinearLayout.LayoutParams(dp(41),dp(50)));
      line.setOnClickListener(v->choose(src));
      add(providerView,line,7);
    }
    if(rows.size()>count)add(providerView,
      chip("Show more channels ("+(rows.size()-count)+")",false,()->{
        shownChannels+=28;renderIPTV();
      }),9);
    if(rows.isEmpty())add(providerView,
      label("No matching channels. Choose another category or search.",13,MUTED,false),10);
  }

  private void showYoutube(boolean browse){
    clear();currentTab="youtube";
    LinearLayout searchRow=new LinearLayout(activity);searchRow.setGravity(Gravity.CENTER_VERTICAL);
    youtubeSearch=input("Search YouTube videos");
    youtubeSearch.setText(youtubeQuery);
    searchRow.addView(youtubeSearch,new LinearLayout.LayoutParams(0,dp(52),1));
    TextView browseButton=chip("▶",false,this::showYouTubeBrowse);
    browseButton.setContentDescription("Browse YouTube");
    LinearLayout.LayoutParams browseLp=new LinearLayout.LayoutParams(dp(52),dp(48));
    browseLp.leftMargin=dp(8);searchRow.addView(browseButton,browseLp);
    add(body,searchRow,12);
    providerView=new LinearLayout(activity);providerView.setOrientation(LinearLayout.VERTICAL);
    add(body,providerView,10);
    youtubeSearch.addTextChangedListener(new TextWatcher(){
      @Override public void beforeTextChanged(CharSequence s,int start,int count,int after){}
      @Override public void onTextChanged(CharSequence s,int start,int before,int count){
        youtubeQuery=s.toString();
        if(youtubeDebounce!=null)ui.removeCallbacks(youtubeDebounce);
        youtubeDebounce=()->loadYoutube(youtubeQuery);
        ui.postDelayed(youtubeDebounce,450);
      }
      @Override public void afterTextChanged(Editable e){}
    });
    if(youtubeQuery.trim().isEmpty()){
      add(providerView,label("Search videos or open YouTube Browse. Your last YouTube search is remembered.",13,MUTED,false),14);
    }else loadYoutube(youtubeQuery);
  }
  private void loadYoutube(String query){
    nextYouTubePage="";shownYouTube=20;
    fetchYouTubePage(query,"",false);
  }
  private void fetchYouTubePage(String query,String pageToken,boolean append){
    int generation=++youtubeRequest;
    if(providerView==null||!"youtube".equals(currentTab))return;
    if(!append)providerView.removeAllViews();
    if(query.trim().length()<2){
      add(providerView,label("Enter at least two characters.",12,MUTED,false),12);return;
    }
    if(roomToken.isEmpty()){
      providerView.removeAllViews();
      add(providerView,label("Reconnect your room to search videos.",13,MUTED,false),12);return;
    }
    if(!append)add(providerView,label("Searching YouTube…",13,MUTED,false),12);
    String endpoint=backend+"/api/search?q="+urlEncode(query);
    if(pageToken!=null&&!pageToken.isEmpty())endpoint+="&pageToken="+urlEncode(pageToken);
    Request req=new Request.Builder().url(endpoint)
      .header("Authorization","Bearer "+roomToken).build();
    http.newCall(req).enqueue(new Callback(){
      @Override public void onFailure(Call call,IOException error){ui.post(()->{
        if(generation!=youtubeRequest||!showing()||!"youtube".equals(currentTab))return;
        if(!append)providerView.removeAllViews();
        add(providerView,label("YouTube search unavailable. Try again or use Browse.",13,MUTED,false),12);
      });}
      @Override public void onResponse(Call call,Response response)throws IOException{
        String result;
        try(Response used=response){result=used.body()==null?"{}":used.body().string();}
        try{
          JSONObject data=new JSONObject(result);
          if(!response.isSuccessful())throw new IOException(data.optString("error","YouTube unavailable"));
          JSONArray results=data.optJSONArray("items");
          List<JSONObject> parsed=new ArrayList<>();
          if(results!=null)for(int i=0;i<results.length()&&i<50;i++){
            JSONObject video=results.optJSONObject(i);
            if(video!=null)parsed.add(video);
          }
          String next=data.optString("nextPageToken","");
          ui.post(()->{
            if(generation!=youtubeRequest||!showing()||!"youtube".equals(currentTab))return;
            if(!append){ytItems.clear();shownYouTube=20;}
            for(JSONObject video:parsed){
              boolean seen=false;String id=video.optString("id");
              for(JSONObject prior:ytItems)if(id.equals(prior.optString("id"))){seen=true;break;}
              if(!seen&&ytItems.size()<250)ytItems.add(video);
            }
            nextYouTubePage=next;
            if(append)shownYouTube=Math.min(ytItems.size(),shownYouTube+20);
            renderYoutubeResults();
          });
        }catch(Exception error){onFailure(call,new IOException("YouTube search error"));}
      }
    });
  }
  private void renderYoutubeResults(){
    if(providerView==null)return;
    providerView.removeAllViews();
    if(ytItems.isEmpty()){
      add(providerView,label("No matching videos. Try another YouTube search.",13,MUTED,false),10);return;
    }
    add(providerView,label("VIDEOS · "+ytItems.size()+" results",11,MUTED,true),10);
    final int cols=tileColumns();
    final int available=Math.max(dp(220),
      activity.getResources().getDisplayMetrics().widthPixels-dp(54));
    final int itemWidth=Math.max(dp(78),(available-dp(8)*(cols-1))/cols);
    final int imageHeight=Math.max(dp(52),Math.round(itemWidth*9f/16f));
    LinearLayout row=null;
    int total=Math.min(shownYouTube,ytItems.size());
    for(int i=0;i<total;i++){
      final JSONObject item=ytItems.get(i);
      String id=item.optString("id","");
      if(!id.matches("[\\w-]{11}"))continue;
      if(i%cols==0){row=new LinearLayout(activity);add(providerView,row,9);}
      LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);
      // Transparent by design: results appear over ambient backdrop, never black tiles.
      card.setPadding(dp(2),dp(2),dp(2),dp(5));
      ImageView thumb=new ImageView(activity);thumb.setScaleType(ImageView.ScaleType.CENTER_CROP);
      thumb.setBackground(rounded(0xFF30283E,9));
      card.addView(thumb,new LinearLayout.LayoutParams(-1,imageHeight));
      artwork.show(item.optString("thumbnail","https://i.ytimg.com/vi/"+id+"/mqdefault.jpg"),thumb);
      TextView name=label(item.optString("title","YouTube video"),12,WHITE,true);
      name.setMaxLines(2);name.setEllipsize(android.text.TextUtils.TruncateAt.END);
      name.setPadding(dp(2),dp(6),dp(2),0);
      card.addView(name,new LinearLayout.LayoutParams(-1,dp(42)));
      TextView info=label(item.optString("channel","YouTube"),10,MUTED,false);
      info.setMaxLines(1);info.setEllipsize(android.text.TextUtils.TruncateAt.END);
      card.addView(info,new LinearLayout.LayoutParams(-1,dp(19)));
      JSONObject src=new JSONObject();
      try{src.put("type","youtube").put("videoId",id)
        .put("title",item.optString("title","YouTube video"));}catch(Exception ignored){}
      TextView heart=label(favorite(id)?"♥":"♡",16,WHITE,false);
      heart.setGravity(Gravity.RIGHT);
      heart.setOnClickListener(v->{toggleFavorite(src);heart.setText(favorite(id)?"♥":"♡");});
      card.addView(heart,new LinearLayout.LayoutParams(-1,dp(25)));
      card.setOnClickListener(v->choose(src));
      LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);
      if(i%cols!=0)lp.leftMargin=dp(8);row.addView(card,lp);
    }
    if(ytItems.size()>shownYouTube){
      add(providerView,chip("Show more videos",false,()->{
        shownYouTube+=20;renderYoutubeResults();
      }),10);
    }else if(!nextYouTubePage.isEmpty()&&ytItems.size()<250){
      String page=nextYouTubePage;
      add(providerView,chip("Load next YouTube results",false,()->
        fetchYouTubePage(youtubeQuery,page,true)),10);
    }
  }
  private static String urlEncode(String text){
    try{return URLEncoder.encode(text,"UTF-8");}catch(Exception e){return "";}
  }
  private String videoId(String url){
    if(url==null)return null;
    Matcher match=Pattern.compile("(?:youtu\\.be/|[?&]v=|/shorts/|/embed/)([A-Za-z0-9_-]{11})").matcher(url);
    return match.find()?match.group(1):null;
  }
  private boolean playFromYoutubeUrl(String url){
    String id=videoId(url);
    if(id==null)return false;
    try{
      JSONObject source=new JSONObject().put("type","youtube")
        .put("videoId",id).put("title","YouTube video");
      choose(source);
      return true;
    }catch(Exception ignored){return false;}
  }
  private void showYouTubeBrowse(){
    // Genuine YouTube browsing stays on the provider page; watch links are passed
    // to XParty's existing room signaling, with no video extraction or ad bypass.
    if(dialog==null)return;
    clear();currentTab="youtube-browse";
    TextView route=chip("‹  Live TV     Swipe from the left edge →",false,()->showIPTV(false));
    add(body,route,8);
    TextView hint=label("Choose a public video. XParty will play the selected link for your room.",12,MUTED,false);
    add(body,hint,7);
    TextView search=chip("Search inside XParty instead",false,()->showYoutube(false));
    add(body,search,7);
    WebView web=new WebView(activity);
    browseWeb=web;
    web.setBackgroundColor(Color.BLACK);
    web.setVerticalScrollBarEnabled(true);
    web.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
    // Nested WebView scroll gestures must be handled by YouTube,
    // not intercepted by the containing bottom-sheet ScrollView.
    web.setOnTouchListener((view,event)->{
      android.view.ViewParent parent=view.getParent();
      if(parent!=null){
        if(event.getActionMasked()==android.view.MotionEvent.ACTION_DOWN||
           event.getActionMasked()==android.view.MotionEvent.ACTION_MOVE)
          parent.requestDisallowInterceptTouchEvent(true);
        if(event.getActionMasked()==android.view.MotionEvent.ACTION_UP||
           event.getActionMasked()==android.view.MotionEvent.ACTION_CANCEL)
          parent.requestDisallowInterceptTouchEvent(false);
      }
      return false;
    });
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setSupportMultipleWindows(true);
    web.getSettings().setMediaPlaybackRequiresUserGesture(true);
    web.setWebChromeClient(new android.webkit.WebChromeClient(){
      @Override public boolean onCreateWindow(WebView view,boolean dialog,boolean userGesture,
          android.os.Message result){
        WebView popup=new WebView(activity);
        popupBrowsers.add(popup);
        popup.setWebViewClient(new WebViewClient(){
          @Override public boolean shouldOverrideUrlLoading(WebView child,WebResourceRequest request){
            String url=request.getUrl().toString();
            if(playFromYoutubeUrl(url))return true;
            return true; // Never launch an external browser from the source sheet.
          }
        });
        ((WebView.WebViewTransport)result.obj).setWebView(popup);
        result.sendToTarget();
        return true;
      }
    });
    web.setWebViewClient(new WebViewClient(){
      private boolean select(String url){return playFromYoutubeUrl(url);}
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
        String url=req.getUrl().toString();
        if(select(url))return true;
        String host=req.getUrl().getHost();
        return host==null||!(host.equals("youtube.com")||host.endsWith(".youtube.com")||host.equals("youtu.be"));
      }
      @Override public void doUpdateVisitedHistory(WebView view,String url,boolean reload){
        super.doUpdateVisitedHistory(view,url,reload);
        if(showing()&&"youtube-browse".equals(currentTab))select(url);
      }
    });
    FrameLayout browser=new FrameLayout(activity);
    int height=Math.round(activity.getResources().getDisplayMetrics().heightPixels*.57f);
    LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,Math.max(dp(330),height));
    browser.addView(web,new FrameLayout.LayoutParams(-1,-1));
    // Only an 18dp edge strip owns the source-switch gesture; the YouTube
    // WebView retains its own page scrolling, tapping and built-in gestures.
    View swipeEdge=new View(activity);
    swipeEdge.setBackgroundColor(0x124E5078);
    swipeEdge.setOnTouchListener(new View.OnTouchListener(){
      float startX,startY;
      @Override public boolean onTouch(View view,MotionEvent event){
        if(event.getActionMasked()==MotionEvent.ACTION_DOWN){
          startX=event.getX();startY=event.getY();return true;
        }
        if(event.getActionMasked()==MotionEvent.ACTION_UP){
          if(event.getX()-startX>dp(50)&&Math.abs(event.getY()-startY)<dp(85))
            showIPTV(false);
          return true;
        }
        return true;
      }
    });
    browser.addView(swipeEdge,new FrameLayout.LayoutParams(dp(24),-1,Gravity.LEFT));
    body.addView(browser,lp);
    web.loadUrl("https://m.youtube.com/");
  }
}
