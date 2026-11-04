// Bounded deterministic force layout. The component runs short batches and stops scheduling on completion.
const hash=s=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
export function createSkillLayout(graph,previous=new Map(),options={}){
 const width=1000,height=720,maxSteps=options.maxSteps??700,stableRequired=options.stableRequired??20;
 const roots=graph.nodes.filter(n=>n.root),rootIndex=new Map(roots.map((n,i)=>[n.id,i]));
 const nodes=graph.nodes.map(n=>{
  const old=previous.get(n.id),parent=previous.get(n.family),angle=(rootIndex.get(n.family)||0)*Math.PI*2/Math.max(1,roots.length)-Math.PI/2;
  const jitter=(hash(n.id)%6283)/1000;
  const center=parent||{x:width/2+Math.cos(angle)*235,y:height/2+Math.sin(angle)*210};
  return {id:n.id,x:old?.x??center.x+(n.root?0:Math.cos(jitter)*85),y:old?.y??center.y+(n.root?0:Math.sin(jitter)*85),vx:0,vy:0,fx:0,fy:0};
 });
 const byId=new Map(nodes.map(n=>[n.id,n])),edges=graph.edges.map(e=>({...e,a:byId.get(e.from),b:byId.get(e.to)})).filter(e=>e.a&&e.b);
 let steps=0,stable=0,done=nodes.length===0,reason=done?'stable':null,lastMovement=Infinity;
 function step(budget=20){
  for(let tick=0;tick<budget&&!done;tick++){
   for(const n of nodes){n.fx=(width/2-n.x)*.0015;n.fy=(height/2-n.y)*.0015;}
   for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    const a=nodes[i],b=nodes[j];let dx=b.x-a.x,dy=b.y-a.y;
    if(Math.abs(dx)+Math.abs(dy)<.001){const angle=(hash(a.id+'>'+b.id)%6283)/1000;dx=Math.cos(angle)*.1;dy=Math.sin(angle)*.1;}
    const d=Math.max(.1,Math.hypot(dx,dy)),force=Math.min(8,1250/(d*d)+Math.max(0,125-d)*.075),fx=dx/d*force,fy=dy/d*force;
    a.fx-=fx;a.fy-=fy;b.fx+=fx;b.fy+=fy;
   }
   for(const {a,b,kind}of edges){
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy)),force=(d-(kind==='related'?185:150))*(kind==='related'?.004:.012);
    a.fx+=dx/d*force;a.fy+=dy/d*force;b.fx-=dx/d*force;b.fy-=dy/d*force;
   }
   let movement=0;const cooling=Math.max(.008,Math.pow(.992,steps));
   for(const n of nodes){
    n.vx=(n.vx+n.fx*cooling)*.76;n.vy=(n.vy+n.fy*cooling)*.76;
    const speed=Math.hypot(n.vx,n.vy);if(speed>5){n.vx*=5/speed;n.vy*=5/speed;}
    const x=Math.max(80,Math.min(width-80,n.x+n.vx)),y=Math.max(65,Math.min(height-65,n.y+n.vy));
    movement=Math.max(movement,Math.hypot(x-n.x,y-n.y));if(x===n.x)n.vx=0;if(y===n.y)n.vy=0;n.x=x;n.y=y;
   }
   steps++;lastMovement=movement;stable=movement<.08?stable+1:0;
   if(stable>=stableRequired||steps>=maxSteps){done=true;reason=stable>=stableRequired?'stable':'limit';}
  }
  return {done,reason,steps,movement:lastMovement,width,height};
 }
 const positions=()=>new Map(nodes.map(n=>[n.id,{x:n.x,y:n.y}]));
 return {step,positions,get done(){return done;}};
}
