// Guard the roadmap's cost. It is rebuilt on every navigation and after every
// saved attempt, so a learner with a long history must not feel it. Also asserts
// the derivation stays linear in competencies rather than re-deriving summaries.
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
const TODAY = '2026-10-05';
let fail = 0;
const ok = (n, c, e) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (e ? '  ' + e : '')); if (!c) fail++; };

// Worst case: a learner with a long record history, not a fresh one.
const st = E.emptyState('wales', 'general');
const many = D.bank.items.filter(i => i.competencies && i.competencies[0]);
for (let n = 0; n < 200; n++) {
  const it = many[n % many.length];
  const cid = it.competencies[0];
  st.records.push({
    id: 'r' + n, attempt_id: 'a' + n, competency_id: cid, item_id: it.id,
    phase: n % 3 === 0 ? 'retention' : 'transfer', date: '2026-0' + (1 + n % 9) + '-15',
    assessment_version: 1, help_used: false, access_supports: [], solution_seen: false,
    error_tags: [], evidence_level: 'self-reviewed', reviewer_type: 'learner',
    criteria_judgements: (it.scoring || []).map(s => ({ criterion_id: s.id, judgement: 'met' }))
  });
}
console.log('records: ' + st.records.length + ', competencies: ' + D.skills.competencies.length);

// Warm up, then measure.
R.roadmap(st, D, TODAY);
const t0 = process.hrtime.bigint();
const N = 10;
for (let i = 0; i < N; i++) R.roadmap(st, D, TODAY);
const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
console.log('roadmap() with ' + st.records.length + ' records: ' + ms.toFixed(1) + ' ms per call');

ok('roadmap derivation stays under 120ms for a 200-record learner', ms < 120, ms.toFixed(1) + 'ms');

// Count how many times the engine summary is computed per render. This is the
// dominant cost. It must be exactly one per competency: the roadmap asks for the
// same competency many times (capability, prerequisite check, milestone
// requirement), and those lookups must share one memo.
let calls = 0;
const realSummary = E.summary;
E.summary = function (...a) { calls++; return realSummary.apply(E, a); };
R.roadmap(st, D, TODAY);
E.summary = realSummary;
console.log('E.summary calls per roadmap(): ' + calls);
const comps = D.skills.competencies.length;
ok('each competency summary is computed exactly once per render', calls === comps, calls + ' for ' + comps + ' competencies');

console.log(fail === 0 ? '\nPERFORMANCE OK' : '\n' + fail + ' FAILURE(S)');
process.exit(fail === 0 ? 0 : 1);