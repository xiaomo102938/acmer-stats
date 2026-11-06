import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLuoguPayload,normalizeLuogu,normalizeLuoguAccepted,collectLuoguAccepted,LuoguError} from '../src/backend/luogu.js';
const profile={status:200,data:{user:{uid:123,name:'example',passedProblemCount:1,submittedProblemCount:2},dailyCounts:{'2026-01-01':[3,5],'2026-02-30':[99,1],'2099-01-01':[10,1]}}};
test('Luogu inventory is deduplicated and never invents submission dates or IDs',()=>{
 const data=normalizeLuogu(profile,{data:{user:{uid:123},passed:[{pid:'P1',name:'A',difficulty:3},{pid:'P1',name:'A',difficulty:3}],submitted:[{pid:'P1'},{pid:'P2'}]}},'2026-11-03');
 assert.equal(data.inventory.length,2);assert.equal(data.passedCount,1);assert.equal(data.attemptedCount,2);
 assert.equal(data.inventory.find(p=>p.key==='P1').passed,1);
 assert.equal(data.inventory.find(p=>p.key==='P2').native,null);
 assert.equal(data.inventory[0].time,undefined);assert.equal(data.inventory[0].id,undefined);
 assert.deepEqual(data.activity,[{day:'2026-01-01',count:3}]);
});
test('Luogu payload supports JSON and encoded legacy loaders without executing script',()=>{
 assert.equal(parseLuoguPayload(JSON.stringify(profile)).data.user.uid,123);
 assert.equal(parseLuoguPayload('decodeURIComponent('+JSON.stringify(encodeURIComponent(JSON.stringify(profile)))+')').data.user.uid,123);
 assert.throws(()=>parseLuoguPayload('<h1>验证码</h1>'),LuoguError);
});
test('restricted, missing or mismatched practice data fails explicitly',()=>{
 assert.throws(()=>normalizeLuogu(profile,{data:{}},'2026-11-03'),LuoguError);
 assert.throws(()=>normalizeLuogu(profile,{data:{user:{uid:999},passed:[],submitted:[]}},'2026-11-03'),LuoguError);
 assert.throws(()=>normalizeLuogu(profile,{data:{passed:['../escape'],submitted:[]}},'2026-11-03'),LuoguError);
});

test('Luogu keeps each dated AC, verifies ownership and excludes failures',()=>{
 const row={id:10,status:12,user:{uid:123},submitTime:100,problem:{pid:'P1',name:'A',difficulty:3}};
 const payload={data:{records:{count:3,perPage:20,result:[row,{...row,id:11,submitTime:150},{...row,id:12,status:7}]}}};
 const parsed=normalizeLuoguAccepted(payload,'123',200);
 assert.deepEqual(parsed.items.map(({id,key,time,verdict})=>[id,key,time,verdict]),[['10','P1',100,'AC'],['11','P1',150,'AC']]);
 assert.throws(()=>normalizeLuoguAccepted(payload,'456',200),LuoguError);
 assert.throws(()=>normalizeLuoguAccepted(payload,'123',-300),LuoguError);
});
test('Luogu checks the page after the saved AC and reads all available pages in rescan mode',async t=>{
 const requested=[];
 t.mock.method(globalThis,'setTimeout',callback=>queueMicrotask(callback));
 t.mock.method(globalThis,'fetch',async url=>{
  const page=Number(new URL(url).searchParams.get('page'));
  requested.push(page);
  return Response.json({data:{records:{count:4,perPage:1,result:[
   {id:5-page,status:12,user:{uid:123},submitTime:100,problem:{pid:'P1'}}
  ]}}});
 });
 assert.deepEqual((await collectLuoguAccepted('123','session=example','4')).items.map(row=>row.id),['4','3']);
 assert.deepEqual(requested,[1,2]);
 requested.length=0;
 assert.equal((await collectLuoguAccepted('123','session=example')).items.length,4);
 assert.deepEqual(requested,[1,2,3,4]);
});
