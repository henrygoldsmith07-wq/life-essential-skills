'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../learner/engine.js'),C=require('../learner/catalog.js');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const D={index:read('curriculum/index.json'),skills:read('curriculum/subskills.json'),bank:{items:[...read('assessments/bank.json').items,...read('assessments/capstones.json').items]},practical:read('assessor/practical-rubrics.json')},date='2026-10-03';
const item=id=>D.bank.items.find(i=>i.id===id),judgments=i=>i.scoring.map(s=>({criterion_id:s.id,judgement:'met'}));
const attempt=(s,id,extra={})=>E.recordAttempt(s,D,id,{criteria_judgements:judgments(item(id)),...extra},date);
test('a manual outcome cannot be supplied through the engine API',()=>assert.throws(()=>attempt(E.emptyState(),'M-CF-01',{outcome:'demonstrated'}),/derived/));
test('partial essential step derives not yet, all met derives self reviewed independently',()=>{
  const j=judgments(item('M-CF-01'));j[0].judgement='partly-met';
  assert.equal(attempt(E.emptyState(),'M-CF-01',{criteria_judgements:j}).records[0].outcome,'not-yet');
  const r=attempt(E.emptyState(),'M-CF-01').records[0];assert.equal(r.outcome,'demonstrated');assert.equal(r.evidence_level,'self-reviewed');
});
test('every criterion needs exactly one judgement; malformed and duplicate rows fail',()=>{
  for(const j of [[],[null],judgments(item('M-CF-01')).slice(1),[...judgments(item('M-CF-01')),judgments(item('M-CF-01'))[0]]])assert.throws(()=>attempt(E.emptyState(),'M-CF-01',{criteria_judgements:j}),/criterion/);
});
test('assessor review changes current evidence without rewriting historical attempt facts',()=>{
  const s=attempt(E.emptyState(),'M-CF-01'),original=JSON.stringify(s.records);
  const j=judgments(item('M-CF-01'));j[0].judgement='not-met';
  const next=E.reviewAttempt(s,D,s.records[0].id,{criteria_judgements:j,error_tags:['missed-payment-timing'],basis:'original-output'},date);
  assert.equal(JSON.stringify(next.records),original);assert.equal(E.summary(next,'money.cash-flow.independent',D).status,'not-yet');assert.equal(E.summary(next,'money.cash-flow.independent',D).evidence_level,'assessor-reviewed');
});
test('assessor confirmation cannot erase original help or solution exposure',()=>{
  for(const flags of [{help_used:true},{solution_seen:true}]){let s=attempt(E.emptyState(),'M-CF-01',flags);s=E.reviewAttempt(s,D,s.records[0].id,{criteria_judgements:judgments(item('M-CF-01')),basis:'directly-observed'},date);assert.equal(E.summary(s,'money.cash-flow.independent',D).status,'assisted');}
});
test('invalid review references, dates, unbounded notes and practical claims are refused',()=>{
  const s=attempt(E.emptyState(),'M-CF-01');
  for(const edit of [r=>r.record_id='missing',r=>r.date='2020-01-01',r=>r.notes='personal',r=>r.evidence_level='practical-observed',r=>r.basis='invented']){const next=E.reviewAttempt(s,D,s.records[0].id,{criteria_judgements:judgments(item('M-CF-01')),basis:'original-output'},date);edit(next.reviews[0]);assert.ok(E.validateState(next,D,date).length);}
});
test('opening feedback without saving still removes freshness after restart',()=>{
  const s=E.recordExposure(E.emptyState(),D,'M-CF-01','opened-only',date),copy=E.migrateState(JSON.parse(JSON.stringify(s)),D,date);
  assert.equal(E.seen(copy,item('M-CF-01'),D),true);
  const next=attempt(copy,'M-CF-01');assert.equal(next.records[0].phase,'practice');assert.equal(next.records[0].solution_seen,true);assert.equal(next.records[0].outcome,'assisted');
});
test('feedback after original response does not downgrade that same attempt',()=>{
  const s=E.recordExposure(E.emptyState(),D,'M-CF-01','original-attempt',date);
  assert.equal(attempt(s,'M-CF-01',{attempt_id:'original-attempt'}).records[0].outcome,'demonstrated');
  assert.throws(()=>attempt(s,'M-CF-01',{phase:'transfer'}),/unseen/);
});
test('an exposure token cannot be reused for another task or saved twice',()=>{
  const s=E.recordExposure(E.emptyState(),D,'M-CF-01','only-one',date);
  assert.throws(()=>attempt(s,'M-CF-02',{attempt_id:'only-one'}),/match/);
  const saved=attempt(s,'M-CF-01',{attempt_id:'only-one'});assert.throws(()=>attempt(saved,'M-CF-01',{attempt_id:'only-one'}),/already/);
});
test('capstone evidence is separate per competency and isolates weak criteria and errors',()=>{
  const i=item('C03'),j=judgments(i);j.find(x=>x.criterion_id==='skill-1-criterion').judgement='not-met';
  const s=attempt(E.emptyState(),'C03',{criteria_judgements:j,errors_by_competency:{'money.credit.independent':['missed-payment-timing']}});
  assert.equal(s.records.length,i.competencies.length);assert.equal(s.records[0].outcome,'not-yet');assert.ok(s.records.slice(1).every(r=>r.outcome==='demonstrated'&&r.error_tags.length===0));
  assert.equal(new Set(s.records.map(r=>r.attempt_id)).size,1);assert.notEqual(E.rollup(s,'money.independent',D).status,'demonstrated');
  const broken=structuredClone(s);broken.records.pop();assert.ok(E.validateState(broken,D,date).some(e=>e.includes('incomplete capstone')));
});
test('Wales capstone cannot appear in UK unspecified or award the wrong jurisdiction',()=>{
  assert.throws(()=>attempt(E.emptyState(),'C01'),/jurisdiction/);
  const groups=C.discover(E.emptyState(),D,E,date,{mode:'capstones'});assert.ok(groups.every(g=>g.items.every(i=>i.id!=='C01')));
});
test('legacy migrations are explicit and preserve unstructured observations without awarding a gate',()=>{
  const legacy=read('examples/legacy/review-due.json');legacy.observations=[{kind:'observed-meal-preparation',date,outcome:'demonstrated',reviewed_by:'assessor'}];
  const s=E.migrateState(legacy,D,date);assert.equal(s.schema_version,2);assert.equal(s.legacy_observations.length,1);assert.equal(s.observations.length,0);assert.equal(s.records[0].evidence_level,legacy.records[0].reviewed_by==='self'?'self-reviewed':'assessor-reviewed');
  legacy.password='private';assert.throws(()=>E.migrateState(legacy,D,date),/fields/);
});
test('structured practical failure replaces current success but retains the earlier observation',()=>{
  const rubric=D.practical.rubrics[1];let s=E.recordObservation(E.emptyState(),D,rubric.id,{criteria_judgements:judgments(rubric),access_supports:['scribe']},date);
  const j=judgments(rubric);j[0].judgement='partly-met';s=E.recordObservation(s,D,rubric.id,{criteria_judgements:j},'2026-10-04');
  assert.equal(s.observations[0].outcome,'demonstrated');assert.equal(s.observations[1].outcome,'not-yet');assert.ok(E.rollup(s,'digital-safety.applied',D).practical_missing.includes(rubric.id));
});
test('evaluation describes review strength, criterion changes, new errors, versions and observation scope',()=>{
  let s=attempt(E.emptyState(),'M-CF-01',{phase:'diagnostic',error_tags:['missed-payment-timing']});s=E.recordAttempt(s,D,'M-CF-02',{criteria_judgements:judgments(item('M-CF-02')),phase:'transfer'},'2026-10-04');
  s=E.reviewAttempt(s,D,s.records.at(-1).id,{criteria_judgements:judgments(item('M-CF-02')),error_tags:['arithmetic-error'],basis:'original-output'},'2026-10-04');
  const r=E.evaluate(s,D)[0];assert.equal(r.unseen_post.evidence_level,'assessor-reviewed');assert.equal(r.unseen_post.assessment_version,1);assert.deepEqual(r.errors_introduced,['arithmetic-error']);assert.equal(r.unseen_post.original_outcome,'demonstrated');assert.equal(r.unseen_post.outcome,'not-yet');assert.ok(Array.isArray(r.criteria_gained));assert.match(r.note,/No causal/);
});
test('Practice has a small useful default, grouped search and fresh-only views',()=>{
  const s=attempt(E.emptyState(),'M-CF-01');
  const fresh=C.discover(s,D,E,date,{mode:'unseen',domain:'money',search:'cash'});assert.ok(fresh.length);assert.ok(fresh.every(g=>g.items.every(i=>i.id!=='M-CF-01')));
  const defaultRows=C.discover(E.emptyState(),D,E,date,{});assert.ok(defaultRows.reduce((n,g)=>n+g.items.length,0)<=2);
});
test('lazy catalog caches domain fetches, retries failures and never loads feedback',async()=>{
  const calls=[],catalog=C.create({...D,bank:{items:[{...item('M-CF-01'),chunk:'money'}]}},async url=>{calls.push(url);return {ok:true,json:async()=>({items:[item('M-CF-01')]})};});
  await catalog.item('M-CF-01');await catalog.item('M-CF-01');assert.deepEqual(calls,['chunks/money.json']);
  let n=0;const retry=C.create({...D,bank:{items:[{...item('M-CF-01'),chunk:'money'}]}},async()=>({ok:++n>1,json:async()=>({items:[item('M-CF-01')]})}));await assert.rejects(()=>retry.item('M-CF-01'));await retry.item('M-CF-01');assert.equal(n,2);
});
test('prior solutions cannot be transfer even when exposure history is absent',()=>{
  assert.throws(()=>attempt(E.emptyState(),'M-CF-01',{solution_seen:true,phase:'transfer'}),/known answers/);
  assert.equal(attempt(E.emptyState(),'M-CF-01',{solution_seen:true}).records[0].phase,'practice');
});
test('nation-specific feedback exposures retain locality restrictions',()=>{
  const s=E.recordExposure(E.emptyState('wales'),D,'C01','wales-feedback',date);
  assert.ok(E.validateState({...s,locality:'uk'},D,date).some(e=>e.includes('jurisdiction')));
});
test('null and unknown exposure records are refused without crashing',()=>{
  const s=E.emptyState();s.exposures=[null];assert.ok(E.validateState(s,D,date).length);
});
test('practice-only evidence remains present in descriptive evaluation',()=>{
  const s=attempt(E.emptyState(),'M-CF-01',{phase:'practice',help_used:true});const r=E.evaluate(s,D)[0];assert.equal(r.attempts,1);assert.equal(r.practice[0].outcome,'assisted');assert.equal(r.unseen_post,null);
});
test('incorrect competency error assignments cannot disappear silently',()=>{
  assert.throws(()=>attempt(E.emptyState(),'C03',{errors_by_competency:{'money.credits.independent':['arithmetic-error']}}),/assignment/);
  assert.throws(()=>attempt(E.emptyState(),'C03',{errors_by_competency:{'money.credit.independent':['unknown']}}),/assignment/);
});
