import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estimateCF,abilityProfiles,overallAbility} from '../src/backend/ability.js';
import {problemMetadata} from '../src/backend/luogu-metadata.js';
const base={tag_id:'dp',tag_name:'dp',display_name:'动态规划 / Dynamic Programming',passed:1};
function cf(i,rating){return {...base,problem_id:'cf'+i,platform_name:'Codeforces',source_key:i+'A',native_difficulty:String(rating),difficulty_source:'codeforces'};}
test('CF preserves official scores; AT projection and current eight Luogu levels are explicit estimates',()=>{
 assert.deepEqual([1,2,3,4,5,6,7,8].map(n=>estimateCF({platform_name:'洛谷',difficulty_source:'luogu',native_difficulty:String(n)}).rating),[800,1000,1400,1800,2000,2200,2700,3200]);
 assert.equal(estimateCF(cf(1,1800)).rating,1800);assert.equal(estimateCF(cf(1,1800)).estimated,false);
 assert.equal(estimateCF({...cf(1,1200),platform_name:'AtCoder',difficulty_source:'atcoder_problems'}).rating,1600);
 for(const native_difficulty of [null,'',NaN,'oops','0'])assert.equal(estimateCF({platform_name:'洛谷',difficulty_source:'luogu',native_difficulty}).rating,null);
 for(const platform_name of ['QOJ','牛客','LeetCode'])assert.equal(estimateCF({platform_name,native_difficulty:'2000'}).rating,null);
});
test('topic sample is unique, excludes failures, combines sources and does not fall after easy additions',()=>{
 const rows=Array.from({length:30},(_,i)=>cf(i,800+i*100));
 let p=abilityProfiles(rows)[0];assert.equal(p.sample_count,15);assert.equal(p.ability_value,3000);
 p=abilityProfiles([...rows,{...cf(100,4000),passed:0},cf(101,800)])[0];assert.equal(p.ability_value,3000);
 const mirror={...base,problem_id:'luogu',platform_name:'洛谷',source_key:'CF29A',native_difficulty:'8',difficulty_source:'luogu'};
 p=abilityProfiles([...rows,mirror])[0];assert.equal(p.rated_count,30);assert.equal(p.ability_value,3000);
 const lg=abilityProfiles([...rows,mirror],'洛谷')[0];assert.equal(lg.ability_value,246.7);assert.equal(lg.estimated_count,0);
 assert.equal(lg.problems[0].method,'同源 CF 题目官方 rating');
 const unknown={...base,problem_id:'qoj',platform_name:'QOJ'};
 assert.equal(abilityProfiles([unknown])[0].sample_status,'补 15 道零分');
 const part=abilityProfiles([cf(1,1800)])[0];assert.equal(part.sample_status,'补 14 道零分');assert.equal(part.ability_value,120);
});
test('Luogu tags follow explicit algorithm ancestry and exclude source labels; malformed metadata fails',()=>{
 const tags=new Map([[3,{id:3,name:'动态规划 DP',type:2,parent:null}],[139,{id:139,name:'背包 DP',type:2,parent:3}],[20,{id:20,name:'NOIP',type:1}]]);
 const p=problemMetadata({data:{problem:{pid:'P1',difficulty:4,tags:[139,20]}}},'P1',tags);
 assert.deepEqual(p.tags,['背包 DP','动态规划 DP']);assert.equal(p.native,'4');assert.ok(!('time' in p));
 assert.throws(()=>problemMetadata({data:{problem:{pid:'P2',tags:[]}}},'P1',tags));
});
test('overall uses pads to 200 across all problems and deduplicates untagged items and mirrors',()=>{
 const rows=Array.from({length:160},(_,i)=>({...cf(i,800+i*10),tag_id:undefined}));
 const profile=overallAbility(rows);assert.equal(profile.sample_count,160);assert.equal(profile.ability_value,1276);assert.equal(profile.min_difficulty,800);
 assert.equal(profile.sample_status,'补 40 道零分');
 const mirror={...base,problem_id:'lg',platform_name:'洛谷',source_key:'CF159A',native_difficulty:'8',difficulty_source:'luogu'};
 const extra=[...rows,rows[159],mirror,{...cf(999,4000),passed:0},cf(888,800)];
 assert.equal(overallAbility(extra).ability_value,1280);assert.equal(overallAbility(extra).rated_count,161);
 assert.equal(overallAbility(rows.slice(0,2)).sample_status,'补 198 道零分');
 assert.equal(overallAbility([]).ability_value,0);assert.equal(overallAbility([]).sample_count,0);
});
test('the 15% sample rounds up and current ability pads a single dated AC with zeros',()=>{
 const rows=Array.from({length:101},(_,i)=>cf(i,1500));
 assert.equal(abilityProfiles(rows)[0].sample_count,16);
 assert.equal(abilityProfiles(rows.slice(0,100))[0].sample_count,15);
 const profile=abilityProfiles(rows,'全部平台',null,undefined,{day:183,days:new Map([['cf0',[183]]])})[0];
 assert.equal(profile.current_sample_count,1);
 assert.equal(profile.current_sample_limit,15);
 assert.equal(profile.current_value,100);
 const undated=abilityProfiles(rows,'全部平台',null,undefined,{day:183,days:new Map()})[0];
 assert.equal(undated.ability_value,1500);
 assert.equal(undated.current_sample_count,0);
 assert.equal(undated.current_value,null);
});

import {skillSubtreeCounts} from '../src/backend/ability.js';
test('skill subtree counts deduplicate overlapping tags and mirrors, respecting platform and primary edges',()=>{
 const nodes=[
  {id:'root',parent:null},
  {id:'branch',parent:'root'},
  {id:'leaf',parent:'branch'},
  {id:'related',parent:null,secondary:['root']}
 ];
 const cf={platform_name:'Codeforces',source_key:'123A',passed:1};
 const rows=[
  {...cf,tag_name:'root'},{...cf,tag_name:'leaf'},
  {platform_name:'洛谷',source_key:'CF123A',tag_name:'leaf',passed:1},
  {...cf,source_key:'123B',tag_name:'leaf'},
  {...cf,source_key:'123C',tag_name:'related'},
  {...cf,source_key:'123D',tag_name:'leaf',passed:0}
 ];
 const counts=skillSubtreeCounts(rows,nodes);
 assert.deepEqual(counts['全部平台'],{root:2,branch:2,leaf:2,related:1});
 assert.deepEqual(counts['洛谷'],{leaf:1,branch:1,root:1});
});
