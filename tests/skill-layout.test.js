import test from 'node:test';
import assert from 'node:assert/strict';
import {createSkillLayout} from '../src/frontend/skill-layout.js';
import {skillGraph,families} from '../src/frontend/skill-graph-model.js';
function settle(sim){let state;do{state=sim.step(16);}while(!state.done);return state;}
test('force layout converges, remains bounded and stops moving once frozen',()=>{
 const graph=skillGraph([],families.map(f=>f.id)),sim=createSkillLayout(graph),state=settle(sim);
 assert.equal(state.reason,'stable');assert.ok(state.steps<700);const points=[...sim.positions().values()];
 assert.ok(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=80&&p.x<=920&&p.y>=65&&p.y<=655));
 for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)assert.ok(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)>75,'nodes and labels need separation');
 const frozen=sim.positions();sim.step(500);assert.deepEqual(sim.positions(),frozen);
});
test('disconnected roots stay finite; layout is deterministic and has a hard step limit',()=>{
 const graph=skillGraph([],[]),a=createSkillLayout(graph),b=createSkillLayout(graph);settle(a);settle(b);assert.deepEqual(a.positions(),b.positions());
 const limited=createSkillLayout(graph,new Map(),{maxSteps:3,stableRequired:100});assert.equal(settle(limited).reason,'limit');assert.equal(limited.step().steps,3);
});
test('expansion starts from existing positions and coincident seeds separate',()=>{
 const old=createSkillLayout(skillGraph([],['dp']));settle(old);const next=createSkillLayout(skillGraph([],['dp','graphs']),old.positions());
 assert.deepEqual(next.positions().get('dp'),old.positions().get('dp'));settle(next);
 const graph=skillGraph([],[]),same=new Map(graph.nodes.map(n=>[n.id,{x:500,y:360}])),sim=createSkillLayout(graph,same);settle(sim);
 const p=[...sim.positions().values()];assert.ok(p.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));assert.ok(p.some(n=>Math.hypot(n.x-500,n.y-360)>30));
});

test('enlarged high-count nodes fit the canvas and keep their circles separated',()=>{
 const profiles=families.map(f=>({tag_name:f.id,passed_count:400})),g=skillGraph(profiles,families.map(f=>f.id)),sim=createSkillLayout(g);settle(sim);const p=sim.positions();
 for(const n of g.nodes){const a=p.get(n.id);assert.ok(a.x-n.size/2>=0&&a.x+n.size/2<=1000&&a.y-n.size/2>=0&&a.y+n.size/2+24<=720);}
 for(let i=0;i<g.nodes.length;i++)for(let j=i+1;j<g.nodes.length;j++){const a=g.nodes[i],b=g.nodes[j],x=p.get(a.id),y=p.get(b.id);assert.ok(Math.hypot(x.x-y.x,x.y-y.y)>(a.size+b.size)/2,'large circles must not overlap');}
});

test('expanding a dense graph gives nodes space beyond the original layout',()=>{
 const nodes=Array.from({length:130},(_,i)=>({id:String(i),root:i<7,family:String(i%7),size:i<7?125:35}));
 const edges=nodes.slice(7).map(n=>({from:n.family,to:n.id,kind:'branch'}));
 const initial=createSkillLayout({nodes:nodes.slice(0,7),edges:[]});
 settle(initial);
 const expanded=createSkillLayout({nodes,edges},initial.positions());
 const state=settle(expanded),points=[...expanded.positions().values()];
 const span=axis=>Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]));
 assert.ok(state.width>1000&&state.height>720);
 assert.ok(span('x')>1000&&span('y')>720);
 assert.ok(state.steps<=700);
});
