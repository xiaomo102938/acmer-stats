import mysql from 'mysql2/promise';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {refreshAccountRating} from '../src/backend/ratings.js';
const c=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,database:process.env.DB_NAME||'acmer_stats'}),original=globalThis.fetch;
try{
 const [[definition]]=await c.query('SHOW CREATE TABLE account_rating');await c.query(definition['Create Table'].replace('CREATE TABLE','CREATE TEMPORARY TABLE').replace(/,\n\s*CONSTRAINT[^\n]+/g,''));const id=randomUUID(),a={account_id:id,platform_name:'Codeforces',login_name:'fixture'};
 await c.execute("INSERT INTO account_rating(account_id,rating,scale,status,fetched_at,last_attempt) VALUES(?,1720,'CF','ok',NOW(),NOW())",[id]);
 globalThis.fetch=async()=>new Response('',{status:403});await refreshAccountRating(c,a);
 let [[row]]=await c.execute('SELECT rating,status,fetched_at FROM account_rating WHERE account_id=?',[id]);assert.equal(Number(row.rating),1720);assert.equal(row.status,'error');assert.ok(row.fetched_at);
 globalThis.fetch=async()=>new Response(JSON.stringify({status:'OK',result:[{rating:0}]}),{headers:{'Content-Type':'application/json'}});await refreshAccountRating(c,a);
 [[row]]=await c.execute('SELECT rating,status FROM account_rating WHERE account_id=?',[id]);assert.equal(Number(row.rating),0);assert.equal(row.status,'ok');
 console.log('PASS: temporary-table integration preserves cached rating on source failure and stores valid zero on refresh');
}finally{globalThis.fetch=original;await c.end();}
