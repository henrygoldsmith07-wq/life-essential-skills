// Verify that every CSS class emitted by the learner views actually has a rule.
// An unstyled class means a broken-looking surface, which no other check catches.
// Run in CI.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function load(f, g) { new Function('module', 'exports', fs.readFileSync(path.join(root, 'learner', f), 'utf8'))(undefined, undefined); return global[g]; }
const RV = load('roadmap-view.js', 'RoadmapView');
const OV = load('onboarding-view.js', 'OnboardingView');
const SV = load('simulation-view.js', 'SimulationView');
const FV = load('feedback-view.js', 'FeedbackView');
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
const ex = E.migrateState(read('examples/learners/evaluation-cycle.json'), D, TODAY);
const rm = R.roadmap(ex, D, TODAY);
const sim = D.simulations.simulations[0];
const capItem = D.bank.items.find(i => i.id === sim.capstone);
const goal = D.goals.goals[0];

const html = [
  RV.render(rm), RV.nextPanel(rm.next), RV.domainBody(rm.domains[0]),
  OV.goalList(D.goals.goals, null), OV.situation(goal), OV.questions(goal, {}), OV.sequence(goal),
  SV.intro(sim, capItem), SV.stage(sim, 0), SV.stage(sim, 2), SV.writeUp(sim, capItem, '<p>materials</p>'), SV.debrief(sim),
  FV.resultBanner('demonstrated'), FV.resultBanner('assisted'), FV.resultBanner('not-yet'),
  FV.perCompetency([{ title: 'X', scoring: [{ id: 'c', criterion: 'do it' }], judgements: { c: 'not-met' }, error_tags: [], comp: { mode: 'independent' } }]),
  FV.nextPractice({ why: 'b', item_id: 'X', kind: 'transfer', learn_path: 'g.md', reason: ['r'] }),
  FV.reassessment('2026-11-01'), FV.whyItMatters('Because it matters.'),
  PV.render(R.profile(ex, D, TODAY), 'UK')
].join('\n');

const used = new Set();
for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach(c => { if (c && !c.includes('{')) used.add(c); });

const cssFiles = ['product.css', 'style.css'].filter(f => fs.existsSync(path.join(root, 'learner', f)));
const cssAll = cssFiles.map(f => fs.readFileSync(path.join(root, 'learner', f), 'utf8')).join('\n');
const defined = new Set([...cssAll.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
// include base classes the pre-existing app already styles
const base = new Set(['card', 'actions', 'muted', 'eyebrow', 'time', 'notice', 'secondary', 'visually-hidden', 'bar', 'task-text']);

const missing = [...used].filter(c => !defined.has(c) && !base.has(c)).sort();
console.log('classes emitted by new views :', used.size);
console.log('classes with a CSS rule      :', [...used].filter(c => defined.has(c) || base.has(c)).length);
console.log('');
if (missing.length) { console.log('UNSTYLED (no rule found):'); missing.forEach(c => console.log('  .' + c)); process.exit(1); }
console.log('PASS: every emitted class has a style.');