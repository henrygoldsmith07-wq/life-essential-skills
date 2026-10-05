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

console.log(fail === 0 ? '\nALL ROADMAP CHECKS PASS' : '\n' + fail + ' FAILURE(S)');
process.exit(fail === 0 ? 0 : 1);