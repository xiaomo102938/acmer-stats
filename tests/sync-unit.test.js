import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {normalizeCF,normalizeAtCoder,parseAcceptedPage,collect,SourceError} from '../src/backend/adapters.js';
import {encrypt,decrypt} from '../src/backend/secrets.js';
process.env.ACCOUNT_SECRET_KEY=randomBytes(32).toString('hex');
test('Cookie encryption is random, authenticated and reversible',()=>{
 const a=encrypt('session=example'),b=encrypt('session=example');
 assert.notDeepEqual(a,b);assert.equal(decrypt(a),'session=example');
 const changed=Buffer.from(a);changed[14]^=1;assert.throws(()=>decrypt(changed));
 assert.equal(encrypt(''),null);assert.equal(decrypt(null),'');
});
test('CF keeps native difficulty and differentiates accepted and pending verdicts',()=>{
 const base={id:12,creationTimeSeconds:1700000000,problem:{contestId:1,index:'A',name:'Example',rating:800,tags:['math']}};
 assert.equal(normalizeCF({...base,verdict:'OK'}).passed,1);
 assert.equal(normalizeCF({...base,verdict:'WRONG_ANSWER'}).passed,0);
 assert.equal(normalizeCF({...base,verdict:'TESTING'}),null);
 assert.equal(normalizeCF({...base,verdict:'OK'}).native,'800');
});
test('AtCoder keeps stable submission ids',()=>{
 const row=normalizeAtCoder({id:42,epoch_second:1700000000,problem_id:'abc001_a',contest_id:'abc001',result:'AC'});
 assert.equal(row.id,'42');assert.equal(row.key,'abc001_a');assert.equal(row.passed,1);
});
test('QOJ parses only explicit accepted submissions with stable ids and dates',()=>{
 const html='<table><tr><td><a href="/submission/123">123</a></td><td>2026-10-01 12:30:00</td><td><a href="/problem/7">Title</a></td><td>100</td></tr><tr><td><a href="/submission/124">124</a></td><td>2026-10-01 13:30:00</td><td><a href="/problem/7">Title</a></td><td>50</td></tr></table>';
 const rows=parseAcceptedPage(html,'QOJ','example');
 assert.equal(rows.length,1);assert.equal(rows[0].id,'123');assert.equal(rows[0].key,'7');assert.equal(rows[0].passed,1);
});
test('QOJ login and protection pages fail rather than returning empty success',()=>{
 assert.throws(()=>parseAcceptedPage('<input type="password">','QOJ','example'),SourceError);
 assert.throws(()=>parseAcceptedPage('<title>Just a moment...</title>','QOJ','example'),SourceError);
 assert.throws(()=>parseAcceptedPage('<h1>Unknown response</h1>','QOJ','example'),SourceError);
});
test('QOJ does not fabricate ids for unrecognized accepted rows',()=>{
 assert.throws(()=>parseAcceptedPage('<table><tr><td>2026-10-01 12:30:00</td><td><a href="/problem/7">Title</a></td><td>100</td></tr></table>','QOJ','example'),SourceError);
});
test('QOJ requires a cookie before making requests',async()=>{
 await assert.rejects(collect({platform_name:'QOJ',login_name:'example'}),/Cookie/);
});

test('Nowcoder uses real submission ids and preserves contest problem keys',()=>{
 const html='<table><tr><td>12345</td><td><a href="/acm/contest/123/A">Example</a></td><td>答案正确</td><td>C++</td><td>2026-10-01 12:30:00</td></tr></table>';
 const rows=parseAcceptedPage(html,'牛客','example');
 assert.equal(rows.length,1);assert.equal(rows[0].key,'123/A');assert.equal(rows[0].id,'12345');
});
test('Unrelated tables are not treated as empty submission histories',()=>{
 assert.throws(()=>parseAcceptedPage('<table><tr><td>unrelated</td></tr></table>','QOJ','example'),SourceError);
});

test('QOJ current AC checkmark and saved absolute contest links preserve real submission ids',()=>{
 const row=(id,verdict)=>`<tr><td><a href="https://qoj.ac/submission/${id}">#${id}</a></td><td><a href="https://qoj.ac/contest/42/problem/7">Example</a></td><td><a href="https://qoj.ac/submission/${id}">${verdict}</a></td><td>2026-10-01 12:30:00</td></tr>`;
 const rows=parseAcceptedPage('<table>'+row(123,'AC ✓')+row(124,'WA')+row(125,'ML')+row(126,'Not AC ✓')+'</table>','QOJ','example');
 assert.equal(rows.length,1);assert.equal(rows[0].id,'123');assert.equal(rows[0].key,'7');
});

test('QOJ submission history retains judged failures and excludes pending or unknown results',()=>{
 const row=(id,v)=>`<tr><td><a href="/submission/${id}">${id}</a></td><td><a href="/problem/7">Example</a></td><td>example</td><td>${v}</td><td>2026-10-01 12:30:00</td></tr>`;
 const html='<table>'+row(1,'AC ✓')+row(2,'WA')+row(3,'ML')+row(4,'Judging')+row(5,'unknown')+'</table>';
 const rows=parseAcceptedPage(html,'QOJ','example',true);
 assert.deepEqual(rows.map(r=>[r.id,r.passed,r.verdict]),[['1',1,'AC'],['2',0,'WA'],['3',0,'ML']]);
 assert.equal(parseAcceptedPage(html,'QOJ','example').length,1);
 assert.equal(normalizeCF({id:10,creationTimeSeconds:1700000000,problem:{contestId:1,index:'A',name:'X'},verdict:'TIME_LIMIT_EXCEEDED'}).verdict,'TIME_LIMIT_EXCEEDED');
 assert.equal(normalizeAtCoder({id:10,epoch_second:1700000000,problem_id:'abc001_a',contest_id:'abc001',result:'WA'}).verdict,'WA');
});
