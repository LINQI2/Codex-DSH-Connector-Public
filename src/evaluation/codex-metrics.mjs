import {buckets,usageDelta,unionMs} from './metrics.mjs';
export function summarizeCodex(windows,task,now=Date.now()){
 let measured=0;const totals=Object.fromEntries(buckets.map(k=>[k,0])),intervals=[];let timingComplete=true;
 for(const w of windows){const d=w.usageInvalid?null:usageDelta(w.baseline,w.latest);if(d){measured++;for(const k of buckets)totals[k]+=d[k];}
  const begin=Date.parse(w.openedAt),end=w.closedAt?Date.parse(w.closedAt):Date.parse(w.observedAt);
  for(const t of w.turns??[]){if(t.start===null){timingComplete=false;continue;}const stop=t.end??(w.active?Math.min(now,end):end);if(stop>=begin&&t.start<=end)intervals.push([Math.max(begin,t.start),Math.min(end,stop)]);if(t.end===null)timingComplete=false;}
  if(w.issue)timingComplete=false;
 }
 const usage=measured?{...totals,inputTokens:totals.uncachedInputTokens+totals.cacheReadTokens+totals.cacheWriteTokens,totalTokens:buckets.reduce((n,k)=>n+totals[k],0)}:null;
 const complete=windows.length>0&&measured===windows.length&&!windows.some(w=>w.issue),price=task.codexPrice;
 const estimate=price&&usage&&complete?{amount:buckets.reduce((n,k)=>n+totals[k]*price[k],0)/1e6,currency:price.currency,label:price.label,configuredAt:price.configuredAt}:null;
 return {provider:'codex',usage,windows,measuredWindows:measured,totalWindows:windows.length,active:windows.some(w=>w.active),executionMs:intervals.length?unionMs(intervals):null,timingComplete:timingComplete&&intervals.length>0,latestAt:windows.at(-1)?.observedAt??null,observedState:windows.at(-1)?.running?'running':'idle',coverage:!windows.length?'unlinked':!complete?'partial':'observed-window',actualCost:null,estimate};
}
