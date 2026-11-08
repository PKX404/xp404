package com.pkx404.xpartyremote;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothHidDevice;
import android.bluetooth.BluetoothHidDeviceAppSdpSettings;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.content.res.ColorStateList;
import android.widget.ImageView;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.SeekBar;
import java.util.Arrays;
import java.util.Set;

@SuppressWarnings("deprecation")
public final class MainActivity extends Activity {
  private static final int REQUEST_BT=10;
  private static final int REQUEST_ENABLE=11;
  private static final int BG=Color.rgb(7,19,38);
  private static final int PANEL=Color.rgb(11,36,80);
  private static final int ACCENT=Color.rgb(15,107,255);
  private static final byte[] KEY_UP=new byte[8];
  private final Handler handler=new Handler(Looper.getMainLooper());
  private BluetoothAdapter adapter;
  private BluetoothHidDevice hid;
  private BluetoothDevice connectedDevice;
  private boolean registered=false;
  private boolean activating=false;
  private long nextSendAt=0;
  private TextView status;
  private LinearLayout devices;
  private EditText textToSend;
  private boolean settingsShown=false;
  private String statusMessage="Not connected · Tap Settings to pair";

  // Standard HID keyboard (ID 1), relative pointer (ID 2), consumer/media keys (ID 3).
  private static final byte[] REPORT_DESCRIPTOR=hex(
    "05 01 09 06 A1 01 85 01 05 07 19 E0 29 E7 15 00 25 01 75 01 95 08 81 02 " +
    "75 08 95 01 81 03 75 08 95 06 15 00 25 65 05 07 19 00 29 65 81 00 C0 " +
    "05 01 09 02 A1 01 85 02 09 01 A1 00 05 09 19 01 29 03 15 00 25 01 " +
    "95 03 75 01 81 02 95 01 75 05 81 03 05 01 09 30 09 31 09 38 15 81 " +
    "25 7F 75 08 95 03 81 06 C0 C0 " +
    "05 0C 09 01 A1 01 85 03 15 00 26 FF 03 19 00 2A FF 03 75 10 95 01 81 00 C0"
  );

