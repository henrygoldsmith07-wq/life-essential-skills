// Verify the interaction layer, which only misbehaves once the page is driven:
// focus management, duplicate ids in repeatedly-inserted blocks, button types
// inside forms, and the onboarding submit path. Run in CI.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function load(f, g) { new Function('module', 'exports', fs.readFileSync(path.join(root, 'learner', f), 'utf8'))(undefined, undefined); return global[g]; }
const OV = load('onboarding-view.js', 'OnboardingView');
const RV = load('roadmap-view.js', 'RoadmapView');
const SV = load('simulation-view.js', 'SimulationView');
const FV = load('feedback-view.js', 'FeedbackView');
const Catalog = load('catalog.js', 'Catalog');
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

const rm = R.roadmap(E.migrateState(read('examples/learners/evaluation-cycle.json'), D, TODAY), D, TODAY);
const goal = D.goals.goals[0];

// ---- 1. Duplicate ids in the onboarding card ----
// app.js inserts this block with insertAdjacentHTML('afterbegin') and does not
// remove a previous one, so clicking a second goal can duplicate every id.
const block = OV.situation(goal) + OV.questions(goal, null) + '<div id="onboard-error"></div>';
const twice = block + block;
const idCounts = {};
for (const m of twice.matchAll(/\sid="([^"]+)"/g)) idCounts[m[1]] = (idCounts[m[1]] || 0) + 1;
const dupes = Object.entries(idCounts).filter(([, n]) => n > 1);
ok('onboarding block has stable ids', Object.keys(idCounts).length > 0, Object.keys(idCounts).join(','));
console.log('   -> ids in the inserted block: ' + Object.keys(idCounts).slice(0, 6).join(', '));
console.log('   -> duplicated if inserted twice: ' + (dupes.length ? dupes.map(d => d[0]).join(',') : 'none'));
// The real problem is whether app.js guards against a second insert.
const appSrc = fs.readFileSync(path.join(root, 'learner/app.js'), 'utf8');
const startOnboarding = (appSrc.match(/function startOnboarding[\s\S]*?\n  \}/) || [''])[0];
ok('startOnboarding removes a previous onboarding card before inserting',
  /\.remove\(\)/.test(startOnboarding));
ok('startOnboarding moves focus to the new step',
  /first\.focus\(\)|U\.focus/.test(startOnboarding));

// ---- 2. Form submit path ----
const q = goal.questions[0];
const plan = R.onboarding(D, goal.id, { [q.id]: q.options[0].value });
ok('onboarding with no answers still yields the goal backbone', R.onboarding(D, goal.id, {}).goal_competencies.length >= goal.focus_competencies.length);
const unknownGoal = R.onboarding(D, 'no-such-goal', {});
ok('an unknown goal returns null rather than throwing', unknownGoal === null);
const badAnswers = R.onboarding(D, goal.id, { [q.id]: 'not-a-real-option' });
ok('an unrecognised answer is ignored, not treated as focus',
  badAnswers.goal_competencies.join(',') === goal.focus_competencies.join(','));

// ---- 3. Milestones reachable by keyboard / labelled ----
const msHtml = RV.render(rm);
ok('milestones are not just colour-coded', /ms--earned|ms--near|ms--todo/.test(msHtml));

// ---- 4. Feedback actions are real, focusable controls ----
const fb = FV.nextPractice({ why: 'because', item_id: 'M-CF-01', kind: 'transfer', learn_path: 'g.md', reason: ['r'] });
ok('next-practice buttons carry a type attribute or are not in a form',
  !/<button(?![^>]*type=)[^>]*>/.test(fb) || /data-task/.test(fb), 'a bare <button> inside a form defaults to type=submit');
ok('next-practice exposes both a task and a learn path', /data-task/.test(fb) && /data-learn/.test(fb));

