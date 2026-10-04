'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const E=require('../learner/engine.js');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const D={index:read('curriculum/index.json'),skills:read('curriculum/subskills.json'),bank:{items:[...read('assessments/bank.json').items,...read('assessments/capstones.json').items]},practical:read('assessor/practical-rubrics.json')};
const TODAY='2026-10-03';
const clone=v=>JSON.parse(JSON.stringify(v));
function add(state,id,date=TODAY,extra={}) {
  const i=D.bank.items.find(i=>i.id===id),{criteria_met,outcome,...facts}=extra;
  const met=criteria_met||(outcome==='not-yet'?[]:i.scoring.map(s=>s.id));
  return E.recordAttempt(state,D,id,{criteria_judgements:i.scoring.map(s=>({criterion_id:s.id,judgement:met.includes(s.id)?'met':'not-met'})),...facts},date);
}
function observe(state,kind,date,outcome='demonstrated'){
  const r=D.practical.rubrics.find(r=>r.id===kind);
  return E.recordObservation(state,D,kind,{criteria_judgements:r.scoring.map(s=>({criterion_id:s.id,judgement:outcome==='demonstrated'?'met':'not-met'}))},date);
}
function readyCash(){let s=E.emptyState('uk','money-admin');s.goal_competencies=['money.cash-flow.independent'];s=add(s,'MONEY-BUDGET-F01','2026-09-20');s=add(s,'MONEY-CASH-FLOW-F01','2026-09-21');return s;}

