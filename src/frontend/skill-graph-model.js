// Curated knowledge relationships, not a strict curriculum or inferred prerequisites.
export const families=[
 {id:'dp',name:'动态规划',children:[['digit dp','数位 DP'],['tree dp','树形 DP'],['knapsack dp','背包 DP'],['interval dp','区间 DP'],['memoization','记忆化搜索'],['dp optimization','DP 优化']]},
 {id:'graphs',name:'图论',children:[['trees','树'],['shortest paths','最短路'],['minimum spanning tree','最小生成树'],['topological sorting','拓扑排序'],['flows','网络流'],['dsu','并查集']]},
 {id:'data structures',name:'数据结构',children:[['segment tree','线段树'],['fenwick tree','树状数组'],['heap','堆'],['prefix sums','前缀和'],['difference array','差分'],['lca','最近公共祖先']]},
 {id:'math',name:'数学',children:[['number theory','数论'],['combinatorics','组合数学'],['probabilities','概率'],['matrices','矩阵'],['geometry','计算几何'],['fft','FFT']]},
 {id:'strings',name:'字符串',children:[['hashing','哈希'],['string suffix structures','后缀结构']]},
 {id:'search',name:'搜索',children:[['dfs and similar','DFS'],['bfs','BFS'],['binary search','二分查找'],['divide and conquer','分治'],['brute force','暴力枚举']]}
];
export const extraRelations=[['trees','tree dp'],['dfs and similar','tree dp'],['data structures','lca'],['trees','lca'],['number theory','fft']];
export const nodeSize=count=>Math.min(150,20+9*Math.sqrt(Math.max(0,Number(count)||0)));
export function nodeTone(row){
 if(!row||!row.sample_count||row.ability_value==null)return 'unrated';
 if(row.sample_count<25)return 'provisional';
 return row.ability_value>=2400?'advanced':row.ability_value>=1800?'strong':'rated';
}
export function skillGraph(profiles,expanded){
 const byKey=new Map(profiles.map(p=>[p.tag_name,p])),nodes=[],edges=[];let y=70;
 for(const family of families){
  const open=expanded.includes(family.id),children=open?family.children:[],height=children.length>3?170:100;
  const add=(id,name,x,cy,root=false)=>{const row=byKey.get(id);nodes.push({id,name,x,y:cy,root,family:family.id,row,count:row?.passed_count||0,size:nodeSize(row?.passed_count),tone:nodeTone(row)});};
  const cy=y+(height-100)/2;add(family.id,family.name,110,cy,true);
  children.forEach(([id,name],i)=>{add(id,name,350+(i%3)*230,cy+(children.length>3?(i<3?-43:43):0));edges.push({from:family.id,to:id,kind:'branch'});});
  y+=height;
 }
 const visible=new Set(nodes.map(n=>n.id));
 for(const [from,to]of extraRelations)if(visible.has(from)&&visible.has(to)&&!edges.some(e=>e.from===from&&e.to===to))edges.push({from,to,kind:'related'});
 return {nodes,edges,height:y-5,known:new Set(families.flatMap(f=>[f.id,...f.children.map(c=>c[0])]))};
}
