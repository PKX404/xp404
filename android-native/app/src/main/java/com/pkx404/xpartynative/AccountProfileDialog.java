package com.pkx404.xpartynative;

import android.app.Activity;
import android.app.AlertDialog;
import android.text.InputType;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import okhttp3.*;
import org.json.JSONArray;
import org.json.JSONObject;

/** A foreground account session. Room tokens and guest history never enter account requests. */
final class AccountProfileDialog {
  private static final String CONFIG="https://xparty-native-room.onrender.com/api/accounts/config";
  private final Activity activity;
  private final OkHttpClient http=new OkHttpClient.Builder().followRedirects(false).callTimeout(java.time.Duration.ofSeconds(15)).build();
  private final ExecutorService io=Executors.newSingleThreadExecutor();
  private String origin,key,access,user;
  private volatile boolean closed;
  private final NativeProfileStore local;
  AccountProfileDialog(Activity activity,NativeProfileStore local){this.activity=activity;this.local=local;}
  private interface Task {void run() throws Exception;}
  private void ui(Runnable action){activity.runOnUiThread(()->{if(!closed&&!activity.isFinishing()&&!activity.isDestroyed())action.run();});}
  private void work(Task task){io.execute(()->{try{task.run();}catch(Exception error){ui(()->{Toast.makeText(activity,error instanceof IOException?error.getMessage():"Invalid account response",Toast.LENGTH_LONG).show();close();});}});}
  private void close(){closed=true;access=null;http.dispatcher().cancelAll();io.shutdown();}
  private AlertDialog.Builder dialog(String title){return new AlertDialog.Builder(activity).setTitle(title).setOnCancelListener(d->close());}
  private String request(String url,String method,JSONObject data,boolean authenticated) throws Exception{
    Request.Builder b=new Request.Builder().url(url);
    if(!url.equals(CONFIG)){b.header("apikey",key);if(authenticated)b.header("Authorization","Bearer "+access);}
    if(method.equals("DELETE"))b.delete();
    if(data!=null)b.method(method,RequestBody.create(MediaType.parse("application/json"),data.toString()));
    if(method.equals("POST")&&authenticated&&url.contains("on_conflict="))b.header("Prefer","resolution=merge-duplicates,return=minimal");
    try(Response r=http.newCall(b.build()).execute()){
      if(r.code()==409)throw new IOException("This username or connection already exists.");
      if(!r.isSuccessful())throw new IOException("Account request failed ("+r.code()+"). Check your sign-in or account configuration.");
      return r.body()==null?"":r.body().string();
    }
  }
  void open(){work(()->{
    JSONObject cfg=new JSONObject(request(CONFIG,"GET",null,false));
    if(!cfg.optBoolean("enabled"))throw new IOException("Account sign-in is unavailable on this server. Your local profile is available.");
    HttpUrl url=HttpUrl.parse(cfg.getString("url"));
    if(url==null||!url.isHttps()||!url.encodedPath().equals("/")||!url.username().isEmpty()||!url.password().isEmpty())throw new IOException("Invalid account endpoint");
    origin=url.scheme()+"://"+url.host()+(url.port()==443?"":":"+url.port());key=cfg.getString("publicKey");ui(this::login);
  });}
  private EditText field(LinearLayout box,String hint,String value){EditText e=new EditText(activity);e.setSingleLine();e.setHint(hint);e.setText(value);box.addView(e);return e;}
  private LinearLayout box(){LinearLayout b=new LinearLayout(activity);b.setOrientation(LinearLayout.VERTICAL);int p=(int)(20*activity.getResources().getDisplayMetrics().density);b.setPadding(p,0,p,0);return b;}
  private void login(){
    LinearLayout b=box();EditText email=field(b,"Account email","");
    email.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
    android.widget.CheckBox consent=new android.widget.CheckBox(activity);
    consent.setText("I am 18 or older and have read the account notice above.");b.addView(consent);
    dialog("Sign in to XParty").setMessage("XParty uses your email for account access. Account names and bios can be visible to connections. Saving activity to your private account is optional.").setView(b)
      .setNegativeButton("Cancel",(d,w)->close()).setPositiveButton("Email me a code",(d,w)->{
        String address=email.getText().toString().trim();
        if(!consent.isChecked()||!android.util.Patterns.EMAIL_ADDRESS.matcher(address).matches()){
          Toast.makeText(activity,"Enter a valid email and confirm the account notice.",Toast.LENGTH_LONG).show();login();return;
        }
        work(()->{request(origin+"/auth/v1/otp","POST",new JSONObject().put("email",address).put("create_user",true),false);ui(()->verify(address));});
      }).show();
  }
  private void verify(String address){
    LinearLayout b=box();EditText code=field(b,"Email code","");code.setInputType(InputType.TYPE_CLASS_NUMBER);code.setSaveEnabled(false);
    dialog("Check your email").setView(b).setNegativeButton("Cancel",(d,w)->close()).setPositiveButton("Verify",(d,w)->{
      String otp=code.getText().toString().trim();code.setText("");
      work(()->{JSONObject login=new JSONObject(request(origin+"/auth/v1/verify","POST",new JSONObject().put("email",address).put("token",otp).put("type","email"),false));
        access=login.getString("access_token");user=UUID.fromString(login.getJSONObject("user").getString("id")).toString();load();});
    }).show();
  }
  private void load() throws Exception{
    JSONArray found=new JSONArray(request(origin+"/rest/v1/xparty_profiles?id=eq."+user+"&select=display_name,bio,username","GET",null,true));
    JSONObject profile=found.optJSONObject(0);
    JSONArray friends=new JSONArray(request(origin+"/rest/v1/xparty_friends?status=eq.accepted&select=requester,addressee&limit=100","GET",null,true));
    java.util.ArrayList<String> ids=new java.util.ArrayList<>();
    for(int i=0;i<friends.length();i++){
      JSONObject f=friends.getJSONObject(i);String a=f.getString("requester"),b=f.getString("addressee");
      if(user.equals(a)||user.equals(b))ids.add(UUID.fromString(user.equals(a)?b:a).toString());
    }
    JSONArray people=ids.isEmpty()?new JSONArray():new JSONArray(request(origin+"/rest/v1/xparty_profiles?select=display_name&id=in.("+android.text.TextUtils.join(",",ids)+")","GET",null,true));
    java.util.ArrayList<String> names=new java.util.ArrayList<>();for(int i=0;i<people.length();i++)names.add(people.getJSONObject(i).getString("display_name"));
    ui(()->{LinearLayout b=box();EditText name=field(b,"Display name",profile==null?"":profile.optString("display_name")),bio=field(b,"Bio",profile==null?"":profile.optString("bio"));
      EditText handle=field(b,"Username (optional)",profile==null||profile.isNull("username")?"":profile.optString("username"));
      android.widget.CheckBox publish=new android.widget.CheckBox(activity);
      if(!local.photo().isEmpty()){publish.setText("Use this device’s photo on my account");b.addView(publish);}
      dialog("Account profile").setNeutralButton("Connections",(dlg,which)->connections()).setMessage("Your account profile is visible according to your account privacy settings.\nConnections: "+(names.isEmpty()?"None":android.text.TextUtils.join(", ",names))).setView(b)
        .setNegativeButton("Close session",(d,w)->close()).setPositiveButton("Save to account",(d,w)->{
          boolean photo=publish.isChecked();String username=handle.getText().toString().trim().toLowerCase(java.util.Locale.ROOT);String n=name.getText().toString().trim(),v=bio.getText().toString().trim();work(()->{
            if(n.isEmpty()||n.length()>24||v.length()>240)throw new IOException("Use a name of 1–24 characters and a bio of up to 240.");
            if(!username.isEmpty()&&!username.matches("[a-z][a-z0-9_]{2,23}"))throw new IOException("Use a 3–24 character username starting with a letter.");
            JSONObject edit=new JSONObject().put("username",username.isEmpty()?JSONObject.NULL:username).put("id",user).put("display_name",n).put("bio",v);
            if(photo)edit.put("photo_data",local.photo());
            if(profile==null)request(origin+"/rest/v1/xparty_profiles","POST",edit,true);
            else{edit.remove("id");request(origin+"/rest/v1/xparty_profiles?id=eq."+user,"PATCH",edit,true);}
            ui(()->{Toast.makeText(activity,"Account profile saved",Toast.LENGTH_SHORT).show();close();});
          });}).show();
    });
  }
  private void connections(){
    work(()->{
      JSONArray pending=new JSONArray(request(origin+"/rest/v1/xparty_friends?status=eq.pending&addressee=eq."+user+"&select=id,requester&limit=100","GET",null,true));
      ui(()->{java.util.ArrayList<String> items=new java.util.ArrayList<>();items.add("Share my account ID");items.add("Add friend by account ID");items.add("Private activity across devices");
        for(int i=0;i<pending.length();i++){JSONObject row=pending.optJSONObject(i);items.add("Request from "+row.optString("requester"));}
        dialog("Connections").setItems(items.toArray(new String[0]),(d,index)->{
          if(index==0){android.content.Intent share=new android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain").putExtra(android.content.Intent.EXTRA_TEXT,"XParty account ID: "+user);activity.startActivity(android.content.Intent.createChooser(share,"Share account ID"));close();}
          else if(index==1){LinearLayout b=box();EditText id=field(b,"Friend’s account ID","");
            dialog("Send friend request").setView(b).setNegativeButton("Cancel",(x,w)->close()).setPositiveButton("Send",(x,w)->{
              String raw=id.getText().toString().trim();work(()->{String target=UUID.fromString(raw).toString();request(origin+"/rest/v1/xparty_friends","POST",new JSONObject().put("requester",user).put("addressee",target).put("status","pending"),true);load();});
            }).show();}
          else if(index==2)privateActivity();
          else{JSONObject row=pending.optJSONObject(index-3);dialog("Friend request").setMessage(row.optString("requester")).setPositiveButton("Accept",(x,w)->answer(row,true)).setNegativeButton("Decline",(x,w)->answer(row,false)).show();}
        }).setNegativeButton("Close",(d,w)->close()).show();
      });
    });
  }
  private void answer(JSONObject row,boolean accept){work(()->{
    String id=UUID.fromString(row.getString("id")).toString();
    request(origin+"/rest/v1/xparty_friends?id=eq."+id+"&addressee=eq."+user+"&status=eq.pending","PATCH",new JSONObject().put("status",accept?"accepted":"declined"),true);load();
  });}
  private void privateActivity(){work(()->{
    JSONArray devices=new JSONArray(request(origin+"/rest/v1/xparty_device_activity?owner_id=eq."+user+"&select=device_id,snapshot&limit=50","GET",null,true));
    StringBuilder summary=new StringBuilder();
    for(int i=0;i<devices.length();i++){
      JSONObject snapshot=devices.getJSONObject(i).getJSONObject("snapshot");JSONArray opened=snapshot.optJSONArray("opened");
      summary.append("Saved ").append(java.text.DateFormat.getDateTimeInstance().format(new java.util.Date(snapshot.optLong("recorded")))).append("\n");
      for(int j=0;opened!=null&&j<Math.min(12,opened.length());j++){JSONObject item=opened.getJSONObject(j);summary.append(item.optString("title")).append(" · ").append(item.optLong("seconds")).append("s\n");}
    }
    ui(()->dialog("Private account activity").setMessage((summary.length()==0?"No saved activity.":summary.toString())+"\nSave this device’s recent titles, watch times, likes, favorites and keywords to your private account? Shared links, room codes and playback URLs are excluded.")
      .setPositiveButton("Save this device",(d,w)->work(()->{
        String url=origin+"/rest/v1/rpc/xparty_save_device_activity";
        request(url,"POST",new JSONObject().put("device",local.deviceId()).put("activity",local.privateSnapshot()),true);
        ui(()->{Toast.makeText(activity,"Private activity saved",Toast.LENGTH_SHORT).show();close();});
      })).setNeutralButton("Delete this device’s copy",(d,w)->work(()->{
        request(origin+"/rest/v1/xparty_device_activity?owner_id=eq."+user+"&device_id=eq."+local.deviceId(),"DELETE",null,true);
        ui(()->{Toast.makeText(activity,"Deleted account copy",Toast.LENGTH_SHORT).show();close();});
      })).setNegativeButton("Close",(d,w)->close()).show());
  });}
}