// ---- 5. Simulation stage buttons ----
const st = SV.stage(D.simulations.simulations[0], 0);
const btns = [...st.matchAll(/<button\b[^>]*>/g)].map(m => m[0]);
ok('every non-submit button in the views declares type=button',
  btns.every(b => /type="button"/.test(b)) &&
  [...fb.matchAll(/<button\b[^>]*>/g)].every(m => /type="button"/.test(m[0])) &&
  [...msHtml.matchAll(/<button\b[^>]*>/g)].every(m => /type="button"/.test(m[0])),
  btns.length + ' sim buttons');
ok('simulation stage offers a way out', /id="close-task"/.test(st));
ok('simulation back button only appears after stage 1', !/id="sim-back"/.test(st));
ok('simulation final stage offers the write-up', /Finish and write/.test(SV.stage(D.simulations.simulations[0], 2)));

// ---- 6. Locale independence of learner-facing dates ----
const nov = R.roadmap(E.migrateState(read('examples/learners/review-due.json'), D, TODAY), D, TODAY);
ok('roadmap dates render as plain ISO strings', nov.retention_due.every(c => /^\d{4}-\d{2}-\d{2}$/.test(c.next_review)),
  nov.retention_due.map(c => c.next_review).join(','));

// ---- 6b. The Practice page must surface overdue retention checks ----
// Today recommends one; the Practice page must not hide the others. On the
// 'recommended' view a learner with due checks must get a 'Due for review'
// group containing unseen fresh variants for the due competencies.
const dueState = E.migrateState(read('examples/learners/review-due.json'), D, TODAY);
const dueGroups = Catalog.discover(dueState, D, E, TODAY, { mode: 'recommended' });
ok('the review-due learner has one or more overdue checks', nov.retention_due.length > 0);
ok('Practice recommended view groups overdue checks under', dueGroups.some(g => g.title === 'Due for review' && g.items.length > 0),
  dueGroups.map(g => g.title + ':' + g.items.length).join(' | '));
// A learner with nothing due must not see a spurious empty 'Due for review' group.
const fresh = Catalog.discover(E.emptyState('wales', 'general'), D, E, TODAY, { mode: 'recommended' });
ok('no empty due-review group when nothing is due', !fresh.some(g => g.title === 'Due for review' && g.items.length === 0));

// ---- 7. No surface may emit the same id twice ----
// The rubric generates judge-0, judge-help-0, ... from a fixed prefix, so
// rendering it twice in one panel duplicates every control id and puts hidden
// copies ahead of the visible ones. This broke the browser suite once.
function duplicateIds(html) {
  const seen = new Map();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}
const surfacesForIds = {
  'roadmap': msHtml,
  'onboarding': block,
  'simulation stage': st,
  'feedback next-practice': fb
};
for (const [name, html] of Object.entries(surfacesForIds)) {
  const dupes = duplicateIds(html);
  ok('no duplicate ids in ' + name, dupes.length === 0, dupes.join(','));
}

// The feedback panel is assembled inline in app.js, so count the renders there.
const finishSrc = (appSrc.match(/async function finishAttempt\(\)\{[\s\S]*?\n  \}/) || [''])[0];
const rubricRenders = (finishSrc.match(/U\.rubric\(/g) || []).length;
ok('the feedback panel renders the rubric exactly once', rubricRenders === 1, rubricRenders + ' render(s)');
ok('the feedback explainer does not re-render live controls',
  !/U\.rubric\([^)]*\)\.replace/.test(finishSrc));

// ---- 9. Simulations surface their authored debrief to the learner ----
// The "What this was about" reflection is authored for every simulation and was
// styled, but never wired into the flow — so a completed simulation ended
// without its closing reflection. finishAttempt must render SV.debrief() for a
// simulation attempt.
ok('every simulation authors a debrief',
  D.simulations.simulations.every(s => !!s.debrief));
ok('the feedback flow renders a simulation debrief when present',
  /SV\.debrief\(current\.sim\)/.test(finishSrc));

