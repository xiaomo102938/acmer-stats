import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const response=await fetch(base+'/api/dashboard');assert.equal(response.status,200);const d=await response.json();
assert.equal(d.ratingVersion,'acmer-cf-v2');
for(const profile of d.tagAbility.filter(p=>p.sample_count>0)){
 const res=await fetch(base+'/api/tags/'+profile.tag_id+'/ability?platform='+encodeURIComponent(profile.platform_name));assert.equal(res.status,200);
 const {problems}=await res.json();assert.equal(problems.length,profile.sample_count);
 assert.equal(new Set(problems.map(p=>p.canonical_key)).size,problems.length,'same-origin mirrors count only once');
 assert.ok(problems.every(p=>p.passed===1&&p.rating>=800&&p.method&&p.confidence));
 assert.equal(Math.round(problems.reduce((s,p)=>s+p.rating,0)/profile.sample_limit*10)/10,profile.ability_value);
 assert.equal(problems.filter(p=>p.estimated).length,profile.estimated_count);
 assert.equal(Math.min(...problems.map(p=>p.rating)),profile.min_difficulty);
 assert.equal(Math.max(...problems.map(p=>p.rating)),profile.max_difficulty);
}
assert.ok(d.tagAbility.some(p=>p.platform_name==='全部平台'&&p.sample_count>=20));
assert.ok(d.tagAbility.some(p=>p.platform_name==='洛谷'&&p.sample_count>0));
assert.ok(d.tags.some(p=>p.tag_name==='dp'&&p.display_name==='动态规划 / Dynamic Programming'));
assert.ok(!d.tags.some(p=>p.tag_name==='动态规划 dp'));
console.log('PASS: every CF-scale profile matches its dynamic sample, canonical deduplication, source evidence, estimate count and Luogu coverage');
const overall=await(await fetch(base+'/api/ability/overall')).json();
assert.equal(overall.sample_limit,Math.max(125,Math.ceil(overall.rated_count*15/100)));assert.equal(overall.sample_count,Math.min(overall.sample_limit,overall.rated_count));
assert.equal(new Set(overall.problems.map(p=>p.canonical_key)).size,overall.problems.length);
assert.equal(overall.problems.length,d.overallAbility.sample_count);
assert.equal(Math.round(overall.problems.reduce((n,p)=>n+p.rating,0)/overall.sample_limit*10)/10,d.overallAbility.ability_value);
assert.equal(overall.problems.filter(p=>p.estimated).length,d.overallAbility.estimated_count);
assert.ok(overall.problems.every((p,i,a)=>p.passed===1&&(i===0||a[i-1].rating>=p.rating)));
console.log('PASS: overall dynamic sample, average, unique canonical problems and estimated count match dashboard');
