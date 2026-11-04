import test from 'node:test';
import assert from 'node:assert/strict';
import {families,skillGraph,nodeSize,nodeTone} from '../src/frontend/skill-graph-model.js';
test('curated graph has unique nodes, valid links and multiple tree-DP foundations',()=>{
 const g=skillGraph([],families.map(f=>f.id)),ids=new Set(g.nodes.map(n=>n.id));assert.equal(ids.size,g.nodes.length);
 assert.ok(g.edges.every(e=>ids.has(e.from)&&ids.has(e.to)));assert.equal(new Set(g.edges.map(e=>e.from+'>'+e.to)).size,g.edges.length);
 assert.deepEqual(g.edges.filter(e=>e.to==='tree dp').map(e=>e.from).sort(),['dfs and similar','dp','trees']);
 const seen=new Set(),active=new Set();function visit(id){assert.ok(!active.has(id),'knowledge graph should be acyclic');if(seen.has(id))return;active.add(id);for(const e of g.edges.filter(e=>e.from===id))visit(e.to);active.delete(id);seen.add(id);}for(const id of ids)visit(id);
});
test('node counts use source deduplicated totals, never sum children or guess unseen tags',()=>{
 const p=[{tag_name:'dp',passed_count:10,sample_count:25,ability_value:2000},{tag_name:'digit dp',passed_count:8,sample_count:8,ability_value:2300},{tag_name:'unknown',passed_count:99}];
 const g=skillGraph(p,['dp']);assert.equal(g.nodes.find(n=>n.id==='dp').count,10);assert.equal(g.nodes.find(n=>n.id==='digit dp').count,8);assert.equal(g.nodes.find(n=>n.id==='tree dp').count,0);
 assert.equal(g.nodes.find(n=>n.id==='dp').tone,'strong');assert.equal(g.nodes.find(n=>n.id==='digit dp').tone,'provisional');assert.ok(!g.known.has('unknown'));
 const folded=skillGraph(p,[]);assert.equal(folded.nodes.length,6);assert.equal(folded.edges.length,0);
});
test('sizes are monotonic and capped; incomplete and absent scores remain distinct',()=>{
 assert.ok(nodeSize(100)>nodeSize(10));assert.ok(nodeSize(107)/nodeSize(3)>3);assert.ok(nodeSize(1000)<=150);assert.equal(nodeSize(-1),20);assert.equal(nodeTone(null),'unrated');assert.equal(nodeTone({sample_count:0,ability_value:null}),'unrated');assert.equal(nodeTone({sample_count:1,ability_value:3200}),'provisional');
});
