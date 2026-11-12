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
  private boolean closed;
  AccountProfileDialog(Activity activity){this.activity=activity;}
  private interface Task {void run() throws Exception;}
  private void ui(Runnable action){activity.runOnUiThread(()->{if(!closed&&!activity.isFinishing()&&!activity.isDestroyed())action.run();});}
  private void work(Task task){io.execute(()->{try{task.run();}catch(Exception error){ui(()->{Toast.makeText(activity,error instanceof IOException?error.getMessage():"Invalid account response",Toast.LENGTH_LONG).show();close();});}});}
  private void close(){closed=true;access=null;http.dispatcher().cancelAll();io.shutdown();}
  private AlertDialog.Builder dialog(String title){return new AlertDialog.Builder(activity).setTitle(title).setOnCancelListener(d->close());}
  private String request(String url,String method,JSONObject data,boolean authenticated) throws Exception{
    Request.Builder b=new Request.Builder().url(url);
    if(!url.equals(CONFIG)){b.header("apikey",key);if(authenticated)b.header("Authorization","Bearer "+access);}
    if(data!=null)b.method(method,RequestBody.create(MediaType.parse("application/json"),data.toString()));
    if(method.equals("POST")&&authenticated)b.header("Prefer","resolution=merge-duplicates,return=minimal");
    try(Response r=http.newCall(b.build()).execute()){
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
  private void login(){LinearLayout b=box();EditText email=field(b,"Account email",""),password=field(b,"Password","");
    email.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
    password.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);password.setSaveEnabled(false);
    dialog("Sign in to your XParty account").setView(b).setNegativeButton("Cancel",(d,w)->close()).setPositiveButton("Sign in",(d,w)->{
      String address=email.getText().toString().trim(),secret=password.getText().toString();password.setText("");
      work(()->{JSONObject login=new JSONObject(request(origin+"/auth/v1/token?grant_type=password","POST",new JSONObject().put("email",address).put("password",secret),false));
        access=login.getString("access_token");user=UUID.fromString(login.getJSONObject("user").getString("id")).toString();load();});
    }).show();
  }
  private void load() throws Exception{
    JSONArray found=new JSONArray(request(origin+"/rest/v1/xparty_profiles?id=eq."+user+"&select=display_name,bio","GET",null,true));
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
      dialog("Account profile").setMessage("Your account profile is visible according to your account privacy settings.\nConnections: "+(names.isEmpty()?"None":android.text.TextUtils.join(", ",names))).setView(b)
        .setNegativeButton("Close session",(d,w)->close()).setPositiveButton("Save to account",(d,w)->{
          String n=name.getText().toString().trim(),v=bio.getText().toString().trim();work(()->{
            if(n.isEmpty()||n.length()>24||v.length()>240)throw new IOException("Use a name of 1–24 characters and a bio of up to 240.");
            request(origin+"/rest/v1/xparty_profiles?on_conflict=id","POST",new JSONObject().put("id",user).put("display_name",n).put("bio",v),true);
            ui(()->{Toast.makeText(activity,"Account profile saved",Toast.LENGTH_SHORT).show();close();});
          });}).show();
    });
  }
}