test('every fictional profile passes strict state and semantic validation',()=>{
  for(const file of fs.readdirSync(path.join(root,'examples/learners')))assert.deepEqual(E.validateState(read('examples/learners/'+file),D,TODAY),[],file);
});
test('new learner gets a concrete prerequisite diagnostic with transparent reason',()=>{
  const s=E.emptyState();s.goal_competencies=['money.credit.independent'];const rec=E.recommend(s,D,TODAY);
  assert.equal(rec.kind,'diagnostic');assert.ok(rec.item);assert.ok(rec.reason.some(r=>r.includes('prerequisite')));assert.ok(rec.estimated_time_minutes>0);
  assert.ok(rec.competency.prerequisites.every(c=>E.summary(s,c,D).status==='demonstrated'));
});
test('payment timing error produces relevant fresh next-task advice and elapsed date',()=>{
  const s=read('examples/learners/cash-flow-gap.json'),r=E.recommend(s,D,TODAY);
  assert.equal(r.competency.id,'money.cash-flow.independent');assert.equal(r.item.id,'M-CF-04');
  assert.ok(r.reason.some(t=>t.includes('date order')));assert.ok(r.reason.some(t=>t.includes('6 days')));
});
test('assisted performance never becomes independent evidence',()=>{
  let s=readyCash();s=add(s,'M-CF-02','2026-09-22',{help_used:true});assert.equal(E.summary(s,'money.cash-flow.independent',D).status,'assisted');
  assert.equal(E.rollup(s,'money.independent',D).status,'assisted');
});
test('access supports preserve independent outcome',()=>{
  const s=add(readyCash(),'M-CF-02','2026-09-22',{access_supports:['scribe','extra-time','screen-reader']});
  assert.equal(E.summary(s,'money.cash-flow.independent',D).status,'demonstrated');
});
test('all essential criteria and no error tags are required',()=>{
  assert.equal(add(readyCash(),'M-CF-02',TODAY,{criteria_met:['criterion']}).records.at(-1).outcome,'not-yet');
  assert.equal(add(readyCash(),'M-CF-02',TODAY,{error_tags:['arithmetic-error']}).records.at(-1).outcome,'not-yet');
});
test('unsafe error repair is prioritised within eligible goals',()=>{
  let s=E.emptyState('uk','general');s=add(s,'DIGITAL-SAFETY-SCAMS-F01','2026-10-01',{outcome:'not-yet',error_tags:['reveals-sensitive-information'],criteria_met:[]});
  const r=E.recommend(s,D,TODAY);assert.equal(r.competency.id,'digital-safety.scams.foundation');assert.match(r.reason[0],/safety, privacy/);
});
test('review scheduling advances, resets after help, and preserves success history',()=>{
  let s=readyCash();s=add(s,'M-CF-02','2026-09-22');let x=E.summary(s,'money.cash-flow.independent',D);assert.equal(x.next_review,'2026-09-25');
  s=add(s,'M-CF-03','2026-09-26',{phase:'retention'});x=E.summary(s,'money.cash-flow.independent',D);assert.equal(x.next_review,'2026-10-03');assert.equal(x.retention_passed,1);
  s=add(s,'M-CF-05',TODAY,{phase:'retention',help_used:true});x=E.summary(s,'money.cash-flow.independent',D);assert.equal(x.next_review,'2026-10-05');assert.equal(x.first_demonstrated,'2026-09-22');assert.equal(x.last_demonstrated,'2026-09-26');assert.equal(x.retention_status,'needs-review');
});
test('configured intervals change scheduling without changing engine code',()=>{
  const custom=clone(D);custom.skills.review_policy.default.intervals_days=[5,10];
  const s=add(readyCash(),'M-CF-02','2026-09-22');assert.equal(E.summary(s,'money.cash-flow.independent',custom).next_review,'2026-09-27');
});
test('due reviews outrank unassessed goals and select unseen material',()=>{
  let s=readyCash();s=add(s,'M-CF-02','2026-09-23');s.goal_competencies=['work.evidence.independent'];
  const r=E.recommend(s,D,TODAY);assert.equal(r.kind,'retention');assert.ok(!s.records.some(a=>a.item_id===r.item.id));assert.ok(r.reason[0].includes('due'));
});
test('transfer blocks foundation material recycled under a different item ID',()=>{
  assert.throws(()=>add(readyCash(),'M-CF-01','2026-09-22',{phase:'transfer'}),/unseen materials/);
});
test('retention requires earlier independent performance and a later date',()=>{
  assert.throws(()=>add(E.emptyState(),'M-CF-01',TODAY,{phase:'retention'}),/earlier demonstration/);
  let s=add(E.emptyState(),'M-CF-01',TODAY);assert.throws(()=>add(s,'M-CF-02',TODAY,{phase:'retention'}),/delayed materials/);
});
test('seen answers can be practised but not accepted as new transfer',()=>{
  let s=add(E.emptyState(),'M-CF-01','2026-09-20');assert.throws(()=>add(s,'M-CF-01','2026-09-21',{phase:'transfer'}),/unseen/);
  s=add(s,'M-CF-01','2026-09-21',{phase:'practice',solution_seen:true});assert.equal(s.records.at(-1).outcome,'assisted');
});
test('UK unspecified never inherits England or Wales law and GB excludes NI',()=>{
  assert.equal(E.covers('england','uk'),false);assert.equal(E.covers('wales','uk'),false);assert.equal(E.covers('great-britain','northern-ireland'),false);assert.equal(E.covers('uk','wales'),true);
  const s=E.emptyState('uk','independent-living');s.goal_competencies=['major-decisions.housing.independent'];
  const r=E.recommend(s,D,TODAY);assert.notEqual(r.item?.id?.slice(0,4),'W-HO');assert.throws(()=>add(s,'W-HO-01'),/jurisdiction/);
});
test('Wales housing recommendation uses a fresh Wales item after a jurisdiction error',()=>{
  const s=read('examples/learners/wales-housing.json'),r=E.recommend(s,D,TODAY);assert.equal(r.competency.id,'major-decisions.housing.independent');assert.ok(r.item.jurisdictions.includes('wales'));assert.ok(r.reason.some(t=>t.includes('jurisdiction')));
});
test('unknown fields refuse passwords or unrestricted personal data',()=>{
  const s=E.emptyState();s.password='secret';assert.ok(E.validateState(s,D,TODAY).some(e=>e.includes('fields')));
  const other=readyCash();other.records[0].bank_details='private';assert.ok(E.validateState(other,D,TODAY).length);
});
test('malformed record objects are refused without crashing validation',()=>{
  const s=readyCash();s.records.unshift(null);assert.ok(E.validateState(s,D,TODAY).length);
  s.records.at(-1).phase='retention';assert.ok(E.validateState(s,D,TODAY).length);
});
test('invalid dates, versions, outcomes, errors and duplicate IDs are refused',()=>{
  for(const edit of [r=>r.date='2026-02-30',r=>r.date='2099-01-01',r=>r.assessment_version=99,r=>r.outcome='confident',r=>r.error_tags=['unknown'],r=>r.error_tags=null,r=>r.criteria_judgements=null,r=>r.competency_id='home.meals.independent']){
    const s=readyCash();edit(s.records[0]);assert.ok(E.validateState(s,D,TODAY).length);
  }
  const s=readyCash();s.records[1].id=s.records[0].id;assert.ok(E.validateState(s,D,TODAY).length);
});
test('legacy rollup uses only stated relevant subskills and practical evidence gate',()=>{
  const s=add(E.emptyState(),'MONEY-BUDGET-F01',TODAY);assert.equal(E.rollup(s,'money.foundation',D).status,'demonstrated');assert.notEqual(E.rollup(s,'money.independent',D).status,'demonstrated');
  let h=E.emptyState();h=add(h,'HOME-MEALS-I01','2026-09-01');h=add(h,'HOME-ROUTINES-I01','2026-09-02');assert.equal(E.rollup(h,'home.applied',D).status,'practical-evidence-required');
  h=observe(h,'observed-meal-preparation','2026-09-03');assert.equal(E.rollup(h,'home.applied',D).status,'demonstrated');
});
test('a failed practical observation revokes current practical rollup',()=>{
  let h=add(E.emptyState(),'HOME-MEALS-I01','2026-09-01');h=add(h,'HOME-ROUTINES-I01','2026-09-02');h=observe(h,'observed-meal-preparation','2026-09-03');h=observe(h,'observed-meal-preparation','2026-09-04','not-yet');assert.equal(E.rollup(h,'home.applied',D).status,'practical-evidence-required');
});
test('fresh-bank exhaustion is explicit and never substitutes an old answer',()=>{
  let s=E.emptyState();s.goal_competencies=['money.cash-flow.independent'];
  const custom=clone(D);custom.bank.items=custom.bank.items.filter(i=>i.competencies[0]==='money.cash-flow.foundation');custom.skills.competencies=custom.skills.competencies.filter(c=>c.id==='money.cash-flow.foundation');custom.skills.rollups=[];s.goal_competencies=['money.cash-flow.foundation'];
  for(const i of custom.bank.items)s=E.recordAttempt(s,custom,i.id,{criteria_judgements:i.scoring.map(s=>({criterion_id:s.id,judgement:'not-met'})),phase:'practice'},TODAY);
  assert.equal(E.recommend(s,custom,TODAY).kind,'fresh-materials-needed');
});
test('determinism: same state/date yields byte-identical recommendation',()=>{
  const s=read('examples/learners/cash-flow-gap.json');assert.equal(JSON.stringify(E.recommend(s,D,TODAY)),JSON.stringify(E.recommend(clone(s),D,TODAY)));
});
test('dates do not drift across leap days or daylight-saving boundaries',()=>{
  assert.equal(E.addDays('2028-02-28',1),'2028-02-29');assert.equal(E.addDays('2026-10-24',2),'2026-10-26');
});
test('evaluation separates missing observations, unseen post and retained evidence',()=>{
  const result=E.evaluate(read('examples/learners/evaluation-cycle.json'),D).find(r=>r.competency_id==='money.cash-flow.independent');
  assert.equal(result.pre.outcome,'not-yet');assert.equal(result.unseen_post.outcome,'demonstrated');assert.equal(result.delayed.outcome,'demonstrated');assert.deepEqual(result.errors_removed,['missed-payment-timing']);assert.equal(result.comparable_criteria,true);
  const newResult=E.evaluate(add(E.emptyState(),'M-CF-01'),D)[0];assert.equal(newResult.pre,null);assert.equal(newResult.delayed,null);
});
test('published fictional evaluation output matches the shared engine',()=>{
  assert.deepEqual(read('examples/evaluation-output.json'),{schema_version:2,fictional:true,results:E.evaluate(read('examples/learners/evaluation-cycle.json'),D)});
});
test('progress separates knowledge and independent performance; no vanity metrics',()=>{
  const p=E.progress(add(E.emptyState(),'MONEY-BUDGET-F01'),D,TODAY);assert.equal(p.totals.knowledge,1);assert.equal(p.totals.demonstrated,0);assert.equal(p.totals.retention_passed,0);assert.equal(p.totals.xp,undefined);
});
test('error category chooses a different targeted unseen variant',()=>{
  const s=read('examples/learners/cash-flow-gap.json');s.records.at(-1).error_tags=['assumes-missing-information'];
  assert.equal(E.recommend(s,D,TODAY).item.id,'M-CF-05');
});
test('full current performance avoids redundant knowledge review without inventing evidence',()=>{
  let s=readyCash();s=add(s,'M-CF-02','2026-09-22');assert.equal(E.summary(s,'money.cash-flow.foundation',D).next_review,null);
  assert.equal(E.summary(s,'money.budget.independent',D).status,'unassessed');
});
test('knowledge item cannot be claimed as transfer; solution exposure forces help',()=>{
  assert.throws(()=>add(E.emptyState(),'MONEY-BUDGET-F01',TODAY,{phase:'transfer'}),/knowledge task/);
  assert.equal(add(E.emptyState(),'M-CF-01',TODAY,{solution_seen:true}).records[0].outcome,'assisted');
});

if(process.argv.includes('--write-example'))fs.writeFileSync(path.join(root,'examples/evaluation-output.json'),JSON.stringify({schema_version:2,fictional:true,results:E.evaluate(read('examples/learners/evaluation-cycle.json'),D)},null,2)+'\n');
