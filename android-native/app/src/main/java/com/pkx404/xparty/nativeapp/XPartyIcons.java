package com.pkx404.xparty.nativeapp;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Color;
import android.widget.TextView;

/**
 * Original-style line icons. Native Canvas drawing instead of emoji glyphs,
 * blurry circles or web icon fonts.
 */
public final class XPartyIcons extends TextView {
    public XPartyIcons(Context context) {
        super(context);
        setGravity(android.view.Gravity.CENTER);
        setTextColor(Color.WHITE);
        setIncludeFontPadding(false);
    }

    private static void line(Canvas canvas,Paint paint,float... xy) {
        Path path=new Path();
        path.moveTo(xy[0],xy[1]);
        for(int i=2;i<xy.length;i+=2)path.lineTo(xy[i],xy[i+1]);
        canvas.drawPath(path,paint);
    }
    private static void circle(Canvas canvas,Paint paint,float x,float y,float r){canvas.drawCircle(x,y,r,paint);}
    private static void shape(Canvas canvas,Paint paint,String type) {
        Path path=new Path();
        switch(type) {
            case "×":
                line(canvas,paint,5,5,19,19);
                line(canvas,paint,19,5,5,19);break;
            case "⚙":
                circle(canvas,paint,12,12,7.1f);
                circle(canvas,paint,12,12,2.9f);
                for(int a=0;a<8;a++) {
                    double rad=a*Math.PI/4;
                    line(canvas,paint,(float)(12+8.1*Math.cos(rad)),(float)(12+8.1*Math.sin(rad)),
                        (float)(12+10*Math.cos(rad)),(float)(12+10*Math.sin(rad)));
                }break;
            case "⚿":
                circle(canvas,paint,8,8,5);
                circle(canvas,paint,8,8,1.4f);
                line(canvas,paint,11.6f,11.6f,21,21,21,17,18.5f,17,18.5f,19);break;
            case "⌕":
                circle(canvas,paint,10.3f,10.3f,6.5f);
                line(canvas,paint,15.2f,15.2f,21.2f,21.2f);break;
            case "↗":
                circle(canvas,paint,6,12,2.6f);
                circle(canvas,paint,18.5f,5.5f,2.6f);
                circle(canvas,paint,18.5f,18.5f,2.6f);
                line(canvas,paint,8.6f,10.8f,15.9f,6.6f);
                line(canvas,paint,8.6f,13.2f,15.9f,17.4f);break;
            case "♧":
                circle(canvas,paint,12,7.5f,4.1f);
                path.moveTo(3.5f,21);path.lineTo(3.5f,19);
                path.cubicTo(3.5f,10.5f,20.5f,10.5f,20.5f,19);
                path.lineTo(20.5f,21);canvas.drawPath(path,paint);break;
            case "⛶":
                line(canvas,paint,4,9,4,4,9,4);
                line(canvas,paint,15,4,20,4,20,9);
                line(canvas,paint,20,15,20,20,15,20);
                line(canvas,paint,9,20,4,20,4,15);break;
            case "⤢":
                line(canvas,paint,5,10,5,5,10,5);
                line(canvas,paint,5,5,10,10);
                line(canvas,paint,14,14,19,19,19,14);
                line(canvas,paint,19,19,14,19);break;
            case "♡":
            case "♥":
                path.moveTo(12,21);
                path.cubicTo(7,17,2.4f,13.5f,2.4f,8.7f);
                path.cubicTo(2.4f,4,8.3f,2.4f,12,6.4f);
                path.cubicTo(15.7f,2.4f,21.6f,4,21.6f,8.7f);
                path.cubicTo(21.6f,13.5f,17,17,12,21);
                path.close();
                if(type.equals("♥")){paint.setStyle(Paint.Style.FILL);canvas.drawPath(path,paint);paint.setStyle(Paint.Style.STROKE);}
                else canvas.drawPath(path,paint);break;
            case "◖))":
                line(canvas,paint,3,9,7,9,12,5,12,19,7,15,3,15,3,9);
                path.moveTo(15,8);path.cubicTo(17,10,17,14,15,16);canvas.drawPath(path,paint);
                path.reset();path.moveTo(18,5);path.cubicTo(22,9,22,15,18,19);canvas.drawPath(path,paint);break;
            case "♩":
                path.moveTo(9,6);path.cubicTo(9,2,15,2,15,6);
                path.lineTo(15,12);path.cubicTo(15,16,9,16,9,12);path.close();
                canvas.drawPath(path,paint);
                path.reset();path.moveTo(5.5f,11);path.cubicTo(5,17,19,18,18.5f,11);canvas.drawPath(path,paint);
                line(canvas,paint,12,17,12,21);
                line(canvas,paint,8,21,16,21);
                line(canvas,paint,4,4,20,20);break;
            case "☺":
                circle(canvas,paint,12,12,9);
                Paint fill=new Paint(paint);fill.setStyle(Paint.Style.FILL);
                circle(canvas,fill,9,10,1.2f);circle(canvas,fill,15,10,1.2f);
                path.moveTo(7.5f,14);path.cubicTo(10,18,14,18,16.5f,14);canvas.drawPath(path,paint);break;
            case "▣":
                canvas.drawRoundRect(new RectF(2.5f,6.4f,15.4f,17.6f),2,2,paint);
                line(canvas,paint,15.4f,10,21,6.5f,21,17.5f,15.4f,14);break;
            case "+":
                line(canvas,paint,12,3.5f,12,20.5f);
                line(canvas,paint,3.5f,12,20.5f,12);break;
            case "▶":
                line(canvas,paint,5.5f,3.8f,19,12,5.5f,20.2f,5.5f,3.8f);break;
            case "Ⅱ":
                line(canvas,paint,8,5,8,19);
                line(canvas,paint,16,5,16,19);break;
            case "➤":
                line(canvas,paint,3,4,21,12,3,20,7,12,3,4);
                line(canvas,paint,7,12,21,12);break;
            case "⏭":
                line(canvas,paint,2,4,11,12,2,20,2,4);
                line(canvas,paint,11,4,20,12,11,20,11,4);
                line(canvas,paint,21,4,21,20);break;
            case "ⓘ":
                circle(canvas,paint,12,12,9);
                line(canvas,paint,12,11,12,17);
                circle(canvas,paint,12,7.7f,0.8f);break;
            default:break;
        }
    }
    private static boolean isIcon(String value) {
        switch(value) {
            case "×":case "⚙":case "⚿":case "⌕":case "↗":case "♧":
            case "⛶":case "⤢":case "♡":case "♥":case "◖))":case "♩":
            case "☺":case "▣":case "+":case "▶":case "Ⅱ":case "➤":case "⏭":case "ⓘ":
                return true;
            default:return false;
        }
    }
    @Override protected void onDraw(Canvas canvas) {
        String icon=getText().toString();
        if(!isIcon(icon)){super.onDraw(canvas);return;}
        float size=Math.min(getWidth(),getHeight())*0.55f;
        float unit=size/24f;
        canvas.save();
        canvas.translate((getWidth()-size)/2f,(getHeight()-size)/2f);
        canvas.scale(unit,unit);
        Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(getCurrentTextColor());
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2.15f);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
        shape(canvas,paint,icon);
        canvas.restore();
    }
}
