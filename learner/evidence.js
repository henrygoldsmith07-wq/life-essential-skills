/* Strict bounded evidence model. Original attempt facts and later reviews stay separate. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.Evidence=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const access=['screen-reader','scribe','extra-time','spoken-response','large-print','translation','alternative-context'];
  const clone=v=>JSON.parse(JSON.stringify(v));
  const id=v=>typeof v==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(v);
  function exact(v,keys){return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));}
  function strings(v,allowed,max=80){return Array.isArray(v)&&v.length<=max&&new Set(v).size===v.length&&v.every(x=>allowed.includes(x));}
  function rubric(item,cid){return item.scoring.filter(s=>!s.competency_id||s.competency_id===cid);}
  function validJudgements(rows,scoring){return Array.isArray(rows)&&rows.length===scoring.length&&new Set(rows.map(r=>r?.criterion_id)).size===rows.length&&rows.every(r=>exact(r,['criterion_id','judgement'])&&scoring.some(s=>s.id===r.criterion_id)&&['met','partly-met','not-met'].includes(r.judgement));}
  function derive(scoring,judgements,help,seen,errors){
    if(!validJudgements(judgements,scoring))throw new Error('Compare every criterion: met, partly met or not met.');
    if(errors.length||scoring.some(s=>s.essential&&judgements.find(j=>j.criterion_id===s.id).judgement!=='met'))return 'not-yet';
    return help||seen?'assisted':'demonstrated';
  }
  function effective(state,record,data){
    const review=state.reviews.filter(r=>r.record_id===record.id).at(-1);
    const item=data.bank.items.find(i=>i.id===record.item_id);
    const facts=review?{...record,criteria_judgements:review.criteria_judgements,error_tags:review.error_tags,evidence_level:review.evidence_level,reviewer_type:review.reviewer_type,review_basis:review.basis}:record;
    return {...facts,outcome:derive(rubric(item,record.competency_id),facts.criteria_judgements,record.help_used,record.solution_seen,facts.error_tags)};
  }
  function seen(state,item,data,attemptId=null){
    const group=rid=>data.bank.items.find(i=>i.id===rid)?.exposure_group;
    return state.records.some(r=>r.attempt_id!==attemptId&&group(r.item_id)===item.exposure_group)||state.exposures.some(e=>e.attempt_id!==attemptId&&group(e.item_id)===item.exposure_group);
  }
  function validate(state,data,today,iso,legacyValidate,eligible){
    const errors=[];
    if(!exact(state,['schema_version','locality','pathway','goal_competencies','records','reviews','observations','legacy_observations','exposures'])||state.schema_version!==2)return ['Unknown or missing fields, or unsupported evidence version'];
    for(const [key,max] of [['records',5000],['reviews',5000],['observations',500],['legacy_observations',500],['exposures',5000]])if(!Array.isArray(state[key])||state[key].length>max)errors.push('Invalid bounded '+key);
    if(errors.length)return errors;
    const itemMap=new Map(data.bank.items.map(i=>[i.id,i])),compMap=new Map(data.skills.competencies.map(c=>[c.id,c]));
    const tags=data.skills.error_tags.map(t=>t.id),ids=new Set(),bundles=new Map();
    const dated=(rows,label)=>rows.forEach((r,n)=>{if(!iso(r?.date)||(today&&r.date>today)||(n&&r.date<rows[n-1]?.date))errors.push(label+': invalid, future, or unordered date');});
    dated(state.records,'Record');dated(state.reviews,'Review');dated(state.observations,'Observation');dated(state.exposures,'Exposure');
    for(const r of state.records){
      if(!exact(r,['id','attempt_id','competency_id','item_id','assessment_version','date','phase','outcome','help_used','access_supports','error_tags','solution_seen','criteria_judgements','evidence_level','reviewer_type'])){errors.push('Record: unknown or missing fields');continue;}
      const item=itemMap.get(r.item_id),c=compMap.get(r.competency_id);
      if(!id(r.id)||ids.has(r.id)||!id(r.attempt_id))errors.push('Record: duplicate or invalid record ID');ids.add(r.id);
      if(!item||!c||!item.competencies.includes(c.id)||r.assessment_version!==item.version){errors.push('Record: assessment/competency/version mismatch');continue;}
      if(!strings(r.access_supports,access)||!strings(r.error_tags,c.error_tags)||typeof r.help_used!=='boolean'||typeof r.solution_seen!=='boolean')errors.push('Record: invalid help, access supports or error tags');
      if(!['self-reviewed','assessor-reviewed'].includes(r.evidence_level)||r.reviewer_type!==(r.evidence_level==='self-reviewed'?'learner':'assessor'))errors.push('Record: invalid evidence level/reviewer');
      if(!validJudgements(r.criteria_judgements,rubric(item,c.id)))errors.push('Record: invalid criterion evidence');
      else if(strings(r.error_tags,c.error_tags)&&r.outcome!==derive(rubric(item,c.id),r.criteria_judgements,r.help_used,r.solution_seen,r.error_tags))errors.push('Record: outcome must be derived from essential criteria/help/errors');
      const bundle=bundles.get(r.attempt_id)||[];
      if(bundle.some(x=>x.item_id!==r.item_id||x.date!==r.date||x.assessment_version!==r.assessment_version||x.help_used!==r.help_used||x.solution_seen!==r.solution_seen||JSON.stringify(x.access_supports)!==JSON.stringify(r.access_supports)||x.competency_id===r.competency_id))errors.push('Record: inconsistent or reused attempt bundle');
      bundle.push(r);bundles.set(r.attempt_id,bundle);
      const known=state.records.slice(0,state.records.indexOf(r)).some(x=>x?.attempt_id!==r.attempt_id&&itemMap.get(x?.item_id)?.exposure_group===item.exposure_group)||state.exposures.some(e=>e?.attempt_id!==r.attempt_id&&e?.date<=r.date&&itemMap.get(e?.item_id)?.exposure_group===item.exposure_group);
      if(known&&(r.phase==='transfer'||r.phase==='retention'))errors.push('Record: transfer requires unseen materials');
      if(r.solution_seen&&(r.phase==='transfer'||r.phase==='retention'))errors.push('Record: known answers cannot be unseen transfer or retention');
      if(known&&!r.solution_seen)errors.push('Record: previously seen material must record solution exposure');
    }
    for(const [aid,rows] of bundles){const item=itemMap.get(rows[0].item_id);if(item&&rows.length!==item.competencies.length)errors.push(aid+': incomplete capstone evidence bundle');}
    const reviewIds=new Set();
    for(const r of state.reviews){
      if(!exact(r,['id','record_id','date','criteria_judgements','error_tags','evidence_level','reviewer_type','basis'])){errors.push('Review: unknown or missing fields');continue;}
      const original=state.records.find(x=>x?.id===r.record_id),item=itemMap.get(original?.item_id),c=compMap.get(original?.competency_id);
      if(!id(r.id)||reviewIds.has(r.id)||!original||r.date<original.date||r.evidence_level!=='assessor-reviewed'||r.reviewer_type!=='assessor'||!['original-output','directly-observed'].includes(r.basis))errors.push('Invalid assessor review');reviewIds.add(r.id);
      if(!c||!strings(r.error_tags,c.error_tags)||!item||!validJudgements(r.criteria_judgements,rubric(item,c?.id)))errors.push('Review: invalid criterion evidence or errors');
    }
    const obsIds=new Set();
    for(const o of state.observations){
      if(!exact(o,['id','kind','assessment_version','date','criteria_judgements','error_tags','help_used','access_supports','outcome','evidence_level','reviewer_type'])){errors.push('Observation: unknown or missing fields');continue;}
      const r=data.practical?.rubrics.find(r=>r.id===o.kind);
      if(!id(o.id)||obsIds.has(o.id)||!r||r.version!==o.assessment_version||o.evidence_level!=='practical-observed'||o.reviewer_type!=='assessor'||typeof o.help_used!=='boolean'||!strings(o.access_supports,access)||!strings(o.error_tags,tags)||!validJudgements(o.criteria_judgements,r?.scoring||[]))errors.push('Invalid practical observation: assessor review required');
      else if(o.outcome!==derive(r.scoring,o.criteria_judgements,o.help_used,false,o.error_tags))errors.push('Observation outcome must be derived');obsIds.add(o.id);
    }
    const exposureIds=new Set();
    for(const e of state.exposures){
      if(!exact(e,['item_id','assessment_version','date','attempt_id'])){errors.push('Exposure: unknown or missing fields');continue;}
      if(!exact(e,['item_id','assessment_version','date','attempt_id'])||!id(e.attempt_id)||!itemMap.has(e.item_id)||itemMap.get(e.item_id).version!==e.assessment_version||exposureIds.has(e.attempt_id))errors.push('Invalid or duplicate feedback exposure');
      if(itemMap.has(e?.item_id)&&!eligible(itemMap.get(e.item_id),state.locality))errors.push('Exposure: incompatible jurisdiction');
      exposureIds.add(e.attempt_id);
      const bundle=bundles.get(e.attempt_id);
      if(bundle&&(bundle[0].item_id!==e.item_id||bundle[0].date!==e.date))errors.push('Exposure does not match attempt facts');
    }
    if(errors.length)return errors;
    // Reuse the existing jurisdiction, dates, transfer and retention guarantees.
    const project=r=>({id:r.id,competency_id:r.competency_id,item_id:r.item_id,assessment_version:r.assessment_version,date:r.date,phase:r.phase,outcome:r.outcome,help_used:r.help_used,access_supports:r.access_supports,error_tags:r.error_tags,criteria_met:r.criteria_judgements.filter(j=>j.judgement==='met').map(j=>j.criterion_id),reviewed_by:r.reviewer_type==='learner'?'self':'assessor',solution_seen:r.solution_seen});
    const projected={schema_version:1,locality:state.locality,pathway:state.pathway,goal_competencies:state.goal_competencies,records:state.records.map(project),observations:state.legacy_observations};
    errors.push(...legacyValidate(projected,data,today));
    return errors;
  }
  function migrate(state,data,today,legacyValidate){
    if(state?.schema_version===2)return clone(state);
    const errors=legacyValidate(state,data,today);if(errors.length)throw new Error('Legacy import refused: '+errors[0]);
    const next={...clone(state),schema_version:2,reviews:[],exposures:[],legacy_observations:clone(state.observations),observations:[]};
    next.records=state.records.map((r,n)=>{
      const item=data.bank.items.find(i=>i.id===r.item_id);
      const {criteria_met,reviewed_by,...facts}=r;
      const judgements=rubric(item,r.competency_id).map(s=>({criterion_id:s.id,judgement:criteria_met.includes(s.id)?'met':'not-met'}));
      const known=state.records.slice(0,n).some(x=>data.bank.items.find(i=>i.id===x.item_id)?.exposure_group===item.exposure_group);
      const exposed=r.solution_seen||known;
      return {...facts,solution_seen:exposed,attempt_id:'legacy-'+r.id,criteria_judgements:judgements,evidence_level:reviewed_by==='assessor'?'assessor-reviewed':'self-reviewed',reviewer_type:reviewed_by==='assessor'?'assessor':'learner',outcome:derive(rubric(item,r.competency_id),judgements,r.help_used,exposed,r.error_tags)};
    });return next;
  }
  return {access,clone,exact,strings,rubric,validJudgements,derive,effective,seen,validate,migrate};
});
