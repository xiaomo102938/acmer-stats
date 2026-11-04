export const editorNode={width:160,height:64,gap:16};
export function overlaps(a,b){return Math.abs(a.x-b.x)<editorNode.width+editorNode.gap&&Math.abs(a.y-b.y)<editorNode.height+editorNode.gap;}
export function canPlace(id,p,positions){return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=90&&p.y>=50&&p.x<=10000&&p.y<=10000&&!Object.entries(positions).some(([key,q])=>key!==id&&overlaps(p,q));}
export function completePositions(nodes,stored={}){const out={};for(const n of nodes)if(stored[n.id])out[n.id]={...stored[n.id]};for(const n of nodes)if(!out[n.id]){let i=0,p;do{p={x:120+(i%6)*210,y:90+Math.floor(i/6)*110};i++;}while(!canPlace(n.id,p,out)&&i<10000);out[n.id]=p;}return out;}
export function validatePositions(nodes,positions){
 if(positions===undefined)return;
 const fail=()=>{throw Object.assign(new Error('节点位置不合法或发生重叠，请调整布局。'),{status:400});};
 if(!positions||typeof positions!=='object'||Array.isArray(positions))fail();
 const ids=new Set(nodes.map(n=>n.id));
 for(const [id,p]of Object.entries(positions))if(!ids.has(id)||!p||typeof p!=='object'||!Number.isFinite(p.x)||!Number.isFinite(p.y))fail();
 for(const [id,p]of Object.entries(positions))if(!canPlace(id,p,positions))fail();
}
