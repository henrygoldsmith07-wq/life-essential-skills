/* Lazy static content and useful practice discovery. No responses or telemetry. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Catalog=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create(data,fetcher=fetch){
    const cache=new Map();
    async function chunk(id){
      if(!cache.has(id))cache.set(id,fetcher('chunks/'+encodeURIComponent(id)+'.json').then(r=>{if(!r.ok)throw new Error('Learning material could not load.');return r.json();}).catch(e=>{cache.delete(id);throw e;}));
      return cache.get(id);
    }
    return {item:async id=>{const header=data.bank.items.find(i=>i.id===id);if(!header)throw new Error('Unknown task');return (await chunk(header.chunk)).items.find(i=>i.id===id);},lesson:async path=>chunk(data.index.domains.find(d=>d.path===path).id)};
  }
  function discover(state,data,engine,today,options){
    const rec=engine.recommend(state,data,today),{mode='recommended',domain='all',search=''}=options;
    // Retention: competencies with a demonstrated skill whose scheduled
    // review has passed. On the recommended view these are surfaced first so an
    // overdue check is not lost among fresh material — the engine already
    // prioritizes one on Today, but the Practice page shows the others too.
    const due = new Set();
    if (mode === 'recommended') {
      for (const c of data.skills.competencies) {
        const s = engine.summary(state, c.id, data);
        if (s.last_demonstrated && s.next_review && s.next_review <= today) due.add(c.id);
      }
    }
    const rows=data.bank.items.filter(i=>{
      if(!engine.eligible(i,state.locality)||(domain!=='all'&&!i.competencies.some(c=>c.split('.')[0]===domain)))return false;
      const title=i.title+' '+i.competencies.map(c=>data.skills.competencies.find(s=>s.id===c).title).join(' ');
      if(!title.toLowerCase().includes(search.toLowerCase().trim()))return false;
      const known=engine.seen(state,i,data),summaries=i.competencies.map(c=>engine.summary(state,c,data));
      if(mode==='guided')return known||i.mode==='knowledge';
      if(mode==='unseen')return !known;
      if(mode==='needs-work')return !known&&summaries.some(s=>['not-yet','assisted'].includes(s.status));
      if(mode==='review-due')return !known&&summaries.some(s=>s.last_demonstrated&&s.next_review&&s.next_review<=today);
      if(mode==='capstones')return i.family==='capstone';
      if(mode==='recommended')return i.id===rec.item?.id||(!known&&i.family!=='capstone'&&summaries.some(s=>['not-yet','assisted'].includes(s.status)))||(!known&&due.has(i.competencies[0]));
      return true;
    });
    rows.sort((a,b)=>Number(b.id===rec.item?.id)-Number(a.id===rec.item?.id));
    const groups=new Map();
    const pushTo=(label,i)=>{if(!groups.has(label))groups.set(label,[]);groups.get(label).push(i);};
    const lead='Due for review';
    for(const i of rows){const label=i.family==='capstone'?'Apply several skills together':(mode==='recommended'&&due.has(i.competencies[0]))?lead:data.skills.competencies.find(c=>c.id===i.competencies[0]).title.replace(/ · .*/, '');pushTo(label,i);}
    return [...groups].map(([title,items])=>({title,items:mode==='recommended'?items.slice(0,2):items}));
  }
  return {create,discover};
});
