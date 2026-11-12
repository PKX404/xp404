package com.pkx404.xpartynative;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.text.DateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Independent XParty profile inspired by public feature categories observed in
 * the reference APK. Never claims to show someone else's private statistics.
 */
final class NativeProfilePage {
  interface Actions { void rename(); void photo(); void watch(JSONObject source); }
  private static final int BG=0xFF101123,CARD=0xFF201B35,INK=0xFFF8F6FF,MUTED=0xFFB8ACC9,ACCENT=0xFFD2BBFF;
  private final Activity activity;
  private final NativeProfileStore store;
  private final Actions actions;

  NativeProfilePage(Activity activity, NativeProfileStore store,Actions actions){
    this.activity=activity;this.store=store;this.actions=actions;
  }
  private int dp(float size){return Math.round(size*activity.getResources().getDisplayMetrics().density);}
  private LinearLayout vertical(){LinearLayout l=new LinearLayout(activity);l.setOrientation(LinearLayout.VERTICAL);return l;}
  private TextView text(String value,int size,int ink,boolean strong){
    TextView t=new TextView(activity);t.setText(value);t.setTextSize(size);t.setTextColor(ink);
    if(strong)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
    t.setIncludeFontPadding(false);return t;
  }
  private GradientDrawable background(int color,int radius){
    GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(dp(radius));
    g.setStroke(dp(1),0xFF39304C);return g;
  }
  private void add(LinearLayout container,View child,int bottom){
    LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);
    if(bottom>0)p.bottomMargin=dp(bottom);container.addView(child,p);
  }
  private TextView action(String label,Runnable run){
    TextView v=text(label,12,ACCENT,true);
    v.setPadding(dp(12),dp(9),dp(12),dp(9));v.setGravity(Gravity.CENTER);
    v.setBackground(background(0xFF302741,12));
    v.setOnClickListener(w->run.run());return v;
  }
  private LinearLayout card(LinearLayout parent){
    LinearLayout result=vertical();result.setPadding(dp(15),dp(13),dp(15),dp(13));
    result.setBackground(background(CARD,18));
    add(parent,result,12);return result;
  }
  private void heading(LinearLayout body,String title,String subtitle){
    add(body,text(title,16,INK,true),5);
    if(subtitle!=null&&!subtitle.isEmpty())add(body,text(subtitle,11,MUTED,false),12);
  }
  private void edit(String title,String value,boolean multi,java.util.function.Consumer<String> save,FrameLayout target,String nickname){
    EditText field=new EditText(activity);field.setText(value);field.setTextColor(INK);
    field.setHintTextColor(MUTED);field.setTextSize(15);
    field.setSingleLine(!multi);
    field.setMaxLines(multi?5:1);
    LinearLayout wrap=vertical();wrap.setPadding(dp(18),0,dp(18),0);wrap.addView(field);
    new AlertDialog.Builder(activity).setTitle(title).setView(wrap)
      .setNegativeButton("Cancel",null)
      .setPositiveButton("Save",(d,w)->{
        save.accept(field.getText().toString());
        show(target,nickname);
      }).show();
  }
  private void sourceList(LinearLayout parent,JSONArray sources,FrameLayout target,String nickname){
    if(sources.length()==0){add(parent,text("Nothing here yet. Select a video or save a favorite to get started.",13,MUTED,false),10);return;}
    int count=Math.min(8,sources.length());
    DateFormat date=android.text.format.DateFormat.getMediumDateFormat(activity);
    for(int i=0;i<count;i++){
      JSONObject item=sources.optJSONObject(i);if(item==null)continue;
      LinearLayout line=new LinearLayout(activity);line.setGravity(Gravity.CENTER_VERTICAL);
      line.setPadding(dp(2),dp(9),dp(1),dp(9));
      TextView glyph=text("▶",18,ACCENT,true);glyph.setGravity(Gravity.CENTER);
      line.addView(glyph,new LinearLayout.LayoutParams(dp(31),dp(36)));
      LinearLayout titles=vertical();titles.setPadding(dp(6),0,dp(5),0);
      String name=item.optString("title",item.optString("type","Video"));
      TextView title=text(name,13,INK,true);title.setMaxLines(2);title.setEllipsize(android.text.TextUtils.TruncateAt.END);
      titles.addView(title);
      String info=item.optString("type","Video").toUpperCase(Locale.ROOT);
      long opened=item.optLong("openedAt",0);
      if(opened>0)info+="  ·  "+date.format(new Date(opened));
      TextView details=text(info,10,MUTED,false);titles.addView(details);
      line.addView(titles,new LinearLayout.LayoutParams(0,-2,1));
      TextView watch=action("Watch",()->actions.watch(item));
      line.addView(watch);
      add(parent,line,0);
      if(i<count-1){
        View divider=new View(activity);divider.setBackgroundColor(0xFF3B314D);
        add(parent,divider,0);
        LinearLayout.LayoutParams div=(LinearLayout.LayoutParams)divider.getLayoutParams();div.height=dp(1);
      }
    }
  }
  void show(FrameLayout root,String nickname){
    if(root==null)return;
    root.removeAllViews();
    ScrollView scroll=new ScrollView(activity);scroll.setFillViewport(true);scroll.setVerticalScrollBarEnabled(false);
    scroll.setBackgroundColor(BG);root.addView(scroll,new FrameLayout.LayoutParams(-1,-1));
    LinearLayout body=vertical();
    body.setPadding(dp(16),dp(17),dp(16),dp(25));scroll.addView(body);
    LinearLayout hero=vertical();
    hero.setPadding(dp(18),dp(20),dp(18),dp(18));
    GradientDrawable gradient=new GradientDrawable(GradientDrawable.Orientation.TL_BR,
      new int[]{0xFF2F244E,0xFF241C3A,0xFF151B33});
    gradient.setCornerRadius(dp(23));hero.setBackground(gradient);
    LinearLayout top=new LinearLayout(activity);top.setGravity(Gravity.CENTER_VERTICAL);
    TextView avatar=text(nickname.isEmpty()?"X":nickname.substring(0,1).toUpperCase(Locale.ROOT),25,INK,true);
    avatar.setGravity(Gravity.CENTER);avatar.setBackground(background(0xFF634E91,22));
    if(store.photo().isEmpty())top.addView(avatar,new LinearLayout.LayoutParams(dp(64),dp(64)));
    else{android.widget.ImageView image=new android.widget.ImageView(activity);image.setContentDescription("Profile photo");top.addView(image,new LinearLayout.LayoutParams(dp(64),dp(64)));com.bumptech.glide.Glide.with(activity).load(store.photo()).circleCrop().into(image);}

    LinearLayout identity=vertical();identity.setPadding(dp(13),0,0,0);
    add(identity,text(nickname,22,INK,true),5);
    add(identity,text("Your XParty profile  ·  This device",11,MUTED,false),0);
    top.addView(identity,new LinearLayout.LayoutParams(0,-2,1));
    add(hero,top,12);
    add(hero,action("Choose profile photo",actions::photo),8);
    if(!store.photo().isEmpty())add(hero,action("Remove photo",()->{store.setPhoto("");show(root,nickname);}),8);
    add(hero,action("Share display name",()->{
      android.content.Intent intent=new android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain");
      intent.putExtra(android.content.Intent.EXTRA_TEXT,"My XParty display name is "+nickname);
      activity.startActivity(android.content.Intent.createChooser(intent,"Share XParty profile"));
    }),8);
    add(hero,action("Account and connections",()->new AccountProfileDialog(activity,store).open()),8);
    LinearLayout actionsRow=new LinearLayout(activity);actionsRow.setGravity(Gravity.CENTER_VERTICAL);
    TextView rename=action("Edit name",actions::rename);
    actionsRow.addView(rename);
    TextView privacy=text("  Private local activity",11,0xFFC8BEE0,false);
    actionsRow.addView(privacy);
    hero.addView(actionsRow);
    add(body,hero,15);

    JSONArray history=store.history(),likes=store.likes();
    int opens=0;
    Map<String,Integer> sources=new LinkedHashMap<>();
    for(int i=0;i<history.length();i++){
      JSONObject item=history.optJSONObject(i);if(item==null)continue;
      opens+=Math.max(1,item.optInt("opens",1));
      String name=item.optString("type","other");
      int seconds=item.optInt("seconds");if(seconds>0)sources.put(name,sources.getOrDefault(name,0)+seconds);
    }
    LinearLayout stats=new LinearLayout(activity);stats.setGravity(Gravity.CENTER);
    String[] values={Integer.toString(opens),Integer.toString(likes.length()),Long.toString(store.watchSeconds()/60)};
    String[] titles={"Media opens","Liked","Play minutes*"};
    for(int i=0;i<values.length;i++){
      LinearLayout tile=vertical();tile.setGravity(Gravity.CENTER);tile.setPadding(dp(2),dp(13),dp(2),dp(13));
      tile.setBackground(background(CARD,15));
      TextView number=text(values[i],21,INK,true);number.setGravity(Gravity.CENTER);
      TextView label=text(titles[i],10,MUTED,false);label.setGravity(Gravity.CENTER);
      tile.addView(number);tile.addView(label);
      LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);
      if(i>0)lp.leftMargin=dp(7);stats.addView(tile,lp);
    }
    add(body,stats,4);
    add(body,text("*Estimated foreground viewing time. New sessions count local playback activity. Earlier totals include room estimates.",10,MUTED,false),18);

    LinearLayout about=card(body);
    heading(about,"About","Add a short bio visible on this device.");
    add(about,text(store.bio().isEmpty()?"No bio added yet.":store.bio(),13,INK,false),10);
    add(about,action("Edit bio",()->edit("About you",store.bio(),true,store::setBio,root,nickname)),0);

    LinearLayout keywords=card(body);
    heading(keywords,"Interests & keywords","Choose your own interests; XParty does not infer private traits.");
    add(keywords,text(store.keywords().isEmpty()?"Add keywords such as music, comedy, science or live TV.":store.keywords(),13,INK,false),10);
    add(keywords,action("Edit keywords",()->edit("Keywords (comma-separated)",store.keywords(),false,store::setKeywords,root,nickname)),0);

    LinearLayout recent=card(body);
    heading(recent,"Recently opened","Your latest video and music sources on this device.");
    sourceList(recent,history,root,nickname);
    if(history.length()>0)add(recent,action("Clear history",()->
      new AlertDialog.Builder(activity).setTitle("Clear recent media?")
        .setMessage("This clears only the XParty history stored on this device.")
        .setNegativeButton("Cancel",null)
        .setPositiveButton("Clear",(d,w)->{store.clearHistory();show(root,nickname);}).show()),10);

    LinearLayout favorites=card(body);
    heading(favorites,"Liked videos","Saved when you tap the heart while a video is selected.");
    sourceList(favorites,likes,root,nickname);
    if(likes.length()>0)add(favorites,action("Clear liked videos",()->
      new AlertDialog.Builder(activity).setTitle("Clear your liked list?")
        .setMessage("This changes local profile data only.")
        .setNegativeButton("Cancel",null)
        .setPositiveButton("Clear",(d,w)->{store.clearLikes();show(root,nickname);}).show()),10);

    JSONArray saved=store.favorites();
    LinearLayout savedCard=card(body);
    heading(savedCard,"Saved sources","Favorites you've added in XParty Browse.");
    sourceList(savedCard,saved,root,nickname);

    LinearLayout topChannels=card(body);
    heading(topChannels,"Top sources","Ranked by observed playback time for recent media.");
    if(sources.isEmpty())add(topChannels,text("Your source preferences will appear as you watch.",13,MUTED,false),5);
    else sources.entrySet().stream().sorted((a,b)->Integer.compare(b.getValue(),a.getValue())).limit(5).forEach(item->{
      String provider=item.getKey().toUpperCase(Locale.ROOT);
      add(topChannels,text(provider+"   ·   "+item.getValue()/60+"m "+item.getValue()%60+"s",13,INK,false),9);
    });

    add(body,text("Profile details and activity remain on this device. Open Account and connections to edit your signed-in identity.",11,MUTED,false),4);
  }
}
