export const editorNode={width:160,height:64,gap:16};
export function overlaps(a,b){return Math.abs(a.x-b.x)<editorNode.width+editorNode.gap&&Math.abs(a.y-b.y)<editorNode.height+editorNode.gap;}
export function canPlace(id,p,positions){return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=90&&p.y>=50&&p.x<=10000&&p.y<=10000&&!Object.entries(positions).some(([key,q])=>key!==id&&overlaps(p,q));}
// Primary edges define the forest; secondary edges never determine placement.
export function forestPositions(nodes){
 const ids=new Set(nodes.map(n=>n.id)),children=new Map(nodes.map(n=>[n.id,[]]));
 for(const n of nodes)if(n.parent&&ids.has(n.parent))children.get(n.parent).push(n.id);
 const roots=nodes.filter(n=>!n.parent||!ids.has(n.parent)),out={},visited=new Set();let shelfX=100,shelfY=65,shelfHeight=0;
 for(const root of [...roots,...nodes]){
  if(visited.has(root.id))continue;
  const local={},active=new Set();let leaf=0,maxDepth=0;
  function place(id,depth){if(visited.has(id)||active.has(id))return null;active.add(id);visited.add(id);maxDepth=Math.max(maxDepth,depth);const ys=children.get(id).map(k=>place(k,depth+1)).filter(y=>y!==null);const y=ys.length?(ys[0]+ys[ys.length-1])/2:leaf++*96;local[id]={x:depth*230,y};active.delete(id);return y;}
  place(root.id,0);const width=maxDepth*230+180,height=Math.max(64,(leaf-1)*96+64);
  if(shelfX>100&&shelfX+width>1800){shelfX=100;shelfY+=shelfHeight+105;shelfHeight=0;}
  for(const [id,p]of Object.entries(local))out[id]={x:shelfX+p.x,y:shelfY+p.y+32};
  shelfX+=width+100;shelfHeight=Math.max(shelfHeight,height);
 }
 // Keep exceptionally deep/large inputs within the editor's bounded coordinate area.
 if(Object.values(out).some(p=>p.x>10000||p.y>10000)||Object.keys(out).length!==nodes.length){let i=0;for(const id of visited)out[id]={x:120+(i%12)*210,y:90+Math.floor(i++/12)*110};}
 return out;
}
export function completePositions(nodes,stored={}){
 const out={},suggested=forestPositions(nodes);
 for(const n of nodes)if(stored[n.id])out[n.id]={...stored[n.id]};
 for(const n of nodes)if(!out[n.id]){
  let p=suggested[n.id],i=0;
  if(!canPlace(n.id,p,out)){do{p={x:120+(i%8)*210,y:90+Math.floor(i/8)*110};i++;}while(!canPlace(n.id,p,out)&&i<10000);}
  out[n.id]=p;
 }
 return out;
}
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
