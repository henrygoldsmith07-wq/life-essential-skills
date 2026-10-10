// Render verification: exercise the new view modules in a minimal DOM-free
// harness to confirm they produce sensible HTML from real roadmap data and
// never crash on empty state. Uses only Node built-ins.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function loadModule(file, globalName) {
  const src = fs.readFileSync(path.join(root, 'learner', file), 'utf8');
  const sandbox = {};
  // No `module`/`exports` in scope, so the UMD wrapper takes its browser branch
  // and assigns onto the `root` it detects (globalThis or this).
  const fn = new Function('module', 'exports', src);
  fn(undefined, undefined);
  return global[globalName];
}

const E = require(path.join(root, 'learner/engine.js'));
const R = require(path.join(root, 'learner/roadmap.js'));
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const D = {
  index: read('curriculum/index.json'),
  skills: read('curriculum/subskills.json'),
  bank: { items: [...read('assessments/bank.json').items, ...read('assessments/capstones.json').items] },
  practical: read('assessor/practical-rubrics.json'),
  goals: read('curriculum/goals.json'),
  simulations: read('curriculum/simulations.json'),
  sources: read('data/sources.json').sources
};

let fail = 0;
const ok = (n, c, e) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (e ? '  ' + e : '')); if (!c) fail++; };

// Simulate the browser global environment the view modules expect.
global.window = {};
const RV = loadModule('roadmap-view.js', 'RoadmapView');
const OV = loadModule('onboarding-view.js', 'OnboardingView');
const SV = loadModule('simulation-view.js', 'SimulationView');
const FV = loadModule('feedback-view.js', 'FeedbackView');
const PV = loadModule('profile-view.js', 'ProfileView');
const AI = loadModule('ai-boundary.js', 'AIBoundary');

const TODAY = '2026-10-05';
const empty = E.emptyState('uk', 'general');
const rm = R.roadmap(empty, D, TODAY);

// 1. Roadmap view renders without throwing and contains expected content
let html = RV.render(rm);
ok('roadmap view renders', typeof html === 'string' && html.length > 500, html.length + ' chars');
ok('roadmap has domain cards', (html.match(/class="domain"/g) || []).length === 12);
ok('roadmap has next-step panel', html.includes('next-heading'));
ok('roadmap shows legend', html.includes('legend'));

// 2. With real evidence
const ex = E.migrateState(read('examples/learners/evaluation-cycle.json'), D, TODAY);
const rm2 = R.roadmap(ex, D, TODAY);
const html2 = RV.render(rm2);
ok('roadmap renders with evidence', html2.length > 500);
ok('roadmap shows a demonstrated capability', html2.includes('Can do this') || html2.includes('done'));

