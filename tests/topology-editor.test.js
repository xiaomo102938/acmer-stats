import {completePositions} from '../src/frontend/topology-editor-layout.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {mergeTopology,edgeKey} from '../src/shared/topology-merge.js';import {validateSkills} from '../src/shared/skill-settings.js';import {canPlace,overlaps} from '../src/shared/topology-geometry.js';
const config=()=>({aliases:{},names:{},specialties:['four'],includeDescendants:true,nodes:[{id:'one',parent:null,secondary:[]},{id:'two',parent:'one',secondary:[]},{id:'three',parent:'two',secondary:[]},{id:'four',parent:'three',secondary:[]},{id:'five',parent:'one',secondary:[]}]});
const catalog=['one','two','three','four','five','six'].map(key=>({key,name:key}));
test('merge keeps shallower node, preserves outgoing edges and demotes deeper parent; source unchanged',()=>{
 const c=config();c.nodes.push({id:'six',parent:'four',secondary:[]});c.positions=completePositions(c.nodes);const original=structuredClone(c);const p=mergeTopology(c,'four','five',catalog);
 assert.equal(p.keep,'five');assert.equal(p.remove,'four');assert.equal(p.conflict,'');assert.deepEqual(p.config.nodes.find(n=>n.id==='five'),{id:'five',parent:'one',secondary:['three']});assert.equal(p.config.nodes.find(n=>n.id==='six').parent,'five');assert.deepEqual(p.config.specialties,['five']);assert.equal(p.config.aliases.four,'five');assert.deepEqual(p.config.positions.five,c.positions.five);assert.deepEqual(c,original);validateSkills(p.config,catalog);
});
test('different trees and absent nodes cannot merge; equal depth retains second',()=>{
 const c=config();c.nodes.find(n=>n.id==='five').parent=null;assert.throws(()=>mergeTopology(c,'four','five',catalog),/同一棵/);assert.throws(()=>mergeTopology(c,'four','six',catalog));const d=config();assert.equal(mergeTopology(d,'two','five',catalog).keep,'five');
});
test('ancestor merge exposes mixed cycle and only explicit preview removal resolves it',()=>{
 const c=config(),p=mergeTopology(c,'two','four',catalog);assert.match(p.conflict,/环/);const key=edgeKey({from:'three',to:'two',kind:'secondary'});const fixed=mergeTopology(c,'two','four',catalog,[key]);assert.equal(fixed.conflict,'');assert.equal(fixed.config.nodes.find(n=>n.id==='three').parent,'two');assert.throws(()=>mergeTopology(c,'two','four',catalog,['invented']));
});
test('positions include text bounds; save rejects overlap and draft relaxes only unfinished root constraint',()=>{
 const c=config();c.positions=completePositions(c.nodes);assert.ok(!overlaps(c.positions.one,c.positions.two));assert.equal(canPlace('one',c.positions.two,c.positions),false);c.positions.one={...c.positions.two};assert.throws(()=>validateSkills(c,catalog),/重叠/);
 delete c.positions;c.nodes.find(n=>n.id==='five').parent=null;c.nodes.find(n=>n.id==='five').secondary=['two'];assert.throws(()=>validateSkills(c,catalog),/根节点/);assert.doesNotThrow(()=>validateSkills(c,catalog,{draft:true}));c.nodes[0].parent='five';assert.throws(()=>validateSkills(c,catalog,{draft:true}),/环/);
});
import {reactive} from 'vue';
test('merge preview accepts Vue reactive config without mutating editor state',()=>{
 const original=reactive(config()),p=mergeTopology(original,'four','five',catalog);assert.equal(p.conflict,'');assert.equal(p.keep,'five');assert.equal(original.nodes.length,5);assert.deepEqual(original.aliases,{});
});
import {defaultSkills} from '../src/shared/skill-settings.js';import {forestPositions} from '../src/frontend/topology-editor-layout.js';
test('forest layout separates primary trees, respects hierarchy and preserves manual coordinates',()=>{
 const c=defaultSkills(),p=forestPositions(c.nodes);assert.equal(Object.keys(p).length,c.nodes.length);validateSkills({...c,positions:p},c.nodes.map(n=>({key:n.id})));
 for(const n of c.nodes)if(n.parent)assert.ok(p[n.id].x>p[n.parent].x,'children are to the right of primary parent');
 const noSecondary=forestPositions(c.nodes.map(n=>({...n,secondary:[]})));assert.deepEqual(p,noSecondary);
 const manual={dp:{x:9500,y:9500}},filled=completePositions(c.nodes,manual);assert.deepEqual(filled.dp,manual.dp);assert.ok(Object.entries(filled).every(([id,pos])=>canPlace(id,pos,filled)));
 const many=Array.from({length:400},(_,i)=>({id:'n'+i,parent:null,secondary:[]})),bounded=forestPositions(many);assert.ok(Object.entries(bounded).every(([id,pos])=>canPlace(id,pos,bounded)));
});
import {topologyContentSignature} from '../src/shared/topology-geometry.js';
test('layout-only movement and reordering do not mark topology content as changed',()=>{
 const c=config(),moved=structuredClone(c);moved.positions=completePositions(moved.nodes);moved.positions.one.x+=10;assert.equal(topologyContentSignature(c),topologyContentSignature(moved));
 moved.nodes.reverse();assert.equal(topologyContentSignature(c),topologyContentSignature(moved));
 moved.names.one='renamed';assert.notEqual(topologyContentSignature(c),topologyContentSignature(moved));delete moved.names.one;
 moved.nodes.find(n=>n.id==='four').parent='one';assert.notEqual(topologyContentSignature(c),topologyContentSignature(moved));
});
test('wide primary trees pack across the canvas without saving generated coordinates during merges',()=>{
 const nodes=[];
 for(let tree=0;tree<7;tree++){
  const root='root'+tree;
  nodes.push({id:root,parent:null,secondary:[]});
  for(let i=0;i<18;i++){
   nodes.push({id:root+'-'+i,parent:i===0?root:i<4?root+'-'+(i-1):root,secondary:[]});
  }
 }
 const positions=forestPositions(nodes);
 validateSkills({nodes,positions,names:{},aliases:{},specialties:[],includeDescendants:true},nodes.map(n=>({key:n.id})));
 const width=Math.max(...Object.values(positions).map(p=>p.x))+110;
 const height=Math.max(...Object.values(positions).map(p=>p.y))+80;
 assert.ok(width/height>0.8&&width/height<2.5);
 assert.equal(mergeTopology(config(),'four','five',catalog).config.positions,undefined);
});
