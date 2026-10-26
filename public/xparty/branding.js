// Supplied official artwork, preserved unchanged.
export function applyBranding(){
 const image=(className)=>{const img=document.createElement('img');img.src='/xparty/xparty-official-20261026.png';img.alt='Xparty';img.className=className;img.decoding='async';return img;};
 document.querySelector('.topbar .brand')?.replaceChildren(image('official-wordmark'));
 const hero=document.querySelector('.hero-brand');if(hero){const credit=hero.querySelector('.crafted-shadow');hero.replaceChildren(image('official-wordmark hero-wordmark'));if(credit)hero.append(credit);}
 const room=document.querySelector('.mobile-room-brand');if(room)room.replaceChildren(image('official-wordmark room-wordmark'));
 let favicon=document.querySelector('link[rel=icon]');if(!favicon){favicon=document.createElement('link');favicon.rel='icon';document.head.append(favicon);}favicon.type='image/png';favicon.href='/xparty/xparty-favicon-20261026.png';
}