// 3. Onboarding view
const goalList = OV.goalList(D.goals.goals, null);
ok('goal list renders', goalList.includes('Moving out') && goalList.includes('goaltile'));
ok('goal list shows all goals', (goalList.match(/goaltile"/g) || []).length === D.goals.goals.length);
const g = D.goals.goals[0];
ok('questions render', OV.questions(g, {}).includes('fieldset'));
ok('situation renders', OV.situation(g).includes(g.situation.slice(0, 20)));

// 4. Simulation view
const sim = D.simulations.simulations[0];
const capItem = D.bank.items.find(i => i.id === sim.capstone);
const simIntro = SV.intro(sim, capItem);
ok('sim intro renders', simIntro.includes('LIFE-TRANSITION SIMULATION') && simIntro.includes(sim.title));
ok('sim intro has begin button', simIntro.includes('sim-begin'));
ok('sim stage renders', SV.stage(sim, 0).includes('PART 1 OF 3'));
ok('sim all stages render', sim.stages.every((s, n) => SV.stage(sim, n).length > 100));
ok('sim writeUp renders', SV.writeUp(sim, capItem, '<p>materials</p>').includes('textarea'));

// 5. Feedback view
ok('result banner renders', FV.resultBanner('demonstrated').includes('Shown independently'));
const fbRow = { title: 'X', scoring: [{ id: 'c', criterion: 'do it' }], judgements: { c: 'not-met' }, error_tags: ['assumes-missing-information'], comp: { mode: 'independent' } };
ok('per-competency renders', FV.perCompetency([fbRow]).includes('Missing'));
// Raw error-tag ids must never reach the learner.
ok('feedback hides raw error ids', !FV.perCompetency([fbRow]).includes('assumes-missing-information'), 'falls back to readable text');
ok('feedback shows error wording when given labels', FV.perCompetency([fbRow], { 'assumes-missing-information': 'Name missing facts before deciding' }).includes('Name missing facts before deciding'));
ok('next practice renders', FV.nextPractice({ why: 'because', item_id: 'M-CF-01', kind: 'transfer', learn_path: 'g.md', reason: ['r'] }).toLowerCase().includes('your next practice'));
// Targeted error guidance surfaces the item-specific common_mistakes and
// next_steps wording, never a raw error-tag id.
const fb = { common_mistakes: { 'assumes-missing-information': 'Name facts you cannot check before deciding.' }, next_steps: { 'assumes-missing-information': 'Attempt an unseen variant with different numbers.' } };
ok('error guidance renders item-specific advice', FV.errorGuidance([fbRow], { 'assumes-missing-information': 'Name missing facts before deciding' }, fb).includes('Name facts you cannot check'));
ok('error guidance never shows raw ids', !FV.errorGuidance([fbRow], null, fb).includes('assumes-missing-information'));
ok('error guidance handles missing feedback JSON', FV.errorGuidance([fbRow], null, null) === '');

// 6. Profile view
const prof = R.profile(ex, D, TODAY);
const profHtml = PV.render(prof, 'UK');
ok('profile renders', profHtml.includes('MY INDEPENDENCE PROFILE'));
ok('profile has disclaimer', profHtml.includes('not a qualification'));
ok('profile hides raw error ids', !profHtml.includes('assumes-missing-information'));
// A brand-new learner must not be told every milestone is under way.
const freshProf = R.profile(E.emptyState('wales', 'general'), D, TODAY);
ok('new learner has no milestones in progress', freshProf.milestones_in_progress.length === 0, freshProf.milestones_in_progress.length + ' in progress');
ok('new learner has no milestones earned', freshProf.milestones_earned.length === 0);
// The three milestone buckets must partition every milestone exactly once.
const total = freshProf.milestones_earned.length + freshProf.milestones_in_progress.length + freshProf.milestones_not_started.length;
ok('milestone buckets partition all milestones', total === freshProf.milestones_not_started.length + freshProf.milestones_in_progress.length + freshProf.milestones_earned.length && total === D.goals.milestones.length, total + '/' + D.goals.milestones.length);

// 7. AI boundary guards
ok('AI: has no grade capability', !Object.values(AI.ALLOWED).includes('grade'));
const draft = AI.asDraft({ content: 'x' });
ok('AI: draft is never evidence', draft.counts_as_evidence === false && draft.counts_as_solving_help === true);
const evil = AI.sanitiseAdapter({ draft_explanation: async () => ({ content: 'e' }), grade: async () => 'A+' });
ok('AI: grade is stripped from adapter', evil.grade === undefined && typeof evil.draft_explanation === 'function');
ok('AI: helpIfAIUsed forces help', AI.helpIfAIUsed({ help_used: false }, true).help_used === true);
// 8. AI drafts are rendered through the feedback view (escaped, labelled, help).
ok('AI draft renders and is labelled', FV.draft('<b>hi</b>', []).includes('AI-ASSISTED DRAFT'));
ok('AI draft escapes content (no raw script tag)', !/<script/.test(FV.draft('<script>x</script>', ['w'])));

// 9. Pending observed checks surface on the roadmap card, not just in data.
//    A domain whose written evidence is complete but whose observation is
//    missing must name the check in both the collapsed card and the expanded
//    body, with the learner-facing rubric title — never a raw kind id.
const pendState = E.emptyState('uk', 'general');
for (const c of D.skills.competencies.filter(c => c.domain === 'home' && c.mode === 'independent')) {
  const item = D.bank.items.find(i => i.competencies.includes(c.id));
  if (!item) continue;
  pendState.records.push({ id: 'r-' + c.id, attempt_id: 'a1', competency_id: c.id, item_id: item.id, phase: 'transfer', date: TODAY, assessment_version: item.version, help_used: false, access_supports: [], solution_seen: false, error_tags: [], evidence_level: 'self-reviewed', reviewer_type: 'learner', criteria_judgements: (item.scoring || []).map(s => ({ criterion_id: s.id, judgement: 'met' })) });
}
const pendHome = R.roadmap(pendState, D, TODAY).domains.find(d => d.id === 'home');
const pendCard = RV.domainCard(pendHome);
const pendBody = RV.domainBody(pendHome);
ok('pending observation renders on the collapsed domain card', pendCard.includes('domain__pending') && pendCard.includes('Prepare a simple meal safely'), pendCard.slice(0, 120));
ok('pending observation renders inside the expanded domain body', pendBody.includes('domain__pending') && pendBody.includes('Prepare a simple meal safely'));
ok('pending observation never shows a raw kind id', !pendCard.includes('observed-meal-preparation') && !pendBody.includes('observed-meal-preparation'));
ok('a domain with no pending gate renders no pending line', !RV.domainCard(R.roadmap(E.emptyState('uk', 'general'), D, TODAY).domains.find(d => d.id === 'relationships')).includes('domain__pending'));
// The pending line must use the shared styled class so it cannot render unstyled.
ok('the pending line uses a styled class', /domain__pending/.test(fs.readFileSync(path.join(root, 'learner/product.css'), 'utf8')));

// Material exhaustion warnings surface proactively, naming the family and showing
// how many unseen cases remain — not just the engine's abrupt 'fresh-materials-needed'.
// Build a custom bank with exactly 2 items (2 exposure groups) in a family, so
// using one exhausts it and the near-exhaustion threshold fires.
const clone = v => JSON.parse(JSON.stringify(v));
const custom = clone(D);
custom.bank.items = custom.bank.items.filter(i => i.competencies[0] === 'money.cash-flow.foundation');
custom.skills.competencies = custom.skills.competencies.filter(c => c.id === 'money.cash-flow.foundation');
custom.skills.rollups = [];
let matState = E.emptyState('uk', 'money-admin');
matState.goal_competencies = ['money.cash-flow.foundation'];
matState = E.recordAttempt(matState, custom, custom.bank.items[0].id, {
  criteria_judgements: custom.bank.items[0].scoring.map(s => ({ criterion_id: s.id, judgement: 'met' })),
  help_used: false, solution_seen: false, access_supports: [], error_tags: []
}, TODAY);
const matRem = E.materialsRemaining(matState, custom, 'uk');
const cfKey = Object.keys(matRem).find(k => k.includes('cash-flow'));
ok('materialsRemaining tracks seen vs remaining', matRem[cfKey].seen === 1 && matRem[cfKey].remaining === 1);
const matRm = R.roadmap(matState, custom, TODAY);
ok('near-exhausted families warn on the roadmap', matRm.material_warnings.length > 0, matRm.material_warnings.length + ' warnings');
ok('roadmap view renders the warning panel', RV.render(matRm).includes('Watch your fresh cases'));
ok('exhausted families show zero remaining after full use', (() => {
  let s = matState;
  for (const item of custom.bank.items.slice(1)) s = E.recordAttempt(s, custom, item.id, {
    criteria_judgements: item.scoring.map(sc => ({ criterion_id: sc.id, judgement: 'met' })),
    help_used: false, solution_seen: false, access_supports: [], error_tags: []
  }, TODAY);
  const rm3 = R.roadmap(s, custom, TODAY);
  return rm3.material_warnings.every(w => w.remaining === 0);
})());

// Milestone progress fractions appear on roadmap milestone cards for in-progress work.
const profForMilestones = R.profile(E.emptyState('uk', 'general'), D, TODAY);
const allMilestones = profForMilestones.milestones_earned.concat(profForMilestones.milestones_in_progress, profForMilestones.milestones_not_started);
ok('milestone cards carry a numeric progress fraction', allMilestones.every(m => typeof m.progress_fraction === 'number'));

// Profile view surfaces practical observation needs and material warnings.
const profHtml2 = PV.render(R.profile(E.emptyState('wales', 'moving-out'), D, TODAY), 'UK');
ok('profile warns about practical observation needs', profHtml2.includes('domain gate') || profHtml2.includes('practical'));
// Profile's recommended-next section includes an actionable button when the
// engine has a next task, so the profile is not just a read-only summary.
const profWithRec = PV.render(R.profile(ex, D, TODAY), 'UK');
ok('profile recommended-next surfaces an action button', profWithRec.includes('data-task') || profWithRec.includes('data-learn') || profWithRec.includes('Today or Practice'), 'checking for action button');

console.log(fail === 0 ? '\nALL VIEW CHECKS PASS' : '\n' + fail + ' FAILURE(S)');
process.exit(fail === 0 ? 0 : 1);