// Verify the product's own content promises hold in the data:
//  - every milestone demands real evidence (never earned vacuously)
//  - a new learner earns nothing
//  - goals, simulations and milestones point at things that actually exist
//  - every simulation develops across >= 3 stages, is safely framed, and its
//    final stage really does change the constraint rather than just report an
// Run in CI.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const E = require(path.join(root, 'learner/engine.js'));
const R = require(path.join(root, 'learner/roadmap.js'));
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const D = {
  index: read('curriculum/index.json'), skills: read('curriculum/subskills.json'),
  bank: { items: [...read('assessments/bank.json').items, ...read('assessments/capstones.json').items] },
  practical: read('assessor/practical-rubrics.json'),
  goals: read('curriculum/goals.json'), simulations: read('curriculum/simulations.json')
};

let fail = 0;
const ok = (n, c, e) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (e ? '  ' + e : '')); if (!c) fail++; };

// 1. Structural audit of every milestone definition.
// A milestone must demand SOMETHING real: a competency (all-of or any-of) or
// an observed practical check. A milestone demanding nothing would be satisfied
// by an empty array and be reported as earned with zero evidence.
const ms = D.goals.milestones;
console.log('milestones defined: ' + ms.length);
const demandsNothing = ms.filter(m =>
  !(m.requires || []).length && !(m.requires_any || []).length && !(m.requires_practical || []).length);
ok('every milestone demands at least one real thing', demandsNothing.length === 0,
  demandsNothing.map(m => m.id).join(','));

// Practical-only milestones (e.g. "can prepare a meal") are legitimate: they are
// earned by an observer, not by a written answer. They must reference a real rubric.
const practicalOnly = ms.filter(m => !(m.requires || []).length && !(m.requires_any || []).length && (m.requires_practical || []).length);
ok('practical-only milestones reference real rubrics',
  practicalOnly.every(m => (m.requires_practical || []).every(k => D.practical.rubrics.some(r => r.id === k))),
  practicalOnly.map(m => m.id).join(','));

// A practical-only milestone must NOT be earned without the observation.
const obsState = E.emptyState('wales', 'general');
const rmObs = R.roadmap(obsState, D, '2026-10-05');
ok('practical-only milestones are not earned without the observation',
  practicalOnly.every(m => !rmObs.milestones.find(x => x.id === m.id).earned),
  practicalOnly.map(m => m.id).join(','));

// 2. A brand-new learner must earn NOTHING
const fresh = E.emptyState('wales', 'general');
const rm = R.roadmap(fresh, D, '2026-10-05');
ok('new learner earns no milestones', rm.earned === 0, 'earned=' + rm.earned);
ok('new learner demonstrates nothing', rm.capabilities.every(c => c.capability === 'not-started' || c.capability === 'needs-work'),
  [...new Set(rm.capabilities.map(c => c.capability))].join(','));

// 3. Milestone requirements must reference real competencies
const allIds = new Set(D.skills.competencies.map(c => c.id));
const badRefs = [];
for (const m of ms) {
  for (const c of [...(m.requires || []), ...(m.requires_any || [])]) if (!allIds.has(c)) badRefs.push(m.id + '->' + c);
}
ok('milestone requirements reference real competencies', badRefs.length === 0, badRefs.join(','));

// 4. Goal focus competencies must reference real competencies
const badGoalRefs = [];
for (const g of D.goals.goals) for (const c of g.focus_competencies || []) if (!allIds.has(c)) badGoalRefs.push(g.id + '->' + c);
ok('goal focus competencies reference real competencies', badGoalRefs.length === 0, badGoalRefs.join(','));

// 5. Simulation capstones must exist in the bank
const bankIds = new Set(D.bank.items.map(i => i.id));
const badCaps = D.simulations.simulations.filter(s => !bankIds.has(s.capstone)).map(s => s.id + '->' + s.capstone);
ok('simulations point at real capstone items', badCaps.length === 0, badCaps.join(','));

// 6. Goal capstones must exist too
const badGoalCaps = D.goals.goals.filter(g => g.capstone && !bankIds.has(g.capstone)).map(g => g.id + '->' + g.capstone);
ok('goals point at real capstone items', badGoalCaps.length === 0, badGoalCaps.join(','));

// 7. Goal pathways must exist in the curriculum index
const pathwayIds = new Set(D.index.pathways.map(p => p.id));
const badPaths = D.goals.goals.filter(g => !pathwayIds.has(g.pathway)).map(g => g.id + '->' + g.pathway);
ok('goals point at real pathways', badPaths.length === 0, badPaths.join(','));

