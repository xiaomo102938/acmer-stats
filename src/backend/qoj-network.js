import {ProxyAgent} from 'undici';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),agents=new Map();
export function windowsProxy(text){
 if(!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(text))return '';
 const value=text.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i)?.[1]?.trim()||'';
 const selected=value.includes('=')?value.split(';').map(s=>s.trim()).find(s=>s.startsWith('https='))?.slice(6)||value.split(';').map(s=>s.trim()).find(s=>s.startsWith('http='))?.slice(5)||'':value;
 return selected?(/^https?:\/\//i.test(selected)?selected:'http://'+selected):'';
}
export async function qojTransport(){
 let uri=process.env.QOJ_PROXY_URL?.trim()||'';
 if(uri==='system'){
  uri='';
  if(process.platform==='win32'){
   const {stdout}=await run('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],{windowsHide:true,timeout:5000});
   uri=windowsProxy(stdout);
  }
 }
 if(uri){const u=new URL(uri);if(!['http:','https:'].includes(u.protocol))throw new Error('Invalid QOJ proxy protocol');}
 if(process.env.QOJ_HTTP_TRANSPORT==='curl')return {qojProxy:uri};
 if(!uri)return {};
 if(!agents.has(uri))agents.set(uri,new ProxyAgent(uri));
 return {dispatcher:agents.get(uri)};
}

export async function qojFetch(url,options){
 if(!Object.hasOwn(options,'qojProxy'))return fetch(url,options);
 const quote=value=>'"'+String(value).replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
 const config=['url = '+quote(url),'proxy = '+quote(options.qojProxy),'silent','show-error','include','suppress-connect-headers','max-time = 20'];
 for(const [name,value] of Object.entries(options.headers))config.push('header = '+quote(name+': '+value));
 return new Promise((resolve,reject)=>{
  const child=spawn('curl.exe',['--config','-'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const chunks=[];let bytes=0;
  child.on('error',()=>reject(new Error('QOJ HTTP client unavailable')));
  child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>8*1024*1024){child.kill();reject(new Error('QOJ response too large'));}else chunks.push(chunk);});
  child.stderr.resume();child.stdin.on('error',()=>{});
  child.on('close',code=>{
   if(code!==0)return reject(new Error('QOJ network request failed'));
   const raw=Buffer.concat(chunks).toString('utf8'),end=raw.indexOf('\r\n\r\n');
   if(end<0)return reject(new Error('Invalid QOJ HTTP response'));
   const lines=raw.slice(0,end).split('\r\n'),status=Number(lines.shift()?.match(/^HTTP\/\S+ (\d+)/)?.[1]),headers=new Headers();
   for(const line of lines){const i=line.indexOf(':');if(i>0)headers.append(line.slice(0,i),line.slice(i+1).trim());}
   resolve(new Response(raw.slice(end+4),{status,headers}));
  });
  child.stdin.end(config.join('\n'));
 });
}
