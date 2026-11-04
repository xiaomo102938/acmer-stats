import {completePositions} from './topology-geometry.js';
import {validateSkills} from './skill-settings.js';
const clone=c=>JSON.parse(JSON.stringify(c));
export function graphEdges(nodes){return nodes.flatMap(n=>[...(n.parent?[{from:n.parent,to:n.id,kind:'primary'}]:[]),...n.secondary.map(from=>({from,to:n.id,kind:'secondary'}))]);}
export const edgeKey=e=>e.kind+':'+e.from+'>'+e.to;
export function mergeTopology(config,first,second,catalog,drop=[]){
 validateSkills(config,catalog);
 const c=clone(config);c.positions=completePositions(c.nodes,c.positions);const byId=new Map(c.nodes.map(n=>[n.id,n]));
 const fail=m=>{throw Object.assign(new Error(m),{status:400});};
 if(first===second||!byId.has(first)||!byId.has(second))fail('两个题型都须已加入图谱，且不能相同。');
 function lineage(id){let depth=0,n=byId.get(id);while(n.parent){n=byId.get(n.parent);depth++;}return {root:n.id,depth};}
 const a=lineage(first),b=lineage(second);if(a.root!==b.root)fail('两个节点不在同一棵实线树中，不能归并。请先调整主前驱关系。');
 const keep=a.depth<b.depth?first:second,remove=keep===first?second:first;
 const mapped=id=>id===remove?keep:id,old=byId.get(remove),retained=byId.get(keep);
 c.nodes=c.nodes.filter(n=>n.id!==remove).map(n=>({...n,parent:n.parent===remove?keep:n.parent,secondary:n.secondary.map(mapped)}));
 const merged=c.nodes.find(n=>n.id===keep);
 merged.secondary.push(...old.secondary.map(mapped),...(old.parent?[mapped(old.parent)]:[]));
 for(const n of c.nodes){if(n.parent===n.id)n.parent=null;n.secondary=[...new Set(n.secondary)].filter(id=>id!==n.id&&id!==n.parent);}
 for(const key of Object.keys(c.aliases))if(c.aliases[key]===remove)c.aliases[key]=keep;c.aliases[remove]=keep;delete c.names[remove];
 c.specialties=[...new Set(c.specialties.map(mapped))];
 if(c.positions){delete c.positions[remove];if(config.positions?.[keep])c.positions[keep]=clone(config.positions[keep]);}
 const secondary=graphEdges(c.nodes).filter(e=>e.kind==='secondary'),allowed=new Set(secondary.map(edgeKey));
 if(!Array.isArray(drop)||drop.some(k=>!allowed.has(k)))fail('归并预览中的关系已失效，请重新预览。');
 for(const n of c.nodes)n.secondary=n.secondary.filter(from=>!drop.includes(edgeKey({from,to:n.id,kind:'secondary'})));
 let conflict='';try{validateSkills(c,catalog);}catch(e){conflict=e.message;}
 return {config:c,keep,remove,shallower:Math.min(a.depth,b.depth),secondary,conflict};
}
export function unmergeTopology(config,source){const c=clone(config);if(!Object.hasOwn(c.aliases,source))throw Object.assign(new Error('别名不存在。'),{status:400});delete c.aliases[source];if(!c.nodes.some(n=>n.id===source))c.nodes.push({id:source,parent:null,secondary:[]});return c;}
