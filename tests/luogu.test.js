import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLuoguPayload,normalizeLuogu,LuoguError} from '../src/backend/luogu.js';
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
