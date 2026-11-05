import {canPlace} from '../shared/topology-geometry.js';

// Primary edges define the forest; secondary edges never determine placement.
export function forestPositions(nodes){
 const ids=new Set(nodes.map(n=>n.id)),children=new Map(nodes.map(n=>[n.id,[]]));
 for(const n of nodes)if(n.parent&&ids.has(n.parent))children.get(n.parent).push(n.id);
 const roots=nodes.filter(n=>!n.parent||!ids.has(n.parent));
 const trees=[],visited=new Set();
 for(const root of [...roots,...nodes]){
  if(visited.has(root.id))continue;
  const local={},active=new Set();let leaf=0,maxDepth=0;
  function place(id,depth){if(visited.has(id)||active.has(id))return null;active.add(id);visited.add(id);maxDepth=Math.max(maxDepth,depth);const ys=children.get(id).map(k=>place(k,depth+1)).filter(y=>y!==null);const y=ys.length?(ys[0]+ys[ys.length-1])/2:leaf++*96;local[id]={x:depth*230,y};active.delete(id);return y;}
  place(root.id,0);const width=maxDepth*230+180,height=Math.max(64,(leaf-1)*96+64);
  trees.push({local,width,height});
 }
 trees.sort((a,b)=>b.height-a.height);
 const widest=Math.max(0,...trees.map(tree=>tree.width));
 const totalWidth=trees.reduce((sum,tree)=>sum+tree.width+100,100);
 let best;
 for(let limit=widest+100;limit<=totalWidth+230;limit+=230){
  let x=100,y=65,rowHeight=0,right=0;
  const placements=[];
  for(const tree of trees){
   if(x>100&&x+tree.width>limit){
    x=100;
    y+=rowHeight+105;
    rowHeight=0;
   }
   placements.push({tree,x,y});
   right=Math.max(right,x+tree.width);
   x+=tree.width+100;
   rowHeight=Math.max(rowHeight,tree.height);
  }
  const score=Math.max(right/1.5,y+rowHeight);
  if(!best||score<best.score)best={placements,score};
 }
 const out={};
 for(const {tree,x,y} of best.placements){
  for(const [id,p] of Object.entries(tree.local))out[id]={x:x+p.x,y:y+p.y+32};
 }
 // Keep exceptionally deep/large inputs within the editor's bounded coordinate area.
 if(Object.values(out).some(p=>p.x>10000||p.y>10000)||Object.keys(out).length!==nodes.length){let i=0;for(const id of visited)out[id]={x:120+(i%12)*210,y:90+Math.floor(i++/12)*110};}
 return out;
}
export function completePositions(nodes,stored={}){
 const out={};
 for(const n of nodes)if(stored[n.id])out[n.id]={...stored[n.id]};
 if(Object.keys(out).length===nodes.length)return out;
 const suggested=forestPositions(nodes);
 for(const n of nodes)if(!out[n.id]){
  let p=suggested[n.id],i=0;
  if(!canPlace(n.id,p,out)){do{p={x:120+(i%8)*210,y:90+Math.floor(i/8)*110};i++;}while(!canPlace(n.id,p,out)&&i<10000);}
  out[n.id]=p;
 }
 return out;
}
