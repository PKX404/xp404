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
  private LinearLayout body,providerView,sheetRoot;
  private ScrollView sheetScroll;
  private TextView modeTitle;
  private boolean specialSearch=false;
  private float touchX,touchY;
  private static final String[] CATEGORIES={"All","Saved","Movies","Entertainment","News","Sports","Kids","Music","Radio"};
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
  private void mode(String name){if(modeTitle!=null)modeTitle.setText(name);}
  private void toggleSource(){
    if("iptv".equals(currentTab))showYouTubeBrowse();
    else if("youtube".equals(currentTab)||"youtube-browse".equals(currentTab))showIPTV(true);
  }
  private boolean horizontalSwitch(MotionEvent e){
    if(e.getActionMasked()==MotionEvent.ACTION_DOWN){touchX=e.getX();touchY=e.getY();return false;}
    if(e.getActionMasked()!=MotionEvent.ACTION_UP)return false;
    float dx=e.getX()-touchX,dy=e.getY()-touchY;
    if(Math.abs(dx)>dp(105)&&Math.abs(dx)>1.6f*Math.abs(dy)
       &&("iptv".equals(currentTab)||"youtube-browse".equals(currentTab))){
      toggleSource();return true;
    }
    return false;
  }
  private void swipeCategory(int direction){
    int i=java.util.Arrays.asList(CATEGORIES).indexOf(category);
    int j=Math.max(0,Math.min(CATEGORIES.length-1,i+direction));
    if(j==i)return;
    category=CATEGORIES[j];
    prefs.edit().putString("last_iptv_category",category).apply();
    shownChannels=28;showIPTV(true);
  }
  private int tileColumns(){
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
        else if("iptv".equals(currentTab))renderIPTV();
        else if("all".equals(currentTab))showProviders();
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
  void open(String playing,String token,String name){
    roomToken=token==null?"":token;
    // Only the '+' menu's special search receives the minimal browser shell.
    specialSearch="special".equals(playing);
    modeTitle=null;
    String recent=prefs.getString("last_source","");
    String initial=playing==null||playing.isEmpty()?recent:playing;
    dialog=new Dialog(activity);
    dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
    sheetRoot=new LinearLayout(activity);sheetRoot.setOrientation(LinearLayout.VERTICAL);
    LinearLayout root=sheetRoot;
    root.setBackground(NativeImmersiveBackdrop.sheetSkin());
    root.setPadding(dp(specialSearch?5:9),dp(5),dp(specialSearch?5:9),dp(6));
    TextView handle=label("━",12,0xFF6E677F,true);
    handle.setGravity(Gravity.CENTER);
    root.addView(handle,new LinearLayout.LayoutParams(-1,dp(10)));
    LinearLayout tabs=new LinearLayout(activity);tabs.setGravity(Gravity.CENTER_VERTICAL);
    if(specialSearch){
      // Minimal overlay: no All/Saved tabs, headings or back-to-room row.
      modeTitle=label("YouTube  ⇄  XPTV",13,WHITE,true);
      modeTitle.setGravity(Gravity.CENTER_VERTICAL);
      modeTitle.setPadding(dp(8),0,0,0);
      modeTitle.setOnClickListener(v->toggleSource());
      tabs.addView(modeTitle,new LinearLayout.LayoutParams(0,dp(36),1));
    }else{
      TextView quick=chip("Quick Search",false,this::showQuick);
      TextView all=chip("All sources",false,this::showProviders);
      TextView savedChip=chip("Saved",false,this::showSaved);
      for(TextView c:new TextView[]{quick,all,savedChip}){
        c.setSingleLine(true);c.setTextSize(11);c.setPadding(dp(4),0,dp(4),0);
      }
      tabs.addView(quick,new LinearLayout.LayoutParams(0,dp(42),1));
      LinearLayout.LayoutParams allLp=new LinearLayout.LayoutParams(0,dp(42),1);
      allLp.leftMargin=dp(4);tabs.addView(all,allLp);
      LinearLayout.LayoutParams savedLp=new LinearLayout.LayoutParams(0,dp(42),1);
      savedLp.leftMargin=dp(4);tabs.addView(savedChip,savedLp);
      TextView tiling=chip("▦",false,this::selectTileLayout);
      tiling.setContentDescription("Change source tile layout");
      LinearLayout.LayoutParams tileLp=new LinearLayout.LayoutParams(dp(34),dp(42));
      tileLp.leftMargin=dp(3);tabs.addView(tiling,tileLp);
    }
    XPControl close=new XPControl(activity,"exit");
    close.setContentDescription("Close source browser");
    close.setOnClickListener(v->dismiss());
    tabs.addView(close,new LinearLayout.LayoutParams(dp(39),dp(40)));
    add(root,tabs,2);
    sheetScroll=new ScrollView(activity);sheetScroll.setFillViewport(true);
    sheetScroll.setVerticalScrollBarEnabled(false);
    sheetScroll.setOnTouchListener((v,e)->horizontalSwitch(e));
    body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);
    body.setPadding(dp(2),dp(4),dp(2),dp(3));
    sheetScroll.addView(body);
    root.addView(sheetScroll,new LinearLayout.LayoutParams(-1,0,1));
    dialog.setContentView(root);
    Window w=dialog.getWindow();
    if(w!=null){
      w.setBackgroundDrawableResource(android.R.color.transparent);
      w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
      w.setDimAmount(specialSearch?.20f:.33f);
      w.setGravity(Gravity.BOTTOM);
    }
    dialog.show();
    if(w!=null){
      w.setLayout(WindowManager.LayoutParams.MATCH_PARENT,
         Math.round(activity.getResources().getDisplayMetrics().heightPixels*(specialSearch?.74f:.81f)));
    }
    if(specialSearch)showYouTubeBrowse();
    else if("iptv".equals(initial))showIPTV(false);
    else if("quick".equals(initial))showQuick();
    else if("youtube".equals(initial))showYoutube(false);
    else if("youtube-browse".equals(initial))showYouTubeBrowse();
    else if(!ProviderLink.name(initial).isEmpty())showService(initial);
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
    if(sheetRoot!=null&&browseWeb!=null){
      sheetRoot.removeView(browseWeb);
      if(sheetScroll!=null&&sheetScroll.getParent()==null)
        sheetRoot.addView(sheetScroll,new LinearLayout.LayoutParams(-1,0,1));
    }
    if(body!=null){body.removeAllViews();channelSearch=null;youtubeSearch=null;}
    providerView=null;
    clearBrowser();
  }
  private void showProviders(){
    currentTab="all";clear();mode("All sources");
    String[] labels={"XPTV","YouTube","YouTube Browse","Netflix","Prime Video","Twitch",
      "SoundCloud","Vimeo","Google Drive","Video link","Your files"};
    int[] logos={R.drawable.xp_brand_tv,R.drawable.xp_brand_youtube,
      R.drawable.xp_brand_youtube_browse,R.drawable.xp_brand_netflix,R.drawable.xp_brand_prime,
      R.drawable.xp_brand_twitch,R.drawable.xp_brand_soundcloud,R.drawable.xp_brand_vimeo,
      R.drawable.xp_brand_drive,R.drawable.xp_brand_link,R.drawable.xp_brand_files};
    LinearLayout row=null;
    final int columns=tileColumns();
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
      case 3:showService("netflix");return;
      case 4:showService("prime");return;
      case 5:showService("twitch");return;
      case 7:showService("vimeo");return;
      case 9:dismiss();actions.enterLink("direct");return;
      case 10:dismiss();actions.pickLocal();return;
      default:
        // Do not claim native third-party DRM integrations work without provider authorization.
        actions.notice("This source requires a supported provider integration. Use XPTV, YouTube or Video link.");
    }
  }
  private void showService(String type){
    clear();currentTab=type;mode(ProviderLink.name(type));
    EditText link=input("Paste a title, channel or video link");
    add(body,link,6);
    add(body,chip("Watch in room",true,()->{
      JSONObject item=ProviderLink.parse(type,link.getText().toString(),null);
      if(item==null){link.setError("Use a full "+ProviderLink.name(type)+" title or video URL");return;}
      choose(item);
    }),6);
    WebView web=new WebView(activity);browseWeb=web;
    web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
        return !"https".equals(request.getUrl().getScheme());
      }
    });
    add(body,chip("Use current page",false,()->{
      JSONObject item=ProviderLink.parse(type,web.getUrl(),web.getTitle());
      if(item!=null)choose(item);
      else actions.notice("Open a movie, episode, video or channel first.");
    }),5);
    web.setOnTouchListener((v,e)->{v.getParent().requestDisallowInterceptTouchEvent(e.getActionMasked()!=MotionEvent.ACTION_UP&&e.getActionMasked()!=MotionEvent.ACTION_CANCEL);return false;});
    body.addView(web,new LinearLayout.LayoutParams(-1,dp(420)));
    web.loadUrl(ProviderLink.home(type));
  }
  private void showQuick(){
    clear();currentTab="quick";mode("Quick search");
    EditText search=input("Search YouTube videos or live channels");
    add(body,search,8);
    TextView tv=chip("XPTV",false,()->{
      typedSearch=search.getText().toString().trim();showIPTV(false);
    });
    TextView yt=chip("YouTube videos",false,()->{
      youtubeQuery=search.getText().toString().trim();showYoutube(false);
    });
    LinearLayout options=new LinearLayout(activity);
    LinearLayout.LayoutParams left=new LinearLayout.LayoutParams(0,dp(43),1);
    LinearLayout.LayoutParams right=new LinearLayout.LayoutParams(0,dp(43),1);
    right.leftMargin=dp(7);
    options.addView(tv,left);options.addView(yt,right);
    add(body,options,6);
  }
  private void showSaved(){
    clear();currentTab="saved";mode("Saved sources");
    JSONArray items=saved();
    if(items.length()==0){add(body,label("No saved videos or channels yet",13,MUTED,false),8);return;}
    for(int i=0;i<items.length();i++){
      final JSONObject item=items.optJSONObject(i);if(item==null)continue;
      LinearLayout row=new LinearLayout(activity);row.setGravity(Gravity.CENTER_VERTICAL);
      TextView title=label(item.optString("title",item.optString("type","Video")),13,WHITE,true);
      title.setPadding(dp(10),dp(12),dp(9),dp(12));title.setMaxLines(2);
      row.addView(title,new LinearLayout.LayoutParams(0,-2,1));title.setOnClickListener(v->choose(item));
      TextView remove=chip("♥",true,()->toggleFavorite(item));remove.setTextColor(0xFFFF3B51);
      row.addView(remove,new LinearLayout.LayoutParams(dp(53),dp(43)));
      add(body,row,8);
    }
  }
  private void showIPTV(boolean keepSearch){
    currentTab="iptv";clear();mode("XPTV  ⇄  YouTube");
    HorizontalScrollView carousel=new HorizontalScrollView(activity);
    carousel.setHorizontalScrollBarEnabled(false);
    LinearLayout chips=new LinearLayout(activity);
    chips.setOrientation(LinearLayout.HORIZONTAL);
    for(String cat:CATEGORIES){
      TextView item=chip(cat,cat.equals(category),()->{
        category=cat;prefs.edit().putString("last_iptv_category",cat).apply();
        shownChannels=28;showIPTV(true);
      });
      LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,dp(43));lp.rightMargin=dp(7);
      chips.addView(item,lp);
    }
    carousel.addView(chips);
    final float[] categoryStart={0,0};
    carousel.setOnTouchListener((view,e)->{
      if(e.getActionMasked()==MotionEvent.ACTION_DOWN){
        categoryStart[0]=e.getX();categoryStart[1]=e.getY();
      }else if(e.getActionMasked()==MotionEvent.ACTION_UP){
        float dx=e.getX()-categoryStart[0],dy=e.getY()-categoryStart[1];
        if(Math.abs(dx)>dp(75)&&Math.abs(dx)>Math.abs(dy)*1.4f){
          swipeCategory(dx<0?1:-1);return true;
        }
      }
      return false;
    });
    add(body,carousel,6);
    channelSearch=input("Channel name or category");
    channelSearch.setText(typedSearch);
    add(body,channelSearch,7);
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
    TextView loading=label("Loading XPTV channels…",14,MUTED,false);add(providerView,loading,12);
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
      for(ChannelCatalog.Channel c:channels){
        if(!c.title.toLowerCase(Locale.ROOT).contains(typedSearch.toLowerCase(Locale.ROOT)))continue;
        try{rows.add(new JSONObject().put("type","iptv").put("url",c.url)
          .put("title",c.title).put("logo",c.logo));}catch(Exception ignored){}
      }
    }
    // Known unavailable sources are listed after channels without a recent failure.
    rows.sort((left,right)->Integer.compare(
      directory.failedStatus(left.optString("url"))==0?0:1,
      directory.failedStatus(right.optString("url"))==0?0:1));
    add(providerView,label(rows.size()+" XPTV channels",11,MUTED,false),9);
    LinearLayout pair=null;
    int count=Math.min(shownChannels,rows.size());
    for(int i=0;i<count;i++){
      final JSONObject src=rows.get(i);
      if(i%2==0){pair=new LinearLayout(activity);pair.setOrientation(LinearLayout.HORIZONTAL);add(providerView,pair,9);}
      LinearLayout card=new LinearLayout(activity);card.setGravity(Gravity.CENTER_VERTICAL);
      card.setPadding(dp(7),dp(7),dp(5),dp(7));card.setBackground(rounded(0xFF251E32,18));
      ImageView art=new ImageView(activity);art.setBackground(rounded(Color.WHITE,12));
      art.setScaleType(ImageView.ScaleType.FIT_CENTER);
      card.addView(art,new LinearLayout.LayoutParams(dp(53),dp(57)));
      artwork.show(src.optString("logo",""),art);
      // Artwork loader hides absent images; retain a small initials fallback.
      String issue=directory.failureText(src.optString("url"));
      TextView title=label(src.optString("title","Channel")
        +(issue.isEmpty()?"":"\n"+issue),12,issue.isEmpty()?WHITE:0xFFFFB5B9,true);
      title.setMaxLines(3);title.setEllipsize(android.text.TextUtils.TruncateAt.END);
      title.setPadding(dp(7),0,dp(2),0);
      card.addView(title,new LinearLayout.LayoutParams(0,-2,1));
      String key=src.optString("url");
      TextView save=label(favorite(key)?"♥":"♡",21,favorite(key)?0xFFFF3B51:WHITE,false);
      save.setGravity(Gravity.CENTER);
      save.setOnClickListener(v->{toggleFavorite(src);boolean yes=favorite(key);
        save.setText(yes?"♥":"♡");save.setTextColor(yes?0xFFFF3B51:WHITE);});
      card.addView(save,new LinearLayout.LayoutParams(dp(25),dp(45)));
      // Even a recently failed stream remains tappable for a fresh attempt.
      card.setOnClickListener(v->choose(src));
      LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(100),1);
      if(i%2==1)lp.leftMargin=dp(8);
      pair.addView(card,lp);
    }
    if(rows.size()>count){
      TextView more=chip("Show more channels ("+(rows.size()-count)+")",false,()->{
        shownChannels+=28;renderIPTV();
      });add(providerView,more,10);
    }
    if(rows.isEmpty())add(providerView,label("No matching XPTV channels. Try another category or search.",13,MUTED,false),10);
  }
  private void showYoutube(boolean browse){
    clear();currentTab="youtube";mode("YouTube search  ·  swipe ↔ XPTV");
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
      add(providerView,label("No videos returned. Search another term or paste a YouTube URL.",13,MUTED,false),10);return;
    }
    add(providerView,label("VIDEOS · "+ytItems.size()+" results",11,MUTED,true),10);
    LinearLayout pair=null;
    for(int i=0;i<Math.min(shownYouTube,ytItems.size());i++){
      final JSONObject item=ytItems.get(i);
      String id=item.optString("id","");
      if(!id.matches("[\\w-]{11}"))continue;
      if(i%2==0){pair=new LinearLayout(activity);add(providerView,pair,10);}
      LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);
      card.setBackground(rounded(0xFF211A31,15));
      card.setPadding(dp(6),dp(7),dp(6),dp(8));
      ImageView thumb=new ImageView(activity);thumb.setScaleType(ImageView.ScaleType.CENTER_CROP);
      thumb.setBackgroundColor(0xFF0D0A16);
      card.addView(thumb,new LinearLayout.LayoutParams(-1,dp(94)));
      artwork.show(item.optString("thumbnail","https://i.ytimg.com/vi/"+id+"/mqdefault.jpg"),thumb);
      TextView name=label(item.optString("title","YouTube video"),12,WHITE,true);
      name.setMaxLines(2);name.setPadding(dp(4),dp(6),dp(4),0);
      card.addView(name,new LinearLayout.LayoutParams(-1,dp(44)));
      TextView info=label(item.optString("channel","YouTube")+"  ·  "+item.optString("duration",""),10,MUTED,false);
      info.setMaxLines(1);card.addView(info,new LinearLayout.LayoutParams(-1,dp(20)));
      JSONObject src=new JSONObject();
      try{src.put("type","youtube").put("videoId",id).put("title",item.optString("title","YouTube video"));}catch(Exception ignored){}
      TextView heart=label(favorite(id)?"♥ Save":"♡ Save",12,favorite(id)?0xFFFF3B51:WHITE,false);
      heart.setGravity(Gravity.RIGHT);heart.setPadding(0,dp(4),dp(6),dp(3));
      heart.setOnClickListener(v->{toggleFavorite(src);boolean yes=favorite(id);
        heart.setText(yes?"♥ Save":"♡ Save");heart.setTextColor(yes?0xFFFF3B51:WHITE);});
      card.addView(heart);
      card.setOnClickListener(v->choose(src));
      LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);
      if(i%2==1)lp.leftMargin=dp(8);pair.addView(card,lp);
    }
    if(ytItems.size()>shownYouTube){
      TextView more=chip("Show more videos ("+(ytItems.size()-shownYouTube)+")",false,()->{
        shownYouTube+=20;renderYoutubeResults();
      });
      add(providerView,more,10);
    }
    else if(!nextYouTubePage.isEmpty()&&ytItems.size()<250){
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
    mode("YouTube  ⇄  XPTV");
    WebView web=new WebView(activity);
    browseWeb=web;
    web.setBackgroundColor(Color.BLACK);
    web.setVerticalScrollBarEnabled(true);
    web.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
    // Nested WebView scroll gestures must be handled by YouTube,
    // not intercepted by the containing bottom-sheet ScrollView.
    web.setOnTouchListener((view,event)->{
      android.view.ViewParent parent=view.getParent();
      if(parent!=null)parent.requestDisallowInterceptTouchEvent(
        event.getActionMasked()!=MotionEvent.ACTION_UP&&event.getActionMasked()!=MotionEvent.ACTION_CANCEL);
      return horizontalSwitch(event);
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
    // Full-height browsing, without the old search tabs or large empty wrapper.
    if(sheetRoot!=null&&sheetScroll!=null){
      sheetRoot.removeView(sheetScroll);
      sheetRoot.addView(web,new LinearLayout.LayoutParams(-1,0,1));
    }
    web.loadUrl("https://m.youtube.com/");
  }
}
