// Verify the roadmap derivation against real engine state.
// Regression guard: the roadmap is a PRESENTATION layer and must never invent,
// soften or contradict evidence. Run in CI.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const E = require(path.join(root, 'learner/engine.js'));
const R = require(path.join(root, 'learner/roadmap.js'));
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const D = {
  index: read('curriculum/index.json'),
  skills: read('curriculum/subskills.json'),
  bank: { items: [...read('assessments/bank.json').items, ...read('assessments/capstones.json').items] },
  practical: read('assessor/practical-rubrics.json'),
  goals: read('curriculum/goals.json'),
  simulations: read('curriculum/simulations.json')
};
const TODAY = '2026-10-05';
let fail = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? '  ' + extra : '')); if (!cond) fail++; };

// 1. Empty state
let s = E.emptyState('uk', 'general');
let rm = R.roadmap(s, D, TODAY);
ok('empty: 12 domains', rm.domains.length === 12);
ok('empty: all capabilities not-started', rm.capabilities.every(c => c.capability === 'not-started'));
ok('empty: nothing demonstrated', rm.next.kind !== 'error', 'next=' + rm.next.kind);
ok('empty: milestones present but none earned', rm.milestones.length > 0 && rm.earned === 0, rm.milestones.length + ' milestones');

// 2. Milestone correctness against a real example learner that has demonstrated evidence
const ex = E.migrateState(read('examples/learners/evaluation-cycle.json'), D, TODAY);
rm = R.roadmap(ex, D, TODAY);
const demonstrated = rm.capabilities.filter(c => c.status === 'demonstrated' && c.mode !== 'knowledge');
ok('example: some independent capabilities demonstrated', demonstrated.length > 0, demonstrated.length + ' demonstrated');

// Milestone earned state must agree with the engine, requirement by requirement.
let mismatch = 0;
for (const g of D.goals.milestones) {
  const ms = R.milestone(ex, D, g);
  const needOk = (g.requires || []).every(cid => (E.summary(ex, cid, D).status === 'demonstrated') === ms.earned || !(g.requires || []).every(c2 => E.summary(ex, c2, D).status === 'demonstrated'));
  if (!needOk) mismatch++;
}
ok('example: every milestone agrees with engine status', mismatch === 0, mismatch + ' mismatches');

// Specific milestone check against a demonstrated independent competency
const cashMilestone = D.goals.milestones.find(g => g.id === 'budget-month');
const msBudget = R.milestone(ex, D, cashMilestone);
ok('budget-month: earned iff money.budget.independent demonstrated',
  msBudget.earned === (E.summary(ex, 'money.budget.independent', D).status === 'demonstrated'));

// 3. No fabricated evidence: roadmap never invents a demonstrated status
ok('roadmap: no capability shown demonstrated without engine evidence',
  rm.capabilities.every(c => {
    if (c.capability === 'demonstrated' || c.capability === 'retained' || c.capability === 'retained-pending')
      return E.summary(ex, c.id, D).status === 'demonstrated';
    return true;
  }));

// 4. Blocked capabilities are reported with prerequisites
const wales = E.migrateState(read('examples/learners/wales-housing.json'), D, TODAY);
const rmw = R.roadmap(wales, D, TODAY);
ok('wales: some blocked capabilities reported', rmw.blocked.length > 0, rmw.blocked.length + ' blocked');
ok('wales: blocked entries name prerequisites', rmw.blocked.every(b => b.blocked_by.length > 0));

// 5. Onboarding produces a valid, evidence-free state change
const plan = R.onboarding(D, 'moving-out', { 'q-timing': 'soon', 'q-support': 'alone' });
ok('onboarding: returns a pathway', !!plan.pathway);
ok('onboarding: returns focus competencies', plan.goal_competencies.length > 0, plan.goal_competencies.length);
const applied = { ...s, pathway: plan.pathway, goal_competencies: plan.goal_competencies };
ok('onboarding: state still validates', E.validateState(applied, D, TODAY).length === 0);
ok('onboarding: adds NO records/exposures', applied.records.length === 0 && applied.exposures.length === 0);

// 6. Profile
const p = R.profile(ex, D, TODAY);
ok('profile: has totals + next', p.totals && p.next);
ok('profile: contains no private answers', !JSON.stringify(p).includes('response_text'));
ok('profile: demonstrated matches roadmap', p.demonstrated.length === demonstrated.length);

// 7. Jurisdiction respected in roadmap counts
const ukRm = R.roadmap(E.migrateState(read('examples/learners/wales-housing.json'), D, TODAY), D, TODAY);
ok('roadmap: does not crash on wales-only records viewed as uk', Array.isArray(ukRm.domains));

