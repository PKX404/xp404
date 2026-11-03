package com.pkx404.xparty.nativeapp;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class NativeUi {
    public static final int BG=Color.rgb(15,12,23),SURFACE=Color.rgb(31,25,41),PANEL=Color.rgb(44,33,54);
    public static final int WHITE=Color.rgb(247,245,250),FAINT=Color.rgb(180,171,196),PURPLE=Color.rgb(197,158,243);
    public static int dp(Context c,float v){return Math.round(v*c.getResources().getDisplayMetrics().density);}
    public static GradientDrawable shape(int color,int radius,Context c){
        GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(c,radius));return d;
    }
    public static LinearLayout vertical(Context c){LinearLayout l=new LinearLayout(c);l.setOrientation(LinearLayout.VERTICAL);return l;}
    public static LinearLayout horizontal(Context c){LinearLayout l=new LinearLayout(c);l.setGravity(Gravity.CENTER_VERTICAL);return l;}
    public static TextView text(Context c,String value,int sp,boolean bold){
        TextView t=new TextView(c);t.setText(value);t.setTextSize(sp);t.setTextColor(WHITE);
        if(bold)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD);t.setGravity(Gravity.CENTER_VERTICAL);return t;
    }
    public static TextView label(Context c,String value,int sp){TextView t=text(c,value,sp,false);t.setTextColor(FAINT);return t;}
    public static TextView icon(Context c,String value,Runnable action){
        TextView t=text(c,value,25,false);t.setGravity(Gravity.CENTER);
        t.setMinWidth(dp(c,44));t.setMinHeight(dp(c,44));
        t.setContentDescription(value);
        t.setOnClickListener(v->action.run());return t;
    }
    public static Button button(Context c,String value,Runnable action){
        Button b=new Button(c);b.setAllCaps(false);b.setText(value);b.setTextColor(WHITE);b.setTextSize(14);
        b.setBackground(shape(PANEL,12,c));b.setOnClickListener(v->action.run());return b;
    }
    public static EditText edit(Context c,String hint){
        EditText t=new EditText(c);t.setSingleLine(true);t.setTextSize(15);t.setTextColor(WHITE);
        t.setHintTextColor(FAINT);t.setHint(hint);
        t.setBackground(shape(SURFACE,12,c));t.setPadding(dp(c,15),0,dp(c,15),0);
        t.setMinHeight(dp(c,46));return t;
    }
    public static LinearLayout.LayoutParams lp(Context c,int w,int h){return new LinearLayout.LayoutParams(w<0?w:dp(c,w),h<0?h:dp(c,h));}
    public static void space(Context c,LinearLayout l,int size){View v=new View(c);l.addView(v,lp(c,1,size));}
    public static void margin(Context c,View v,LinearLayout parent,int top,int bottom){
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);
        p.setMargins(0,dp(c,top),0,dp(c,bottom));parent.addView(v,p);
    }
}