  private static byte[] hex(String input){
    String s=input.replace(" ","");
    byte[] a=new byte[s.length()/2];
    for(int i=0;i<a.length;i++)a[i]=(byte)Integer.parseInt(s.substring(i*2,i*2+2),16);
    return a;
  }
  @Override public void onCreate(Bundle savedInstanceState){
    super.onCreate(savedInstanceState);
    getWindow().setStatusBarColor(BG);
    getWindow().setNavigationBarColor(BG);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    BluetoothManager manager=(BluetoothManager)getSystemService(BLUETOOTH_SERVICE);
    adapter=manager==null?null:manager.getAdapter();
    render();
  }
  private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
  private GradientDrawable shape(int color,int round){
    GradientDrawable d=new GradientDrawable();
    d.setColor(color);d.setCornerRadius(dp(round));d.setStroke(dp(1),0xFF1C5795);return d;
  }
  private LinearLayout stack(){
    LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l;
  }
  private TextView label(String s,int sp,int color){
    TextView t=new TextView(this);t.setText(s);t.setTextSize(sp);t.setTextColor(color);return t;
  }
  private void add(LinearLayout root, View view, int bottom){
    LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);
    lp.bottomMargin=dp(bottom);root.addView(view,lp);
  }
  private TextView button(String caption,Runnable r){
    TextView b=label(caption,12,Color.WHITE);
    b.setTypeface(null,1);b.setGravity(Gravity.CENTER);b.setMinHeight(dp(50));
    b.setPadding(dp(6),dp(10),dp(6),dp(10));
    b.setBackground(shape(PANEL,14));
    b.setForeground(new RippleDrawable(ColorStateList.valueOf(0x5545C7FF),null,shape(0xFFFFFFFF,14)));
    b.setContentDescription(caption);b.setOnClickListener(v->r.run());return b;
  }
  private void buttonRow(LinearLayout parent,String[] titles,Runnable[] callbacks){
    LinearLayout row=new LinearLayout(this);
    for(int i=0;i<titles.length;i++){
      TextView b=button(titles[i],callbacks[i]);
      LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(50),1);
      if(i>0)p.leftMargin=dp(7);row.addView(b,p);
    }
    add(parent,row,7);
  }
  private void render(){
    ScrollView scroller=new ScrollView(this);scroller.setFillViewport(true);scroller.setBackgroundColor(BG);
    LinearLayout root=stack();root.setPadding(dp(18),dp(30),dp(18),dp(24));
    scroller.addView(root);setContentView(scroller);
    settingsShown=false;devices=null;
    LinearLayout header=new LinearLayout(this);
    header.setGravity(Gravity.CENTER_VERTICAL);
    ImageView mark=new ImageView(this);mark.setImageResource(R.drawable.xparty_remote_icon);
    header.addView(mark,new LinearLayout.LayoutParams(dp(54),dp(54)));
    LinearLayout captions=stack();
    LinearLayout.LayoutParams capLp=new LinearLayout.LayoutParams(0,-2,1);capLp.leftMargin=dp(10);
    TextView name=label("XPARTY",19,Color.WHITE);
    name.setTypeface(null,1);name.setLetterSpacing(.07f);
    captions.addView(name);
    captions.addView(label("REMOTE  /  2.0  ·  NATIVE",11,0xFF9DCDF2));
    header.addView(captions,capLp);
    header.addView(button("SETTINGS",()->openSettings()),new LinearLayout.LayoutParams(dp(92),dp(50)));
    add(root,header,15);
    status=label(statusMessage,13,0xFFE7F5FF);
    status.setPadding(dp(13),dp(13),dp(13),dp(13));
    status.setBackground(shape(0xFF0E315C,15));
    status.setOnClickListener(v->openSettings());
    status.setContentDescription("Bluetooth connection status. Open connection settings");
    add(root,status,10);
    add(root,label("ELECTRIC BLUE TOUCHPAD",12,0xFF5ECFFF),7);
    // Native XML touch surface with custom two-finger HID wheel handling.
    RemoteTouchpadView pad=(RemoteTouchpadView)getLayoutInflater().inflate(
      R.layout.touchpad_panel,root,false);
    pad.configure(
      getPreferences(MODE_PRIVATE).getInt("pointer_sensitivity",45),
      getPreferences(MODE_PRIVATE).getInt("scroll_sensitivity",50));
    pad.setInputListener(new RemoteTouchpadView.InputListener(){
      @Override public void move(int x,int y){mouse(0,x,y,0);}
      @Override public void scroll(int ticks){mouse(0,0,0,ticks);}
      @Override public void click(){MainActivity.this.click(1);}
    });
    add(root,pad,12);
    pad.getLayoutParams().height=dp(238);

    buttonRow(root,new String[]{"Left click","Right click","Back"},
      new Runnable[]{()->click(1),()->click(2),()->key(41)});
    add(root,label("DIRECTIONAL CONTROLS",12,0xFF5ECFFF),8);
    buttonRow(root,new String[]{"▲ Up","▼ Down","↵ Select"},
      new Runnable[]{()->key(82),()->key(81),()->key(40)});
    buttonRow(root,new String[]{"◀ Left","▶ Right","Tab"},
      new Runnable[]{()->key(80),()->key(79),()->key(43)});
    add(root,label("SEARCH LIVE TV & VIDEOS",12,0xFF5ECFFF),7);
    textToSend=new EditText(this);
    textToSend.setSingleLine(true);textToSend.setHint("Type channel name (e.g. Zee Cinema)");
    textToSend.setTextColor(Color.WHITE);textToSend.setHintTextColor(0xFFA8C6E8);
    textToSend.setTextSize(15);textToSend.setPadding(dp(15),dp(12),dp(15),dp(12));
    textToSend.setBackground(shape(PANEL,14));add(root,textToSend,8);
    buttonRow(root,new String[]{"Send text","Enter","⌫ Delete"},
      new Runnable[]{()->typeText(textToSend.getText().toString()),()->key(40),()->key(42)});
    add(root,label("PLAYBACK & SOUND",12,0xFF5ECFFF),7);
    buttonRow(root,new String[]{"PREVIOUS","PLAY / PAUSE","NEXT"},
      new Runnable[]{()->consumer(0xB6),()->consumer(0xCD),()->consumer(0xB5)});
    buttonRow(root,new String[]{"Volume −","Mute","Volume +"},
      new Runnable[]{()->consumer(0xEA),()->consumer(0xE2),()->consumer(0xE9)});
    buttonRow(root,new String[]{"SPACE","FULLSCREEN","ESC"},
      new Runnable[]{()->key(44),()->key(9),()->key(41)});
    add(root,label("Pair and switch tablets in Settings. Channel search works when the tablet's search field is focused.",12,0xFFA7C4E6),2);
  }

  private void openSettings(){
    settingsShown=true;
    ScrollView scroller=new ScrollView(this);
    scroller.setFillViewport(true);scroller.setBackgroundColor(BG);
    LinearLayout root=stack();root.setPadding(dp(18),dp(24),dp(18),dp(30));
    scroller.addView(root);setContentView(scroller);
    LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);
    ImageView mark=new ImageView(this);
    mark.setImageResource(R.drawable.xparty_remote_icon);
    header.addView(mark,new LinearLayout.LayoutParams(dp(52),dp(52)));
    LinearLayout heading=stack();
    LinearLayout.LayoutParams hp=new LinearLayout.LayoutParams(0,-2,1);hp.leftMargin=dp(12);
    TextView title=label("CONNECTIVITY",19,Color.WHITE);title.setTypeface(null,1);
    heading.addView(title);
    heading.addView(label("XPARTY REMOTE  /  2.0",11,0xFF9DCDF2));
    header.addView(heading,hp);
    header.addView(button("BACK",()->render()),new LinearLayout.LayoutParams(dp(75),dp(50)));
    add(root,header,16);
    status=label(statusMessage,13,0xFFE7F5FF);
    status.setPadding(dp(15),dp(16),dp(15),dp(16));
    status.setBackground(shape(0xFF0E315C,15));
    add(root,status,18);
    add(root,label("BLUETOOTH CONNECTION",12,0xFF5ECFFF),10);
    buttonRow(root,new String[]{"ACTIVATE REMOTE","DISCOVERABLE"},
      new Runnable[]{this::activate,this::discoverable});
    buttonRow(root,new String[]{"REFRESH DEVICES","DISCONNECT"},
      new Runnable[]{this::showPaired,this::disconnect});
    add(root,label("YOUR PAIRED DEVICES",12,0xFF5ECFFF),9);
    devices=stack();add(root,devices,12);
    showPaired();
    add(root,label("PAIRING GUIDE",12,0xFF5ECFFF),9);
    TextView guide=label("1. Enable Bluetooth on phone and tablet.\n2. Activate remote, then make phone discoverable.\n3. From the tablet Bluetooth settings, pair with this phone.\n4. Refresh paired tablets here and connect.\n5. Return to remote controls.",13,0xFFE2F3FF);
    guide.setPadding(dp(14),dp(16),dp(14),dp(16));
    guide.setBackground(shape(PANEL,14));guide.setLineSpacing(dp(4),1.0f);
    add(root,guide,18);
    add(root,label("TOUCHPAD TUNING",12,0xFF5ECFFF),9);
    addSensitivity(root,"POINTER SENSITIVITY","pointer_sensitivity",45);
    addSensitivity(root,"SCROLL SENSITIVITY","scroll_sensitivity",50);
    add(root,label("GESTURES",12,0xFF5ECFFF),9);
    add(root,label("One finger moves the pointer. Tap to select.\nTwo fingers swipe to scroll on the tablet.\nVolume and playback keys depend on tablet support.",13,0xFFAFCDEB),0);
  }
  @Override public void onBackPressed(){
    if(settingsShown)render();else super.onBackPressed();
  }
  private void addSensitivity(LinearLayout root,String label,String key,int initial){
    int current=getPreferences(MODE_PRIVATE).getInt(key,initial);
    TextView value=label(label+"  ·  "+current+"%",12,0xFFE2F3FF);
    add(root,value,3);
    SeekBar slider=new SeekBar(this);
    slider.setMax(100);slider.setProgress(current);slider.setProgressTintList(ColorStateList.valueOf(ACCENT));
    slider.setThumbTintList(ColorStateList.valueOf(0xFF5ECFFF));
    slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
      @Override public void onProgressChanged(SeekBar bar,int progress,boolean fromUser){
        value.setText(label+"  ·  "+progress+"%");
        if(fromUser)getPreferences(MODE_PRIVATE).edit().putInt(key,progress).apply();
      }
      @Override public void onStartTrackingTouch(SeekBar bar){}
      @Override public void onStopTrackingTouch(SeekBar bar){}
    });
    add(root,slider,12);
  }
  private static int clamp(int x){return Math.max(-127,Math.min(127,x));}
  private void status(String message){statusMessage=message;runOnUiThread(()->{if(status!=null)status.setText(message);});}
  private void note(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}
  private boolean permissions(){
    if(Build.VERSION.SDK_INT>=31){
      String[] needs={Manifest.permission.BLUETOOTH_CONNECT,Manifest.permission.BLUETOOTH_ADVERTISE};
      boolean ok=true;
      for(String n:needs)if(checkSelfPermission(n)!=PackageManager.PERMISSION_GRANTED)ok=false;
      if(!ok){requestPermissions(needs,REQUEST_BT);return false;}
    }
    return true;
  }
  @Override public void onRequestPermissionsResult(int request,String[] names,int[] results){
    super.onRequestPermissionsResult(request,names,results);
    if(request==REQUEST_BT){
      boolean ok=results.length>=2;
      for(int x:results)ok &= x==PackageManager.PERMISSION_GRANTED;
      if(ok)activate();else status("Bluetooth Nearby Devices permission is required");
    }
  }
  private void activate(){
    if(adapter==null){status("This phone does not offer Bluetooth");return;}
    if(!permissions())return;
    if(!adapter.isEnabled()){
      status("Please enable Bluetooth and return to this app");
      startActivityForResult(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE),REQUEST_ENABLE);return;
    }
    if(hid!=null){register();return;}
    status("Checking Bluetooth keyboard / mouse support…");
    boolean available=adapter.getProfileProxy(this,new BluetoothProfile.ServiceListener(){
      @Override public void onServiceConnected(int profile,BluetoothProfile proxy){
        if(profile!=BluetoothProfile.HID_DEVICE)return;
        hid=(BluetoothHidDevice)proxy;
        register();
      }
      @Override public void onServiceDisconnected(int profile){
        registered=false;hid=null;connectedDevice=null;
        status("Bluetooth service disconnected · Activate again");
      }
    },BluetoothProfile.HID_DEVICE);
    if(!available)status("Bluetooth HID Device is unavailable on this phone");
  }
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(request==REQUEST_ENABLE&&result==RESULT_OK)activate();
  }
  private void register(){
    if(hid==null||registered||activating)return;
    activating=true;
    BluetoothHidDeviceAppSdpSettings sdp=new BluetoothHidDeviceAppSdpSettings(
      "XParty Remote","Phone keyboard and touchpad for tablet","PKX404",
      BluetoothHidDevice.SUBCLASS1_COMBO,REPORT_DESCRIPTOR);
    try {
      boolean accepted=hid.registerApp(sdp,null,null,getMainExecutor(),new BluetoothHidDevice.Callback(){
        @Override public void onAppStatusChanged(BluetoothDevice plugged,boolean ready){
          activating=false;registered=ready;
          if(ready){status("Ready to pair · Make phone discoverable, then connect tablet");showPaired();}
          else {connectedDevice=null;status("Bluetooth HID profile not supported or registration declined");}
        }
        @Override public void onConnectionStateChanged(BluetoothDevice device,int state){
          if(state==BluetoothProfile.STATE_CONNECTED){
            connectedDevice=device;status("Connected: "+safeName(device)+" · Remote ready");
          } else if(state==BluetoothProfile.STATE_DISCONNECTED){
            if(connectedDevice!=null && connectedDevice.getAddress().equals(device.getAddress()))connectedDevice=null;
            status("Tablet disconnected · Choose a paired tablet");
          } else if(state==BluetoothProfile.STATE_CONNECTING)status("Connecting to "+safeName(device)+"…");
        }
      });
      if(!accepted){activating=false;status("This Android device refused Bluetooth HID registration");}
    }catch(SecurityException e){activating=false;status("Bluetooth permission denied");}
  }
  private String safeName(BluetoothDevice d){
    try{String n=d.getName();return n==null||n.isEmpty()?d.getAddress():n;}catch(Exception e){return "tablet";}
  }
  private void discoverable(){
    if(!permissions())return;
    if(adapter==null||!adapter.isEnabled()){activate();return;}
    Intent i=new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE);
    i.putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION,300);
    startActivity(i);
    note("On the tablet, open Bluetooth settings and pair with this phone");
  }
  private void showPaired(){
    if(devices==null||adapter==null||!permissions())return;
    devices.removeAllViews();
    if(!adapter.isEnabled()){status("Bluetooth is off");return;}
    try {
      Set<BluetoothDevice> known=adapter.getBondedDevices();
      if(known.isEmpty())add(devices,label("No paired devices yet. Pair your tablet in Bluetooth settings.",12,0xFF9999BA),10);
      else for(BluetoothDevice d:known) {
        TextView b=button("Connect · "+safeName(d),()->connect(d));
        add(devices,b,7);
      }
    } catch(SecurityException ex){status("Nearby Devices permission required");}
  }
  private void connect(BluetoothDevice d){
    if(!registered||hid==null){status("First tap Activate remote");return;}
    try{
      if(!hid.connect(d))status("Cannot connect · Ensure the tablet accepts Bluetooth keyboards");
      else status("Connecting to "+safeName(d)+"…");
    }catch(SecurityException e){status("Bluetooth permission denied");}
  }
  private void disconnect(){
    if(hid!=null&&connectedDevice!=null)try{hid.disconnect(connectedDevice);}catch(SecurityException ignored){}
    connectedDevice=null;status("Disconnected");
  }
  private boolean ready(){if(hid==null||!registered||connectedDevice==null){note("Connect to your tablet first");return false;}return true;}
  private boolean send(int id,byte[] report){
    if(hid==null||connectedDevice==null||!registered)return false;
    try{return hid.sendReport(connectedDevice,id,report);}catch(SecurityException e){status("Bluetooth permission lost");return false;}
  }
  private void schedule(long delay,Runnable action){
    long now=SystemClock.uptimeMillis();
    nextSendAt=Math.max(nextSendAt,now)+delay;
    handler.postAtTime(action,nextSendAt);
  }
  private void rawKey(int code,int modifier){
    final byte[] data=new byte[]{(byte)modifier,0,(byte)code,0,0,0,0,0};
    schedule(1,()->send(1,data));
    schedule(52,()->send(1,KEY_UP));
  }
  private void key(int scan){if(!ready())return;rawKey(scan,0);}
  private void consumer(int usage){
    if(!ready())return;
    final byte[] press={(byte)(usage&255),(byte)((usage>>8)&255)};
    schedule(1,()->send(3,press));
    schedule(65,()->send(3,new byte[]{0,0}));
  }
  private void mouse(int button,int x,int y,int wheel){
    send(2,new byte[]{(byte)button,(byte)clamp(x),(byte)clamp(y),(byte)clamp(wheel)});
  }
  private void click(int button){
    if(!ready())return;
    mouse(button,0,0,0);
    handler.postDelayed(()->mouse(0,0,0,0),85);
  }
  private void typeText(String s){
    if(!ready())return;
    if(s.isEmpty()){note("Enter the channel name first");return;}
    if(s.length()>100){note("Limit channel searches to 100 characters");return;}
    int unsupported=0;
    for(char c:s.toCharArray()){
      int[] mapping=map(c);
      if(mapping==null){unsupported++;continue;}
      rawKey(mapping[0],mapping[1]);
    }
    if(unsupported>0)note("Some non-English characters could not be typed over Bluetooth HID");
    else note("Text queued · Tap Enter to search");
  }
  private static int[] map(char c){
    if(c>='a'&&c<='z')return new int[]{4+c-'a',0};
    if(c>='A'&&c<='Z')return new int[]{4+c-'A',2};
    if(c>='1'&&c<='9')return new int[]{30+c-'1',0};
    if(c=='0')return new int[]{39,0};
    switch(c){
      case ' ':return new int[]{44,0};
      case '-':return new int[]{45,0};
      case '_':return new int[]{45,2};
      case '=':return new int[]{46,0};
      case '+':return new int[]{46,2};
      case '.':return new int[]{55,0};
      case ',':return new int[]{54,0};
      case '/':return new int[]{56,0};
      case ':':return new int[]{51,2};
      case ';':return new int[]{51,0};
      case '\'':return new int[]{52,0};
      case '!':return new int[]{30,2};
      case '?':return new int[]{56,2};
      default:return null;
    }
  }
  @Override protected void onDestroy(){
    handler.removeCallbacksAndMessages(null);
    if(hid!=null){
      try{hid.unregisterApp();}catch(Exception ignored){}
      if(adapter!=null)adapter.closeProfileProxy(BluetoothProfile.HID_DEVICE,hid);
    }
    hid=null;registered=false;
    super.onDestroy();
  }
}