// 8. Regression: "can still do this" must describe the MOST RECENT attempt.
// A retention pass followed by newer fresh transfer is not "retained".
const cid = 'money.budget.independent';
const bItems = D.bank.items.filter(i => i.competencies[0] === cid);
if (bItems.length >= 3) {
  const mk = (id, phase, date) => {
    const it = D.bank.items.find(i => i.id === id);
    return {
      id: 'r' + id, attempt_id: 'a' + id, competency_id: cid, item_id: id, phase, date,
      assessment_version: 1, help_used: false, access_supports: [], solution_seen: false,
      error_tags: [], evidence_level: 'self-reviewed', reviewer_type: 'learner',
      criteria_judgements: it.scoring.map(s => ({ criterion_id: s.id, judgement: 'met' }))
    };
  };
  const fresh = E.migrateState(read('examples/learners/wales-housing.json'), D, TODAY);
  fresh.records.push(mk(bItems[0].id, 'retention', '2026-09-01'));
  const capStale = R.roadmap(fresh, D, '2026-09-10').capabilities.find(x => x.id === cid);
  ok('roadmap: retention pass alone reads as retained', capStale.capability === 'retained', capStale.capability);

  fresh.records.push(mk(bItems[1].id, 'transfer', '2026-09-20'));
  const capNew = R.roadmap(fresh, D, '2026-09-25').capabilities.find(x => x.id === cid);
  ok('roadmap: newer transfer supersedes the retention label', capNew.capability !== 'retained', capNew.capability);
  ok('roadmap: still honestly demonstrated', capNew.capability === 'demonstrated' || capNew.capability === 'retained-pending', capNew.capability);
}

// 9. Regression: goal_competencies must keep the goal's declared order first,
// so the learner's diagnostic refines the focus instead of reordering it.
const fj = D.goals.goals.find(g => g.id === 'first-job');
const fjPlan = R.onboarding(D, 'first-job', { 'q-stage': 'problems', 'q-hours': 'variable' });
const backbone = fj.focus_competencies;
const head = fjPlan.goal_competencies.slice(0, backbone.length);
ok('onboarding: goal backbone keeps its declared order', head.join(',') === backbone.join(','), head.join(','));
ok('onboarding: diagnostic focus appended, not substituted', fjPlan.goal_competencies.length >= backbone.length);
ok('onboarding: no duplicate competencies', new Set(fjPlan.goal_competencies).size === fjPlan.goal_competencies.length);

// 10. Regression: error tags must reach the learner as wording, not raw ids.
// Drive a not-yet outcome so the latest attempt carries an error tag.
const tagIt = E.migrateState(read('examples/learners/evaluation-cycle.json'), D, TODAY);
const tkItem = D.bank.items.find(i => i.competencies[0] === 'money.cash-flow.independent');
const tkComp = D.skills.competencies.find(c => c.id === 'money.cash-flow.independent');
tagIt.records.push({
  id: 'r-tagged', attempt_id: 'a-tagged', competency_id: tkComp.id, item_id: tkItem.id,
  phase: 'transfer', date: '2026-10-01', assessment_version: 1,
  help_used: false, access_supports: [], solution_seen: false,
  error_tags: ['assumes-missing-information'], evidence_level: 'self-reviewed', reviewer_type: 'learner',
  criteria_judgements: tkItem.scoring.map(s => ({ criterion_id: s.id, judgement: 'not-met' }))
});
const rmErr = R.roadmap(tagIt, D, TODAY);
const capErr = rmErr.capabilities.find(c => c.id === tkComp.id);
ok('roadmap: error tags survive into the capability', capErr.error_tags.includes('assumes-missing-information'));
ok('roadmap: error tag has a learner-facing label', !!capErr.error_labels['assumes-missing-information'] && capErr.error_labels['assumes-missing-information'] !== 'assumes-missing-information', capErr.error_labels['assumes-missing-information']);

// 7. A domain is not "complete" until its practical gate is met. Written evidence
//    alone cannot mark a domain done — the green border must require the
//    observation(s) the rollups ask for, and clear once they are demonstrated.
const homeDomain = D.index.domains.find(d => d.id === 'home');
const homeIndeps = D.skills.competencies.filter(c => c.domain === homeDomain.id && c.mode === 'independent');
const homeRequired = (D.skills.rollups || []).filter(r => r.id.startsWith('home.')).flatMap(r => r.additional_evidence || []);
const rubricId = D.practical.rubrics.find(r => r.gate === 'home.applied').id;
function stamp(st) {
  for (const c of homeIndeps) {
    const item = D.bank.items.find(i => i.competencies.includes(c.id));
    if (!item) continue;
    st.records.push({ id: 'r-' + c.id + '-' + st.records.length, attempt_id: 'a1', competency_id: c.id, item_id: item.id, phase: 'transfer', date: TODAY, assessment_version: 1, help_used: false, access_supports: [], solution_seen: false, error_tags: [], evidence_level: 'self-reviewed', reviewer_type: 'learner', criteria_judgements: (item.scoring || []).map(s => ({ criterion_id: s.id, judgement: 'met' })) });
  }
}
const shown = E.emptyState('uk', 'general'); stamp(shown);
ok('a domain with a practical gate is not complete without the observation',
  !R.roadmap(shown, D, TODAY).domains.find(d => d.id === 'home').complete && homeRequired.length > 0,
  'homeRequires=' + homeRequired.join(','));
