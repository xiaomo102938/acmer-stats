import assert from 'node:assert/strict';import {completePositions} from '../src/shared/topology-geometry.js';
const url='http://127.0.0.1:3000/api/skill-settings';const get=async()=>{const r=await fetch(url);assert.equal(r.status,200);return r.json();};let state=await get(),before=structuredClone(state),ownRevision=state.revision,ownDraft=state.draftRevision,merged=false;
const patch=async(module,extra={},status=200)=>{const r=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json','X-Acmer-Request':'1'},body:JSON.stringify({module,revision:ownRevision,draftRevision:ownDraft,...extra})});const b=await r.json();assert.equal(r.status,status,JSON.stringify(b));if(status===200){ownRevision=b.revision;ownDraft=b.draftRevision;state=b;}return b;};
const topo=c=>({nodes:structuredClone(c.nodes),names:structuredClone(c.names),positions:completePositions(c.nodes,c.positions)});
try{
 assert.ok(!before.topologyDraft,'Do not overwrite existing user draft');assert.ok(!Object.keys(before.config.aliases).length,'This integration fixture expects no existing personal aliases');
 const draft=topo(before.config);draft.nodes.find(n=>n.id==='tree dp').parent=null;
 await patch('draft',{value:draft});assert.equal(ownRevision,before.revision);assert.equal((await get()).config.nodes.find(n=>n.id==='tree dp').parent,'dp');assert.equal((await get()).topologyDraft.nodes.find(n=>n.id==='tree dp').parent,null);
 await patch('topology',{value:draft},400);await patch('draft',{value:draft,draftRevision:ownDraft-1},409);
 await patch('specialty',{value:{specialties:['dp'],includeDescendants:true}});assert.ok((await get()).topologyDraft);assert.equal((await get()).config.nodes.find(n=>n.id==='tree dp').parent,'dp');
 await patch('merge',{first:'digit dp',second:'knapsack dp'},409);await patch('discardDraft');
 const changed=topo(before.config);for(const p of Object.values(changed.positions))p.y+=20;
 const collision=structuredClone(changed);collision.positions.dp={...collision.positions.graphs};await patch('topology',{value:collision},400);
 await patch('topology',{value:changed});assert.equal((await get()).config.positions.dp.y,changed.positions.dp.y);
 await patch('merge',{first:'digit dp',second:'knapsack dp',name:'归并测试'});merged=true;const c=(await get()).config;assert.equal(c.aliases['digit dp'],'knapsack dp');assert.ok(!c.nodes.some(n=>n.id==='digit dp'));assert.equal(c.nodes.find(n=>n.id==='knapsack dp').parent,'dp');
 await patch('unmerge',{source:'digit dp'});merged=false;
 console.log('PASS: draft isolated from applied topology; module saves preserve other module; stale drafts and overlaps rejected; merge atomic; unmerge works.');
}finally{
 const latest=await get();assert.equal(latest.revision,ownRevision,'External edit detected; do not overwrite');assert.equal(latest.draftRevision,ownDraft,'External draft detected; do not overwrite');
 if(merged)await patch('unmerge',{source:'digit dp'});
 if((await get()).topologyDraft)await patch('discardDraft');
 await patch('topology',{value:topo(before.config)});
 const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','X-Acmer-Request':'1'},body:JSON.stringify({revision:ownRevision,config:before.config})});assert.equal(r.status,200);console.log('Original user configuration restored; no testing draft remains.');
}