// 8. Every simulation must actually change the constraint in its final stage.
//    That is the core promise of a simulation, so verify it in data rather than
//    trusting the prose. Require an explicit change marker in the final reveal.
const CHANGE = /\b(but|however|instead|no longer|now|instead of|rather than|has changed|have changed|moved|not paid|no free|only \d)\b/i;
const noChange = D.simulations.simulations.filter(s => {
  const last = s.stages[s.stages.length - 1];
  return !last || !last.reveal.some(r => CHANGE.test(r));
}).map(s => s.id);
ok('final stage of every simulation introduces a change', noChange.length === 0, noChange.join(','));

// 8b. A final stage must give the learner a decision, not just an observation.
const noAsk = D.simulations.simulations.filter(s => {
  const last = s.stages[s.stages.length - 1];
  return !last || !last.ask || last.ask.length < 40;
}).map(s => s.id);
ok('final stage poses a real decision', noAsk.length === 0, noAsk.join(','));

// 8c. Every stage must have the full content contract, and there must be >= 3
//     stages so the situation can develop rather than being a single prompt.
const badStage = [];
for (const s of D.simulations.simulations) {
  if (s.stages.length < 3) badStage.push(s.id + '(stages=' + s.stages.length + ')');
  for (const st of s.stages) {
    if (!st.heading || !st.beat || !st.ask || !st.trap || !Array.isArray(st.reveal) || !st.reveal.length) badStage.push(s.id + ':' + st.n);
  }
  if (!s.promise || !s.framing || !s.setting || !s.debrief) badStage.push(s.id + '(missing framing)');
  // Safety framing is mandatory for every fictional situation.
  if (!/fictional/i.test(s.framing || '')) badStage.push(s.id + '(no fictional framing)');
}
ok('every simulation has a complete, safely-framed stage structure', badStage.length === 0, badStage.join(','));

// 9. Milestone ids unique
const msIds = ms.map(m => m.id);
ok('milestone ids unique', new Set(msIds).size === msIds.length);

// ---- Backup reminder: evidence is browser-local and must be prompted ----
// The product's own review names data-loss risk (browser clear, quota change,
// profile switch) as a real weakness. The app must (a) remind a learner who
// has evidence and has never backed up, (b) stop reminding once they have,
// (c) not remind a learner with nothing to lose, and (d) never let the backup
// stamp touch the evidence state or its validation.
const appSrc = fs.readFileSync(path.join(root, 'learner/app.js'), 'utf8');
ok('backup reminder is offered on Today for learners with evidence',
  /backupReminder/.test(appSrc) && /hasEvidence/.test(appSrc));
ok('backup stamp lives outside the evidence state',
  appSrc.includes("localStorage.setItem(backupKey") && !/schema_version[^}]*backup/i.test(appSrc));
ok('export marks the learner as backed up', /markBackedUp\(\)/.test(appSrc));
ok('blocked storage never shows a false backup reminder', /blocked\|\|!hasEvidence/.test(appSrc));

// ---- Copy the browser suite may look up stays present ----
// The simulation journey and Today surface new user-facing strings; the copy
// contract script guards the full list, but the ones asserted here are the
// ones this change introduced and must not silently drift.
const roadmapSrc = fs.readFileSync(path.join(root, 'learner/roadmap.js'), 'utf8');
const roadmapViewSrc = fs.readFileSync(path.join(root, 'learner/roadmap-view.js'), 'utf8');
const feedbackSrc = fs.readFileSync(path.join(root, 'learner/feedback-view.js'), 'utf8');
const profileSrc = fs.readFileSync(path.join(root, 'learner/profile-view.js'), 'utf8');
for (const s of ['You need fresh materials', 'Keep a copy of your evidence.', 'Backup downloaded.']) {
  ok('copy present: ' + JSON.stringify(s), appSrc.includes(s) || roadmapSrc.includes(s));
}
for (const s of ['Watch your fresh cases', 'No unseen cases left', 'unseen case', 'domain gate']) {
  ok('copy present: ' + JSON.stringify(s), appSrc.includes(s) || roadmapSrc.includes(s) || roadmapViewSrc.includes(s) || profileSrc.includes(s));
}
ok('copy present: "Start with the suggested task"', appSrc.includes('Start with the suggested task'));
ok('copy present: "Targeted guidance for your errors"', feedbackSrc.includes('Targeted guidance for your errors'));

console.log(fail === 0 ? '\nALL MILESTONE/CONTENT CHECKS PASS' : '\n' + fail + ' FAILURE(S)');
process.exit(fail === 0 ? 0 : 1);