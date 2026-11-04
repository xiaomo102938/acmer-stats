import test from 'node:test';import assert from 'node:assert/strict';
import {mergeTopology,edgeKey} from '../src/shared/topology-merge.js';import {validateSkills} from '../src/shared/skill-settings.js';import {completePositions,canPlace,overlaps} from '../src/shared/topology-geometry.js';
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
