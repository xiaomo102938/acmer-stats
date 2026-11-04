import test from 'node:test';
import assert from 'node:assert/strict';
import {nowcoderUid,syncSetup} from '../src/shared/account-config.js';
import {readNowcoderPage,parseAcceptedPage} from '../src/backend/adapters.js';
const url='https://ac.nowcoder.com/acm/contest/profile/123/practice-coding';
test('Nowcoder UID accepts profile links only from the intended platform',()=>{
 for(const text of ['123','https://ac.nowcoder.com/acm/contest/profile/123/practice-coding','https://www.nowcoder.com/users/123','https://www.nowcoder.com/profile/123?from=home'])assert.equal(nowcoderUid(text),'123');
 for(const text of ['xiaomo102938','https://evil.com/profile/123','https://nowcoder.com.evil.com/profile/123','javascript:123','https://www.nowcoder.com/practice/123'])assert.equal(nowcoderUid(text),null);
 assert.equal(syncSetup({platform_name:'QOJ',has_secret:0}).ready,false);
 assert.equal(syncSetup({platform_name:'QOJ',has_secret:1}).ready,true);
 assert.equal(syncSetup({platform_name:'牛客',remote_uid:'123',has_secret:0}).ready,true);
});
test('Nowcoder public sync does not send saved credentials unnecessarily',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(u,opts)=>{calls.push(opts.headers);return new Response('<p>暂无记录</p>');});
 const result=await readNowcoderPage(url,'session=fixture');
 assert.equal(result.usedCookie,false);assert.equal(calls.length,1);assert.equal(calls[0].Cookie,undefined);
});
test('Nowcoder requests use the saved cookie only after a login response',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(u,opts)=>{calls.push(opts.headers);return calls.length===1?new Response('<input type="password">'):new Response('<p>暂无记录</p>');});
 const result=await readNowcoderPage(url,'session=fixture');
 assert.equal(result.usedCookie,true);assert.equal(calls.length,2);assert.equal(calls[0].Cookie,undefined);assert.equal(calls[1].Cookie,'session=fixture');
});
test('Missing or expired cookies show an actionable error; rate limits do not trigger auth retries',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('<input type="password">');});
 await assert.rejects(readNowcoderPage(url),/填写 Cookie/);assert.equal(calls,1);
 calls=0;await assert.rejects(readNowcoderPage(url,'session=fixture'),/失效/);assert.equal(calls,2);
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('',{status:429});});
 calls=0;await assert.rejects(readNowcoderPage(url,'session=fixture'),e=>e.code==='rate_limited');assert.equal(calls,1);
});
test('Captcha library names in a normal Nowcoder page do not hide real accepted records',()=>{
 const html='<title>公开练习</title><script>window.useNeteaseCaptcha=true;</script><table><tr><td><a href="/acm/contest/view-submission?submissionId=12345">12345</a></td><td><a href="/acm/problem/321359">Example</a></td><td>答案正确</td><td>2026-08-16 19:18:20</td></tr></table>';
 const rows=parseAcceptedPage(html,'牛客','fixture');assert.equal(rows.length,1);assert.equal(rows[0].id,'12345');
 assert.throws(()=>parseAcceptedPage('<title>Just a moment</title><form id="challenge-form">Checking</form>','牛客','fixture'));
});

test('Cloudflare browser challenges are distinct from expired login cookies',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('<title>Just a moment...</title>',{status:403,headers:{'cf-mitigated':'challenge'}});});
 await assert.rejects(readNowcoderPage(url,'session=fixture'),error=>error.code==='browser_challenge'&&/不能据此判断 Cookie/.test(error.message));
 assert.equal(calls,1);
});

test('Windows proxy mode respects enabled state and per-protocol servers',async()=>{
 const {windowsProxy}=await import('../src/backend/qoj-network.js');
 assert.equal(windowsProxy('ProxyEnable REG_DWORD 0x0\nProxyServer REG_SZ 127.0.0.1:7890'),'');
 assert.equal(windowsProxy('ProxyEnable REG_DWORD 0x1\nProxyServer REG_SZ 127.0.0.1:7890'),'http://127.0.0.1:7890');
 assert.equal(windowsProxy('ProxyEnable REG_DWORD 0x1\nProxyServer REG_SZ http=host:80;https=secure:81'),'http://secure:81');
});

test('Native QOJ transport preserves headers and status without following redirects', {skip:process.platform!=='win32'},async()=>{
 const {createServer}=await import('node:http');const {qojFetch}=await import('../src/backend/qoj-network.js');
 const received=[];const server=createServer((req,res)=>{received.push(req.headers.cookie);if(req.url==='/redirect'){res.writeHead(302,{Location:'/private'});res.end();}else{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<p>AC ✓</p>');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const r=await qojFetch(base,{qojProxy:'',headers:{Cookie:'session=fixture'}});assert.equal(r.status,200);assert.equal(await r.text(),'<p>AC ✓</p>');
  const redirect=await qojFetch(base+'/redirect',{qojProxy:'',headers:{Cookie:'session=fixture'}});assert.equal(redirect.status,302);assert.equal(received.length,2);assert.deepEqual(received,['session=fixture','session=fixture']);
 }finally{await new Promise(r=>server.close(r));}
});
