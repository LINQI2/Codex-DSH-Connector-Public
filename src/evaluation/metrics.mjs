// Installed DSH 0.2.1-rc.2 tokenUsage projection: four DISJOINT buckets.
export const buckets=['uncachedInputTokens','cacheReadTokens','cacheWriteTokens','outputTokens'];
export function usageValue(value){
 if(!value||!buckets.every(k=>Number.isSafeInteger(value[k])&&value[k]>=0))return null;
 return Object.fromEntries(buckets.map(k=>[k,value[k]]));
}
export function usageDelta(before,after){
 const a=usageValue(before),b=usageValue(after);
 if(!a||!b||buckets.some(k=>b[k]<a[k]))return null;
 return Object.fromEntries(buckets.map(k=>[k,b[k]-a[k]]));
}
export function unionMs(intervals){
 const rows=intervals.filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>=a).sort((a,b)=>a[0]-b[0]);let total=0,end=-Infinity;
 for(const [a,b]of rows){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return total;
}
export function priceValue(value){
 if(!value)return null;
 if(!['CNY','USD'].includes(value.currency)||typeof value.label!=='string'||!value.label.trim()||value.label.length>100||!buckets.every(k=>typeof value[k]==='number'&&Number.isFinite(value[k])&&value[k]>=0&&value[k]<=1e9))throw Error('请填写币种、计价说明和四项有效的每百万Token单价');
 return {currency:value.currency,label:value.label.trim(),...Object.fromEntries(buckets.map(k=>[k,value[k]]))};
}
export function summarize(task,windows,events,now=Date.now()){
 const totals=Object.fromEntries(buckets.map(k=>[k,0]));let measuredWindows=0;
 for(const w of windows){const delta=w.usageInvalid?null:usageDelta(w.baseline,w.latest);if(delta){measuredWindows++;for(const k of buckets)totals[k]+=delta[k];}}
 const allMeasured=windows.length>0&&measuredWindows===windows.length;
 const intervals=[];let completeTiming=true;
 for(const w of windows){let start=null;for(const e of events.filter(e=>e.windowId===w.id)){
   if(e.type==='turn/start'){if(start!==null)completeTiming=false;start=e.time;}
   if(e.type==='turn/end'){if(start===null||e.time===null){completeTiming=false;continue;}intervals.push([start,e.time]);start=null;}
  }if(start!==null){completeTiming=false;if(w.active)intervals.push([start,now]);}
  if(w.issue||w.disconnectedAt)completeTiming=false;
 }
 const observedEnd=task.closedAt?Date.parse(task.closedAt):now;
 const gaps=windows.some(w=>w.issue||w.disconnectedAt);
 const usage=measuredWindows?{...totals,inputTokens:totals.uncachedInputTokens+totals.cacheReadTokens+totals.cacheWriteTokens,totalTokens:buckets.reduce((s,k)=>s+totals[k],0)}:null;
 const estimate=task.price&&usage&&allMeasured&&!gaps?{amount:buckets.reduce((s,k)=>s+totals[k]*task.price[k],0)/1e6,currency:task.price.currency,label:task.price.label,configuredAt:task.price.configuredAt}:null;
 return {...task,windows,events,usage,estimate,actualCost:null,codexUsage:null,measuredWindows,totalWindows:windows.length,
  coverage:!allMeasured||gaps?'partial':'observed-window',elapsedMs:Math.max(0,observedEnd-Date.parse(task.createdAt)),
  executionMs:intervals.length?unionMs(intervals):null,timingComplete:completeTiming&&intervals.length>0,
  active:windows.some(w=>w.active),observedState:windows.at(-1)?.state??'unknown',latestAt:windows.at(-1)?.observedAt??task.createdAt};
}
