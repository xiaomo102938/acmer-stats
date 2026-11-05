export const editorNode={width:160,height:64,gap:16};
export function overlaps(a,b){return Math.abs(a.x-b.x)<editorNode.width+editorNode.gap&&Math.abs(a.y-b.y)<editorNode.height+editorNode.gap;}
export function canPlace(id,p,positions){return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=90&&p.y>=50&&p.x<=10000&&p.y<=10000&&!Object.entries(positions).some(([key,q])=>key!==id&&overlaps(p,q));}
export function validatePositions(nodes,positions){
 if(positions===undefined)return;
 const fail=()=>{throw Object.assign(new Error('节点位置不合法或发生重叠，请调整布局。'),{status:400});};
 if(!positions||typeof positions!=='object'||Array.isArray(positions))fail();
 const ids=new Set(nodes.map(n=>n.id));
 for(const [id,p]of Object.entries(positions))if(!ids.has(id)||!p||typeof p!=='object'||!Number.isFinite(p.x)||!Number.isFinite(p.y))fail();
 for(const [id,p]of Object.entries(positions))if(!canPlace(id,p,positions))fail();
}
// Layout is a view preference, not a change to skill types or prerequisite relationships.
export function topologyContentSignature(config){
 const nodes=(config.nodes||[]).map(n=>({id:n.id,parent:n.parent,secondary:[...n.secondary].sort()})).sort((a,b)=>a.id.localeCompare(b.id));
 const names=Object.entries(config.names||{}).sort(([a],[b])=>a.localeCompare(b));
 return JSON.stringify({nodes,names});
}
