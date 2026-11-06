const anchors=[
 [0,[255,255,255]], [1300,[0,128,0]], [1500,[3,168,158]], [1750,[0,0,255]],
 [2000,[170,0,170]], [2250,[255,140,0]], [2800,[255,0,0]], [4500,[0,0,0]]
];
const graphAnchors=[
 [0,[255,255,255]], [1300,[74,128,86]], [1500,[69,147,141]], [1750,[75,113,160]],
 [2000,[138,93,150]], [2250,[190,132,65]], [2800,[177,77,70]], [4500,[0,0,0]]
];
const mix=(left,right,ratio)=>left.map((channel,i)=>Math.round(channel+(right[i]-channel)*ratio));
const css=rgb=>'rgb('+rgb.join(',')+')';
const luminance=rgb=>rgb.reduce((sum,channel,i)=>{
 const s=channel/255;
 return sum+[.2126,.7152,.0722][i]*(s<=.04045?s/12.92:((s+.055)/1.055)**2.4);
},0);

function scoreRgb(value,palette=anchors){
 if(value==null||value===''||!Number.isFinite(Number(value)))return null;
 const score=Math.max(0,Math.min(4500,Number(value)));
 const index=palette.findIndex(([position])=>position>=score);
 if(index===0)return palette[0][1];
 const [start,left]=palette[index-1],[end,right]=palette[index];
 return mix(left,right,(score-start)/(end-start));
}

export const scoreColor=value=>css(scoreRgb(value)??[142,150,157]);

const contrastInk=rgb=>luminance(rgb)>=Math.sqrt(1.05*.05)-.05?'#000':'#fff';
export const scoreInk=value=>contrastInk(scoreRgb(value)??[142,150,157]);

export function graphScoreStyle(value){
 const rgb=scoreRgb(value,graphAnchors)??[142,150,157];
 return {backgroundColor:css(rgb),color:contrastInk(rgb)};
}

export function scoreStyle(value){
 return scoreRgb(value)?{backgroundColor:scoreColor(value),color:scoreInk(value)}:undefined;
}

export function scoreAxisColor(value,background){
 const rgb=scoreRgb(value);
 if(!rgb||!/^#[\da-f]{6}$/i.test(background))return scoreColor(value);
 const base=luminance(background.slice(1).match(/../g).map(part=>parseInt(part,16)));
 const target=base>.179?[0,0,0]:[255,255,255];
 for(let step=0;step<=10;step++){
  const candidate=mix(rgb,target,step/10),light=luminance(candidate);
  if((Math.max(light,base)+.05)/(Math.min(light,base)+.05)>=4.5)return css(candidate);
 }
 return css(target);
}
