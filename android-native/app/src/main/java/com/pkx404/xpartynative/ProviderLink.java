package com.pkx404.xpartynative;

import java.net.URI;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

final class ProviderLink {
  static String name(String type) {
    switch(type) {
      case "prime": return "Prime Video";
      case "netflix": return "Netflix";
      case "twitch": return "Twitch";
      case "vimeo": return "Vimeo";
      case "soundcloud": return "SoundCloud";
      default: return "";
    }
  }
  static String home(String type) {
    switch(type) {
      case "prime": return "https://www.primevideo.com/";
      case "netflix": return "https://www.netflix.com/browse";
      case "twitch": return "https://www.twitch.tv/";
      case "soundcloud": return "https://soundcloud.com/";
      default: return "https://vimeo.com/";
    }
  }
  static boolean embedded(String type) {return "vimeo".equals(type)||"twitch".equals(type)||"soundcloud".equals(type);}
  static boolean companion(String type) {return "prime".equals(type)||"netflix".equals(type);}
  static String group(String path,String pattern) {
    Matcher m=Pattern.compile(pattern).matcher(path);
    return m.matches()?m.group(1):null;
  }
  static JSONObject parse(String type,String input,String label) {
    try {
      URI uri=new URI(input.trim());
      String host=uri.getHost();
      if(!"https".equalsIgnoreCase(uri.getScheme())||host==null||uri.getUserInfo()!=null||uri.getPort()!=-1)return null;
      host=host.toLowerCase(Locale.ROOT);
      String path=uri.getRawPath(),id=null,url=null;
      if("vimeo".equals(type)&&host.matches("(www\\.|player\\.)?vimeo\\.com")) {
        if(uri.getRawQuery()!=null&&java.util.Arrays.stream(uri.getRawQuery().split("&")).anyMatch(s->s.startsWith("h=")))return null;
        id=group(path,"/(?:video/)?([1-9][0-9]{5,11})/?");
      } else if("twitch".equals(type)&&host.matches("(www\\.|m\\.)?twitch\\.tv")) {
        id=group(path,"/videos/([1-9][0-9]{0,19})/?");
        if(id!=null)id="video:"+id;
        else {
          id=group(path.toLowerCase(Locale.ROOT),"/([a-z0-9_]{1,25})/?");
          if(id==null||id.matches("directory|downloads|jobs|p|settings|subscriptions|turbo|videos|search|inventory|wallet|friends|messages|login|signup|clip|clips|collections"))return null;
          id="channel:"+id;
        }
      } else if("soundcloud".equals(type)&&host.matches("(www\\.)?soundcloud\\.com")&&uri.getRawFragment()==null) {
        // Canonical public tracks only; never accept iframe HTML, secret tokens,
        // arbitrary hosts or private URLs supplied through the room protocol.
        Matcher sound=Pattern.compile("/([a-zA-Z0-9][a-zA-Z0-9_-]{0,99})/([a-zA-Z0-9][a-zA-Z0-9_-]{0,254})/?").matcher(path);
        if(!sound.matches())return null;
        String user=sound.group(1),track=sound.group(2);
        String excluded="sets|likes|reposts|tracks|albums|popular-tracks|followers|following|comments|recommended|discover|stream|search|charts|you|upload|pages|terms|settings|stations";
        if(user.toLowerCase(Locale.ROOT).matches(excluded)||track.toLowerCase(Locale.ROOT).matches(excluded))return null;
        id="https://soundcloud.com/"+user+"/"+track;
      } else if("netflix".equals(type)&&host.matches("(www\\.)?netflix\\.com")) {
        id=group(path,"/(?:[a-z]{2}(?:-[A-Z]{2})?/)?(?:title|watch)/([0-9]{6,12})/?");
        url="https://www.netflix.com/watch/"+id;
      } else if("prime".equals(type)) {
        if(host.matches("(www\\.)?primevideo\\.com")){
          id=group(path,"/(?:[a-z]{2}(?:-[A-Za-z]{2})?/)?(?:detail|dp)/(?:[^/]+/)?([A-Za-z0-9]{10,32})/?");
          url="https://www.primevideo.com/detail/";
        }else if(host.matches("www\\.amazon\\.(com|co\\.uk|de|co\\.jp|in)")){
          id=group(path,"/gp/video/detail/([a-zA-Z0-9]{10,32})(?:/ref=[^/]*)?/?");
          url="https://"+host+"/gp/video/detail/";
        }
        if(id!=null){id=id.toUpperCase(Locale.ROOT);url+=id;}
      }
      if(id==null)return null;
      String title=label==null?"":label.trim();
      if(title.isEmpty())title="soundcloud".equals(type)?name(type)+" · "+id.substring(id.lastIndexOf('/')+1).replace('-',' '):name(type)+" · "+id.replace("channel:","").replace("video:","");
      JSONObject source=new JSONObject().put("type",type).put("videoId",id).put("title",title);
      if(url!=null)source.put("url",url);
      return source;
    }catch(Exception invalid){return null;}
  }
}
