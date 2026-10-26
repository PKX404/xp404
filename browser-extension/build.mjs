import {readFile,writeFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/xparty/companion-providers.js',import.meta.url),'utf8');
const names=[...source.matchAll(/export\s+(?:const|function)\s+(\w+)/g)].map(m=>m[1]);
const generated='// Generated from public/xparty/companion-providers.js by build.mjs.\n(()=>{\n'+source.replace(/export\s+(?=const|function)/g,'')+'\nglobalThis.XPartyCompanionProtocol=Object.freeze({'+names.join(',')+'});\n})();\n';
await writeFile(new URL('./protocol.js',import.meta.url),generated);
