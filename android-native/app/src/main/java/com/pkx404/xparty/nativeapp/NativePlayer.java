package com.pkx404.xparty.nativeapp;

import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.widget.FrameLayout;
import androidx.annotation.OptIn;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;
import org.json.JSONObject;
import java.util.Collections;

/** Android Media3 player; only YouTube's official iframe uses an isolated, media-only WebView. */
@OptIn(markerClass=UnstableApi.class)
public final class NativePlayer {
    public interface Callbacks {
        void onReady(String sourceId);
        void onStatus(String value);
        void onEnded();
    }
    private final Context context;
    private final FrameLayout container;
    private final PlayerView playerView;
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final Callbacks callback;
    private ExoPlayer player;
    private WebView youtube;
    private JSONObject source;
    private String sourceId="",type="";
    private String token="";
    private boolean live=false, syncing=false;
    private long lastCorrection=0;
    private int scaleMode=0;
    private boolean localPause=false;
    private Runnable ytRefresh;
    private boolean youtubeReadySent=false;
    public NativePlayer(Context context,FrameLayout container,Callbacks callback){
        this.context=context;this.container=container;this.callback=callback;
        playerView=new PlayerView(context);
        playerView.setUseController(false);
        playerView.setShutterBackgroundColor(Color.BLACK);
        playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        container.addView(playerView,new FrameLayout.LayoutParams(-1,-1));
    }
    public String sourceId(){return sourceId;}
    public boolean hasSource(){return !sourceId.isEmpty();}
    public boolean isLive(){return live;}
    public boolean isYoutube(){return "youtube".equals(type);}
    public long durationMs(){
        if(player!=null&&!isYoutube())return player.getDuration()==C.TIME_UNSET?0:Math.max(0,player.getDuration());
        return 0;
    }
    public long positionMs(){return player!=null&&!isYoutube()?Math.max(0,player.getCurrentPosition()):0;}
    public boolean isPlaying(){return isYoutube()?youtube!=null:player!=null&&player.isPlaying();}
    public View playerView(){return container;}
    public void setVolume(float v){if(player!=null)player.setVolume(Math.max(0,Math.min(1,v)));if(youtube!=null)youtube.evaluateJavascript("if(window.ytPlayer)ytPlayer.setVolume("+Math.round(v*100)+");",null);}
    public void setScaleMode(int mode){
        scaleMode=mode%3;
        playerView.setResizeMode(scaleMode==0?AspectRatioFrameLayout.RESIZE_MODE_FIT:scaleMode==1?AspectRatioFrameLayout.RESIZE_MODE_ZOOM:AspectRatioFrameLayout.RESIZE_MODE_FILL);
    }
    private ExoPlayer ensurePlayer(String headersToken){
        if(player!=null){player.release();player=null;}
        DefaultHttpDataSource.Factory httpFactory=new DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(false).setConnectTimeoutMs(12000).setReadTimeoutMs(15000);
        if(!headersToken.isEmpty())httpFactory.setDefaultRequestProperties(Collections.singletonMap("Authorization","Bearer "+headersToken));
        DefaultDataSource.Factory data=new DefaultDataSource.Factory(context,httpFactory);
        player=new ExoPlayer.Builder(context).setMediaSourceFactory(new DefaultMediaSourceFactory(data)).build();
        playerView.setPlayer(player);
        player.addListener(new Player.Listener(){
            @Override public void onPlaybackStateChanged(int state){
                if(state==Player.STATE_READY){callback.onReady(sourceId);callback.onStatus(live?"LIVE":"Ready");}
                if(state==Player.STATE_BUFFERING)callback.onStatus("Loading video");
                if(state==Player.STATE_ENDED)callback.onEnded();
            }
            @Override public void onPlayerError(PlaybackException error){callback.onStatus("Cannot play this source · "+error.getErrorCodeName());}
        });
        return player;
    }
    public void load(JSONObject next,String backend,String token){
        if(next==null){stop();return;}
        String id=next.optString("id");
        if(id.isEmpty()||id.equals(sourceId))return;
        stop();this.source=next;this.sourceId=id;this.type=next.optString("type");this.token=token;
        live="iptv".equals(type);
        playerView.setVisibility("youtube".equals(type)?View.GONE:View.VISIBLE);
        if("youtube".equals(type)){loadYouTube(next.optString("videoId"));return;}
        String url=next.optString("url");
        if("file".equals(type))url=backend+"/api/file/"+id;
        if(url.isEmpty()){callback.onStatus("Source unavailable");return;}
        if(!url.startsWith("https://")&&!url.startsWith("content://")){callback.onStatus("Only secure video sources are supported");return;}
        String auth="file".equals(type)?token:"";
        ExoPlayer playback=ensurePlayer(auth);
        playback.setMediaItem(MediaItem.fromUri(Uri.parse(url)));
        playback.prepare();
        callback.onStatus("Loading video");
    }
    public void loadLocal(Uri uri){
        stop();sourceId="local";type="local";live=false;
        playerView.setVisibility(View.VISIBLE);
        ExoPlayer p=ensurePlayer("");
        p.setMediaItem(MediaItem.fromUri(uri));
        p.prepare();p.play();
        callback.onReady("local");
    }
    private void loadYouTube(String videoId){
        if(!videoId.matches("[A-Za-z0-9_-]{11}")){callback.onStatus("Invalid YouTube video");return;}
        youtube=new WebView(context);
        WebSettings s=youtube.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        youtube.setBackgroundColor(Color.BLACK);
        youtube.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !request.getUrl().getHost().endsWith("youtube.com")&&!request.getUrl().getHost().endsWith("youtube-nocookie.com");}
        });
        container.addView(youtube,new FrameLayout.LayoutParams(-1,-1));
        String html="<html><head><meta name='viewport' content='width=device-width, initial-scale=1.0,maximum-scale=1.0'></head><body style='margin:0;background:black'>"
            +"<div id='player'></div><script src='https://www.youtube.com/iframe_api'></script><script>"
            +"var ytPlayer;function onYouTubeIframeAPIReady(){ytPlayer=new YT.Player('player',{width:'100%',height:'100%',videoId:'"+videoId+"',playerVars:{playsinline:1,rel:0,controls:0,enablejsapi:1,origin:'https://krezi.onrender.com'}});}"
            +"function state(){if(!ytPlayer||!ytPlayer.getPlayerState)return '{}';try{return JSON.stringify({ready:true,playing:ytPlayer.getPlayerState()===1,time:ytPlayer.getCurrentTime(),duration:ytPlayer.getDuration()});}catch(e){return '{}';}}"
            +"</script></body></html>";
        youtube.loadDataWithBaseURL("https://krezi.onrender.com/",html,"text/html","UTF-8",null);
        callback.onStatus("Loading YouTube");
        // Kept separate from the native room and UI; no JavaScript bridge exposed to third-party frames.
        ytRefresh=new Runnable(){
            @Override public void run(){
                if(youtube==null)return;
                youtube.evaluateJavascript("state()",v->{
                    if(!youtubeReadySent&&!"{}".equals(v)&&v!=null&&v.contains("ready")){youtubeReadySent=true;callback.onReady(sourceId);}
                });
                ui.postDelayed(this,3500);
            }
        };
        ui.postDelayed(ytRefresh,2200);
    }
    public void applyPlayback(JSONObject playback,boolean explicit){
        if(playback==null||sourceId.isEmpty()||"local".equals(sourceId))return;
        boolean playing=playback.optBoolean("playing",false);
        long updatedAt=playback.optLong("updatedAt",System.currentTimeMillis());
        double seconds=playback.optDouble("position",0);
        if(playing&&!live)seconds+=Math.max(0,System.currentTimeMillis()-updatedAt)/1000.0;
        long target=Math.round(seconds*1000);
        if(isYoutube()){
            if(youtube!=null){youtube.evaluateJavascript("if(window.ytPlayer&&ytPlayer.getPlayerState) {ytPlayer."+(playing&&!localPause?"playVideo":"pauseVideo")+"();"+(!live&&explicit?"ytPlayer.seekTo("+seconds+",true);":"")+"}",null);}
            return;
        }
        if(player==null)return;
        if(player.getPlayWhenReady()!=(playing&&!localPause))player.setPlayWhenReady(playing&&!localPause);
        if(live)return;
        long diff=target-player.getCurrentPosition();
        if((explicit&&Math.abs(diff)>250||Math.abs(diff)>1100&&System.currentTimeMillis()-lastCorrection>1500)&&player.getPlaybackState()!=Player.STATE_IDLE){
            player.seekTo(Math.max(0,target));lastCorrection=System.currentTimeMillis();player.setPlaybackSpeed(1f);
        }else if(playing&&Math.abs(diff)>300&&Math.abs(diff)<1100&&System.currentTimeMillis()-lastCorrection>1200){
            player.setPlaybackSpeed(diff>0?1.03f:0.97f);
        }else if(player.getPlaybackParameters().speed!=1f){player.setPlaybackSpeed(1f);}
    }
    public void pauseLocally(boolean pause){localPause=pause;if(player!=null)player.setPlayWhenReady(!pause);if(youtube!=null)youtube.evaluateJavascript("if(window.ytPlayer)ytPlayer."+(pause?"pauseVideo":"playVideo")+"();",null);}
    public void selectLanguage(String code){
        if(player!=null)player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setPreferredAudioLanguage(code).build());
    }
    public void stop(){
        if(ytRefresh!=null)ui.removeCallbacks(ytRefresh);ytRefresh=null;
        if(youtube!=null){youtube.stopLoading();youtube.loadUrl("about:blank");container.removeView(youtube);youtube.destroy();youtube=null;}
        if(player!=null){player.stop();player.clearMediaItems();player.release();player=null;playerView.setPlayer(null);}
        sourceId="";type="";source=null;token="";live=false;localPause=false;lastCorrection=0;youtubeReadySent=false;
    }
    public void destroy(){stop();}
}