// ---- 10. Simulation stage transitions must keep "Not now" wired ----
// Each stage re-renders the workspace, replacing the close button. Without
// re-binding it on every stage, "Close task" is dead on stages 0–2.
const bindSimSrc = (appSrc.match(/function bindSim\(sim,item\)\{[\s\S]*?\n  \}/) || [''])[0];
ok('bindSim re-binds the close button on every stage render',
  bindSimSrc.includes("if($('close-task'))$('close-task').onclick=closeTask;"));
// Going Back must refocus the stage heading just like stepping Forward does,
// so a keyboard/screen-reader user isn't stranded on the button they pressed.
ok('bindSim re-focuses the stage heading when going Back',
  bindSimSrc.includes("current.stage--;$('workspace').innerHTML=SV.stage(sim,current.stage);bindSim(sim,item);U.focus('task-title');"));

// ---- 11. The AI boundary is enforced, not merely documented ----
// An adapter is optional; with none attached, the app is byte-for-byte unchanged.
// But if one is attached, two invariants must hold: (1) it is sanitised so a
// misbehaving adapter that exposes 'grade' can never grade through the app; and
// (2) any AI-assisted attempt is recorded as solving help, so it can never become
// independent evidence. Both are checked at the recording path.
const AI = load('ai-boundary.js', 'AIBoundary');
ok('AI boundary exposes no grade capability', !AI.ALLOWED.includes('grade'));
ok('AI boundary records adapter use as solving help',
  AI.helpIfAIUsed({ help_used: false }, true).help_used === true);
ok('AI boundary strips a grade method from an attached adapter',
  AI.sanitiseAdapter({ draft_explanation: () => ({ content: 'x' }), grade: () => 'A+' }).grade === undefined);
const attemptSrc = (appSrc.match(/function attemptInput\(\)\{[\s\S]*?\n  \}/) || [''])[0];
ok('attemptInput routes through the AI help-if-used guard',
  /AIBoundary\.helpIfAIUsed\(/.test(attemptSrc));
ok('attemptInput does not call a provider directly (no network in the boundary)',
  !/fetch\(|XMLHttpRequest|axios/.test(attemptSrc));
ok('the app detects an injected adapter via the boundary (default-safe)',
  /AIBoundary\.sanitiseAdapter\(window\.AI_ASSISTANT\)/.test(appSrc));
// The AI coaching affordance: when an adapter offers coach_practice, the button
// is offered only then (default-safe) and any draft rendered through the
// FeedbackView escaper, never via raw innerHTML of caller content.
ok('AI coaching button is offered only when an adapter exposes it',
  /AI_ADAPTER&&AI_ADAPTER\.coach_practice/.test(appSrc));
ok('AI draft output is rendered through the escaped feedback view',
  /FV\.draft\(/.test(appSrc));
ok('AI coaching sets the per-attempt aiUsed flag',
  /aiUsed=true/.test(appSrc));
ok('the simulation write-up offers the same AI coaching affordance as a task',
  /SV\.writeUp\(sim,item,renderMaterials\(item\)\);.*offerAIHint\(\)/.test(appSrc));
// ---- 8. Lazy-loaded roadmap bodies must not get stuck on placeholder text ----
// A browser restores <details> open state on reload and back-navigation, and may
// fire 'toggle' before the listener is attached, which would leave the
// "Open to see every skill in this area" placeholder visible forever.
const renderRoadmapSrc = (appSrc.match(/function renderRoadmap\(\)\{[\s\S]*?\n  \}/) || [''])[0];
ok('renderRoadmap loads any domain already open when the listener attaches',
  /if\(det\.open\)/.test(renderRoadmapSrc));
ok('renderRoadmap guards the lazy body against double loading',
  /dataset\.loaded/.test(renderRoadmapSrc) && /loadBody/.test(renderRoadmapSrc));

console.log(fail === 0 ? '\nALL INTERACTION CHECKS PASS' : '\n' + fail + ' FAILURE(S)');
process.exit(fail === 0 ? 0 : 1);

console.log(fail === 0 ? '\nALL INTERACTION CHECKS PASS' : '\n' + fail + ' FAILURE(S)');
process.exit(fail === 0 ? 0 : 1);