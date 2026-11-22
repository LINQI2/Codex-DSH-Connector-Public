// Per-refresh deduplication only. Never reuses a prior refresh's identity snapshot.
export function oncePerSource(read){const pending=new Map();return key=>{if(!pending.has(key))pending.set(key,Promise.resolve().then(()=>read(key)));return pending.get(key);};}
