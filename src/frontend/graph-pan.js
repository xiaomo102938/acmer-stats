// Allow an extra quarter of the smaller span beyond the graph or viewport edge.
export function clampGraphAxis(origin, graphSize, viewSize){
 const margin=Math.min(graphSize,viewSize)/4;
 const overflow=graphSize-viewSize;
 return Math.max(Math.min(0,overflow)-margin,Math.min(Math.max(0,overflow)+margin,origin));
}
