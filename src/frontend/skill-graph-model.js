import {scoreColor,scoreInk} from './score-color.js';
import {families,extraRelations} from '../shared/skill-defaults.js';
export {families,extraRelations};
export const nodeSize=count=>Math.min(150,20+9*Math.sqrt(Math.max(0,Number(count)||0)));
export function nodeFontSize(count,size=nodeSize(count)){
 const digits=String(Math.max(0,Number(count)||0)).length;
 return Math.max(11,Math.min(34,size*.3,size*.74/(digits*.62)));
}
export function nodeColors(row){
 const score=row?.ability_value;
 return {fill:scoreColor(score),ink:scoreInk(score)};
}
export function skillGraph(profiles,expanded){
 const byKey=new Map(profiles.map(p=>[p.tag_name,p])),nodes=[],edges=[];let y=70;
 for(const family of families){
  const open=expanded.includes(family.id),children=open?family.children:[],height=children.length>3?170:100;
  const add=(id,name,x,cy,root=false)=>{const row=byKey.get(id);nodes.push({id,name,x,y:cy,root,family:family.id,row,count:row?.passed_count||0,size:nodeSize(row?.passed_count),...nodeColors(row)});};
  const cy=y+(height-100)/2;add(family.id,family.name,110,cy,true);
  children.forEach(([id,name],i)=>{add(id,name,350+(i%3)*230,cy+(children.length>3?(i<3?-43:43):0));edges.push({from:family.id,to:id,kind:'branch'});});
  y+=height;
 }
 const visible=new Set(nodes.map(n=>n.id));
 for(const [from,to]of extraRelations)if(visible.has(from)&&visible.has(to)&&!edges.some(e=>e.from===from&&e.to===to))edges.push({from,to,kind:'related'});
 return {nodes,edges,height:y-5,known:new Set(families.flatMap(f=>[f.id,...f.children.map(c=>c[0])]))};
}

export function customSkillGraph(profiles,expanded,config,counts){
 const byKey=new Map(profiles.map(p=>[p.tag_name,p])),byId=new Map(config.nodes.map(n=>[n.id,n])),visible=new Set();
 function show(n){if(visible.has(n.id))return;visible.add(n.id);if(expanded.includes(n.id))for(const child of config.nodes.filter(c=>c.parent===n.id))show(child);}
 for(const n of config.nodes)if(n.parent===null)show(n);
 const nodes=config.nodes.filter(n=>visible.has(n.id)).map(n=>{const row=byKey.get(n.id);let root=n;while(root.parent)root=byId.get(root.parent);const count=counts?.[n.id]??row?.passed_count??0;return {id:n.id,name:String(config.names[n.id]||row?.display_name||n.id).split(' / ')[0],root:config.nodes.some(c=>c.parent===n.id),family:root.id,row,count,size:nodeSize(count),...nodeColors(row)};});
 const edges=config.nodes.flatMap(n=>[...(n.parent?[{from:n.parent,to:n.id,kind:'branch'}]:[]),...n.secondary.map(from=>({from,to:n.id,kind:'related'}))]).filter(e=>visible.has(e.from)&&visible.has(e.to));
 return {nodes,edges,height:720,known:new Set(config.nodes.map(n=>n.id))};
}
