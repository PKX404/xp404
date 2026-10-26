import './protocol.js';
const P=globalThis.XPartyCompanionProtocol;
const pairs=new Map();
let save=Promise.resolve();
const loaded=chrome.storage.session.get('pairs').then(({pairs:stored=[]})=>{
  for(const value of stored)if(Number.isInteger(value.roomTabId)&&Number.isInteger(value.providerTabId)&&P.validCompanionNonce(value.nonce)&&typeof value.roomDocumentId==='string'&&P.sanitizeCompanionSnapshot(value.snapshot,value.snapshot?.sentAt)&&Date.now()-value.lastSeen<15000)pairs.set(value.roomTabId,value);
}).catch(()=>{});
function persist(){const value=[...pairs.values()];save=save.catch(()=>{}).then(()=>chrome.storage.session.set({pairs:value}));return save;}
const sendTab=(tabId,message)=>chrome.tabs.sendMessage(tabId,message,{frameId:0}).catch(()=>{});
function event(pair,report,disconnected=false){return sendTab(pair.roomTabId,{type:'companion-event',nonce:pair.nonce,sourceId:pair.snapshot.sourceId,...(report?{report:{...report,seq:++pair.sequence}}:{}),disconnected});}
function status(pair,value){return event(pair,{kind:'status',status:value,sourceId:pair.snapshot.sourceId});}
async function detach(pair){if(pairs.get(pair.roomTabId)!==pair)return;pairs.delete(pair.roomTabId);await Promise.all([persist(),event(pair,null,true),pair.providerTabId!==null?sendTab(pair.providerTabId,{type:'detach',nonce:pair.nonce}):Promise.resolve()]);}
function validRoomSender(sender){return Number.isInteger(sender.tab?.id)&&sender.frameId===0&&typeof sender.documentId==='string'&&P.isCompanionRoomURL(sender.url);}
function currentPair(message,sender){const pair=pairs.get(sender.tab?.id);return pair&&pair.roomDocumentId===sender.documentId&&message.nonce===pair.nonce&&validRoomSender(sender)?pair:null;}
function providerPair(sender){if(sender.frameId!==0||typeof sender.documentId!=='string')return null;return [...pairs.values()].find(pair=>pair.providerTabId===sender.tab?.id)||null;}
function sameTitle(pair,url){const source=P.parseCompanionLink(url);return source?.type===pair.snapshot.provider&&source?.videoId===pair.snapshot.videoId;}
async function handle(message,sender){
  await loaded;
  for(const pair of pairs.values())if(Date.now()-pair.lastSeen>15000)await detach(pair);
  if(!message||typeof message.type!=='string')return {ok:false};
  const extensionPopup=sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('popup.html');
  if(extensionPopup&&message.type==='popup-status')return {pairs:[...pairs.values()].map(pair=>({roomTabId:pair.roomTabId,provider:pair.snapshot.provider}))};
  if(extensionPopup&&message.type==='popup-disconnect'){const pair=pairs.get(message.roomTabId);if(pair)await detach(pair);return {ok:true};}
  if(message.type==='room-connect'){
    if(!validRoomSender(sender)||!P.validCompanionNonce(message.nonce))return {ok:false};
    const snapshot=P.sanitizeCompanionSnapshot(message.snapshot);if(!snapshot)return {ok:false};
    const old=pairs.get(sender.tab.id);if(old)await detach(old);
    const pair={roomTabId:sender.tab.id,roomDocumentId:sender.documentId,providerTabId:null,providerDocumentId:null,providerSeq:-1,sequence:0,nonce:message.nonce,snapshot,lastSeen:Date.now()};
    pairs.set(pair.roomTabId,pair);
    try{const tab=await chrome.tabs.create({url:snapshot.url,active:true});
      if(pairs.get(pair.roomTabId)!==pair){await chrome.tabs.remove(tab.id);return {ok:false};}
      pair.providerTabId=tab.id;await persist();return {ok:true};
    }catch{await detach(pair);return {ok:false,error:'The browser could not open your service tab.'};}
  }
  if(message.type.startsWith('room-')){
    const pair=currentPair(message,sender);if(!pair)return {ok:false};
    if(message.type==='room-snapshot'){
      const next=P.sanitizeCompanionSnapshot(message.snapshot);
      if(!next||next.sourceId!==pair.snapshot.sourceId||next.provider!==pair.snapshot.provider||next.videoId!==pair.snapshot.videoId||next.url!==pair.snapshot.url)return {ok:false};
      pair.snapshot=next;pair.lastSeen=Date.now();await persist();
      if(pair.providerTabId!==null)await sendTab(pair.providerTabId,{type:'snapshot',nonce:pair.nonce,snapshot:next});return {ok:true};
    }
    if(message.sourceId!==pair.snapshot.sourceId)return {ok:false};
    if(message.type==='room-disconnect'){await detach(pair);return {ok:true};}
    if(message.type==='room-focus'){try{const tab=await chrome.tabs.update(pair.providerTabId,{active:true});await chrome.windows.update(tab.windowId,{focused:true});return {ok:true};}catch{await detach(pair);return {ok:false};}}
    return {ok:false};
  }
  if(message.type==='provider-hello'){
    const pair=providerPair(sender);if(!pair)return {ok:false};
    if(!sameTitle(pair,sender.url)){await status(pair,P.parseCompanionLink(sender.url)?'wrong-title':'waiting-for-video');return {ok:false};}
    if(pair.providerDocumentId!==sender.documentId){pair.providerDocumentId=sender.documentId;pair.providerSeq=-1;}
    await persist();return {ok:true,nonce:pair.nonce,snapshot:pair.snapshot};
  }
  if(message.type==='provider-report'){
    const pair=providerPair(sender);
    if(!pair||pair.nonce!==message.nonce||pair.providerDocumentId!==sender.documentId||!sameTitle(pair,sender.url))return {ok:false};
    const report=P.sanitizeCompanionReport(message.report);
    if(!report||report.sourceId!==pair.snapshot.sourceId||report.seq<=pair.providerSeq)return {ok:false};
    pair.providerSeq=report.seq;await event(pair,report);return {ok:true};
  }
  return {ok:false};
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{handle(message,sender).then(respond).catch(()=>respond({ok:false}));return true;});
chrome.tabs.onRemoved.addListener(tabId=>{loaded.then(async()=>{for(const pair of pairs.values())if(pair.roomTabId===tabId||pair.providerTabId===tabId)await detach(pair);});});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(!change.url)return;loaded.then(async()=>{const pair=pairs.get(tabId);if(pair&&!P.isCompanionRoomURL(change.url))await detach(pair);});});