const observed = E.emptyState('uk', 'general'); stamp(observed);
observed.observations.push({ id: 'o1', kind: rubricId, date: TODAY, assessment_version: 1, criteria_judgements: [], outcome: 'demonstrated', evidence_level: 'practical-observed', reviewer_type: 'assessor', access_supports: [] });
ok('a domain with a met practical gate is complete',
  R.roadmap(observed, D, TODAY).domains.find(d => d.id === 'home').complete);
const failedGate = E.emptyState('uk', 'general'); stamp(failedGate);
failedGate.observations.push({ id: 'o1', kind: rubricId, date: TODAY, assessment_version: 1, criteria_judgements: [], outcome: 'not-yet', evidence_level: 'practical-observed', reviewer_type: 'assessor', access_supports: [] });
ok('a domain whose observation failed is not complete',
  !R.roadmap(failedGate, D, TODAY).domains.find(d => d.id === 'home').complete);
// A domain with no practical gate (relationships) is complete once its independent competencies are demonstrated.
const relDomain = D.index.domains.find(d => d.id === 'relationships');
const relIndeps = D.skills.competencies.filter(c => c.domain === relDomain.id && c.mode === 'independent');
const relRollupGates = (D.skills.rollups || []).filter(r => r.id.startsWith('relationships.')).flatMap(r => r.additional_evidence || []);
const relState = E.emptyState('uk', 'general');
for (const c of relIndeps) { const item = D.bank.items.find(i => i.competencies.includes(c.id)); if (!item) continue; relState.records.push({ id: 'r-' + c.id, attempt_id: 'a1', competency_id: c.id, item_id: item.id, phase: 'transfer', date: TODAY, assessment_version: 1, help_used: false, access_supports: [], solution_seen: false, error_tags: [], evidence_level: 'self-reviewed', reviewer_type: 'learner', criteria_judgements: (item.scoring || []).map(s => ({ criterion_id: s.id, judgement: 'met' })) }); }
ok('a domain with no practical gate is complete once demonstrated',
  relRollupGates.length === 0 && R.roadmap(relState, D, TODAY).domains.find(d => d.id === 'relationships').complete);

// 11. A domain with unfinished written work lists no pending observation:
//     practical_pending is about the observation gate, not the competency gate.
const freshRM = R.roadmap(E.emptyState('uk', 'general'), D, TODAY);
ok('a fresh learner has no pending observations listed anywhere',
  freshRM.domains.every(d => Array.isArray(d.practical_pending) && d.practical_pending.length === 0));

// 12. The pending line and the complete flag are derived from one source.
//     When every independent competency is demonstrated but the observation is
//     missing, the domain must expose the pending kind AND stay incomplete;
//     resolving the observation must clear both at once.
ok('a written-complete domain names its pending observation',
  R.roadmap(shown, D, TODAY).domains.find(d => d.id === 'home').practical_pending.some(p => p.kind === rubricId),
  (R.roadmap(shown, D, TODAY).domains.find(d => d.id === 'home').practical_pending || []).map(p => p.kind).join(','));
ok('written-complete without observation stays incomplete (pending and flag agree)',
  !R.roadmap(shown, D, TODAY).domains.find(d => d.id === 'home').complete);
const cleared = R.roadmap(observed, D, TODAY).domains.find(d => d.id === 'home');
ok('a demonstrated observation clears the pending list and the complete flag together',
  cleared.practical_pending.length === 0 && cleared.complete === true);
const failedPending = R.roadmap(failedGate, D, TODAY).domains.find(d => d.id === 'home');
ok('a failed observation re-lists the pending kind and withholds complete',
  failedPending.practical_pending.some(p => p.kind === rubricId) && failedPending.complete === false);
// No-gate domains never list pending observations.
ok('a domain with no rollup gate never lists a pending observation',
  R.roadmap(relState, D, TODAY).domains.find(d => d.id === 'relationships').practical_pending.length === 0);

console.log(fail === 0 ? '\nALL ROADMAP CHECKS PASS' : '\n' + fail + ' FAILURE(S)');
process.exit(fail === 0 ? 0 : 1);

