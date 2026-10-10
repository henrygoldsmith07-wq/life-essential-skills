// Verify a learner with damaged stored evidence is never shown a wrong
// dashboard. The app has a repair path; this proves it actually works and that
// the roadmap degrades safely rather than showing phantom evidence.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function load(f, g) { new Function('module', 'exports', fs.readFileSync(path.join(root, 'learner', f), 'utf8'))(undefined, undefined); return global[g]; }
const RV = load('roadmap-view.js', 'RoadmapView');
const PV = load('profile-view.js', 'ProfileView');
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

// 1. A record referencing a deleted assessment must not become evidence.
const st = E.emptyState('wales', 'general');
st.records.push({ id: 'r1', attempt_id: 'a1', competency_id: 'money.budget.independent', item_id: 'NO-SUCH-ITEM', phase: 'transfer', date: '2026-09-01', assessment_version: 1, help_used: false, access_supports: [], solution_seen: false, error_tags: [], evidence_level: 'self-reviewed', reviewer_type: 'learner', criteria_judgements: [] });
let threw = null, rm = null;
try { rm = R.roadmap(st, D, TODAY); } catch (e) { threw = e; }
ok('a dangling item reference does not crash the roadmap', !threw, threw ? threw.message : '');
if (rm) {
  const c = rm.capabilities.find(x => x.id === 'money.budget.independent');
  ok('a dangling record is not shown as demonstrated', c.capability !== 'demonstrated', c.capability);
  ok('roadmap still renders with a broken record', RV.render(rm).length > 500);
}

// 2. An unknown competency id in a record must be ignored, not crash.
const st2 = E.emptyState('uk', 'general');
st2.records.push({ id: 'r2', attempt_id: 'a2', competency_id: 'not.a.real.competency', item_id: D.bank.items[0].id, phase: 'transfer', date: '2026-09-01', assessment_version: 1, help_used: false, access_supports: [], solution_seen: false, error_tags: [], evidence_level: 'self-reviewed', reviewer_type: 'learner', criteria_judgements: [] });
let threw2 = null, rm2 = null;
try { rm2 = R.roadmap(st2, D, TODAY); } catch (e) { threw2 = e; }
ok('an unknown competency id does not crash the roadmap', !threw2, threw2 ? threw2.message : '');

// 3. Missing/odd optional fields must not crash anything.
const st3 = E.emptyState('uk', 'general');
st3.records.push({ id: 'r3', attempt_id: 'a3', competency_id: 'money.budget.independent', item_id: D.bank.items[0].id, phase: 'transfer', date: '2026-09-01' });
let threw3 = null;
try { rm2 = R.roadmap(st3, D, TODAY); } catch (e) { threw3 = e; }
ok('a record with missing optional fields does not crash', !threw3, threw3 ? threw3.message : '');

// 4. An unsupported locality must not crash.
let threw4 = null;
try { R.roadmap(E.emptyState('mars', 'general'), D, TODAY); } catch (e) { threw4 = e; }
ok('an unsupported locality does not crash', !threw4, threw4 ? threw4.message : '');

// 5. A goal referencing a competency that no longer exists must not be accepted
//    silently, and onboarding must not invent one.
const plan = R.onboarding({ goals: { goals: [{ id: 'g', pathway: 'general', focus_competencies: ['ghost.competency'], questions: [] }] } }, 'g', {});
ok('onboarding does not invent competencies', plan.goal_competencies.includes('ghost.competency'));
// ...and the resulting state must still be rejected by validation, which is the
// real safety net.
const bad = { ...E.emptyState('uk', 'general'), goal_competencies: plan.goal_competencies };
ok('a state with a ghost competency fails validation', E.validateState(bad, D, TODAY).length > 0);

// 6. The profile must never claim a qualification.
const pHtml = PV.render(R.profile(E.emptyState('wales', 'general'), D, TODAY), 'UK');
ok('profile always disclaims qualification status', pHtml.includes('not a qualification'));
ok('profile always says it is not independently verified', /not independent|self-reviewed/i.test(pHtml));

// 7. Views survive a state with no records, no exposures and no observations.
const bare = { schema_version: 2, locality: 'wales', pathway: 'general', goal_competencies: [], records: [], reviews: [], observations: [], legacy_observations: [], exposures: [] };
let threw7 = null;
try { RV.render(R.roadmap(bare, D, TODAY)); PV.render(R.profile(bare, D, TODAY), 'UK'); } catch (e) { threw7 = e; }
ok('a completely bare state renders', !threw7, threw7 ? threw7.message : '');

console.log(fail === 0 ? '\nALL RESILIENCE CHECKS PASS' : '\n' + fail + ' FAILURE(S)');
process.exit(fail === 0 ? 0 : 1);