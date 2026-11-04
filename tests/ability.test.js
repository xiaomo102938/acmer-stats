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
test('top25 is unique, excludes failures, combines sources and does not fall after easy additions',()=>{
 const rows=Array.from({length:30},(_,i)=>cf(i,800+i*100));
 let p=abilityProfiles(rows)[0];assert.equal(p.sample_count,25);assert.equal(p.ability_value,2500);
 p=abilityProfiles([...rows,{...cf(100,4000),passed:0},cf(101,800)])[0];assert.equal(p.ability_value,2500);
 const mirror={...base,problem_id:'luogu',platform_name:'洛谷',source_key:'CF29A',native_difficulty:'8',difficulty_source:'luogu'};
 p=abilityProfiles([...rows,mirror])[0];assert.equal(p.rated_count,30);assert.equal(p.ability_value,2500);
 const lg=abilityProfiles([...rows,mirror],'洛谷')[0];assert.equal(lg.ability_value,3700);assert.equal(lg.estimated_count,0);
 assert.equal(lg.problems[0].method,'同源 CF 题目官方 rating');
 const unknown={...base,problem_id:'qoj',platform_name:'QOJ'};
 assert.equal(abilityProfiles([unknown])[0].sample_status,'暂无有效评分');
 const part=abilityProfiles([cf(1,1800)])[0];assert.equal(part.sample_status,'样本不足');assert.equal(part.ability_value,1800);
});
test('Luogu tags follow explicit algorithm ancestry and exclude source labels; malformed metadata fails',()=>{
 const tags=new Map([[3,{id:3,name:'动态规划 DP',type:2,parent:null}],[139,{id:139,name:'背包 DP',type:2,parent:3}],[20,{id:20,name:'NOIP',type:1}]]);
 const p=problemMetadata({data:{problem:{pid:'P1',difficulty:4,tags:[139,20]}}},'P1',tags);
 assert.deepEqual(p.tags,['背包 DP','动态规划 DP']);assert.equal(p.native,'4');assert.ok(!('time' in p));
 assert.throws(()=>problemMetadata({data:{problem:{pid:'P2',tags:[]}}},'P1',tags));
});
test('overall uses top150 across all problems including untagged items, merges mirrors and ignores easy additions',()=>{
 const rows=Array.from({length:160},(_,i)=>({...cf(i,800+i*10),tag_id:undefined}));
 const profile=overallAbility(rows);assert.equal(profile.sample_count,150);assert.equal(profile.ability_value,1645);assert.equal(profile.min_difficulty,900);
 assert.equal(profile.sample_status,'满150题');
 const mirror={...base,problem_id:'lg',platform_name:'洛谷',source_key:'CF159A',native_difficulty:'8',difficulty_source:'luogu'};
 const extra=[...rows,rows[159],mirror,{...cf(999,4000),passed:0},cf(888,800)];
 assert.equal(overallAbility(extra).ability_value,1645);assert.equal(overallAbility(extra).rated_count,161);
 assert.equal(overallAbility(rows.slice(0,2)).sample_status,'样本不足');
 assert.equal(overallAbility([]).ability_value,null);assert.equal(overallAbility([]).sample_count,0);
});
