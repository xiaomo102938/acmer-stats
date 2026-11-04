import assert from 'node:assert/strict';
const base='http://127.0.0.1:3000/api';const get=async p=>{const r=await fetch(base+p);assert.equal(r.status,200);return r.json();};
const put=(config,revision)=>fetch(base+'/skill-settings',{method:'PUT',headers:{'Content-Type':'application/json','X-Acmer-Request':'1'},body:JSON.stringify({config,revision})});
const before=await get('/skill-settings');let ownRevision=null;
try{
 const bad=structuredClone(before.config);bad.nodes.find(n=>n.id==='dp').parent='tree dp';assert.equal((await put(bad,before.revision)).status,400);assert.equal((await get('/skill-settings')).revision,before.revision);
 const test=structuredClone(before.config);test.specialties=['dp'];test.names.dp='动态规划 / Dynamic Programming';
 const attempts=await Promise.all([put(test,before.revision),put(test,before.revision)]);assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);const ok=await attempts.find(r=>r.status===200).json();ownRevision=ok.revision;
 const stored=await get('/skill-settings');assert.deepEqual(stored.config.specialties,['dp']);assert.equal(stored.revision,ownRevision);
 const p=await get('/ability/overall');assert.equal(p.configured,true);assert.equal(p.scope,'specialty');assert.ok(p.problems.length>0&&p.problems.length<=150);assert.equal(new Set(p.problems.map(r=>r.canonical_key)).size,p.problems.length);
 const all=await get('/ability/overall?scope=all');assert.ok(all.rated_count>=p.rated_count);assert.equal(all.sample_count,150);
 const dash=await get('/dashboard');assert.equal(dash.overallAbility.ability_value,p.ability_value);assert.ok(dash.tagAbility.some(t=>t.tag_id==='dp'));
 const d=await get('/tags/dp/ability?platform='+encodeURIComponent('全部平台'));assert.ok(d.problems.length>0);
 console.log('PASS: cycle rejected without writes; concurrent edits protected; config persisted; specialty dashboard and drilldown agree; all-topic fallback works.');
}finally{if(ownRevision!==null){const now=await get('/skill-settings');if(now.revision!==ownRevision)throw Error('Settings changed externally; did not overwrite');const restored=await put(before.config,now.revision);assert.equal(restored.status,200);console.log('Original user config restored (specialties remain unset).');}}
