import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:3000')+'/api/accounts';
const headers={'Content-Type':'application/json','X-Acmer-Request':'1'};
const state=await(await fetch(base)).json();
const platform=state.platforms.find(p=>p.platform_name==='QOJ');
const login='test-'+randomUUID().slice(0,8);
let id;
try{
 const create=await fetch(base,{method:'POST',headers,body:JSON.stringify({platform_id:platform.platform_id,login_name:login,cookie:'session=fixture-secret'})});
 assert.equal(create.status,201);id=(await create.json()).account_id;
 const listed=await(await fetch(base)).json();
 const account=listed.accounts.find(a=>a.account_id===id);
 assert.equal(account.has_secret,1);assert.equal(account.login_pwd,undefined);
 assert.ok(!JSON.stringify(listed).includes('fixture-secret'));
 const duplicate=await fetch(base,{method:'POST',headers,body:JSON.stringify({platform_id:platform.platform_id,login_name:login})});assert.equal(duplicate.status,409);
 const update=await fetch(base+'/'+id,{method:'PUT',headers,body:JSON.stringify({login_name:login,remove_cookie:true})});assert.equal(update.status,200);
 const after=await(await fetch(base)).json();assert.equal(after.accounts.find(a=>a.account_id===id).has_secret,0);
 const sync=await fetch(base+'/'+id+'/sync',{method:'POST',headers,body:'{}'});assert.equal(sync.status,400);
 const noHeader=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(noHeader.status,403);
 const foreign=await fetch(base,{method:'POST',headers:{...headers,Origin:'https://example.com'},body:'{}'});assert.equal(foreign.status,403);
 console.log('PASS: account binding, duplicate prevention, Cookie editing/redaction, missing-session handling and request-origin checks');
}finally{
 if(id){const deleted=await fetch(base+'/'+id,{method:'DELETE',headers});assert.equal(deleted.status,200);}
}
