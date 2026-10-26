import {readFile} from 'node:fs/promises';
export {normalizeCompanionSource} from './public/xparty/companion-providers.js';

const files=['manifest.json','protocol.js','room-bridge.js','provider.js','worker.js','popup.html','popup.css','popup.js','README.md'];
function crc32(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;}
// Fixed file list and uncompressed ZIP: no user path, shell, dependency or remote download.
export async function companionExtensionZip() {
  const local=[],directory=[];let offset=0;
  for(const name of files){
    const bytes=await readFile(new URL('./browser-extension/'+name,import.meta.url));
    const path=Buffer.from('xparty-companion/'+name),checksum=crc32(bytes);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);header.writeUInt32LE(checksum,14);header.writeUInt32LE(bytes.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(path.length,26);
    local.push(header,path,bytes);
    const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(33,14);entry.writeUInt32LE(checksum,16);entry.writeUInt32LE(bytes.length,20);entry.writeUInt32LE(bytes.length,24);entry.writeUInt16LE(path.length,28);entry.writeUInt32LE(offset,42);directory.push(entry,path);
    offset+=header.length+path.length+bytes.length;
  }
  const body=Buffer.concat(local),index=Buffer.concat(directory),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(body.length,16);
  return Buffer.concat([body,index,end]);
}
export async function handleCompanionDownload(req,res,url) {
  if(url.pathname!=='/companion-extension.zip')return false;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return true;}
  try{const zip=await companionExtensionZip();res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="xparty-companion.zip"','Content-Length':zip.length,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:zip);}
  catch{res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('The companion download is being prepared. Please retry.');}
  return true;
}
