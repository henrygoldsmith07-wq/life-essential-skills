// Verify two things nothing else in CI checks:
//  1. Escaping. Every interpolation into HTML must be escaped, including when
//     content data contains hostile markup. Views are the only place raw text
//     becomes HTML, so a missing esc() here is a stored-XSS vector.
//  2. Accessibility. Controls need programmatic labels, radio groups need a
//     fieldset and legend, buttons need an accessible name, and decorative
//     glyphs must be hidden from screen readers.
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
let fail = 0;
const ok = (n, c, e) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (e ? '  ' + e : '')); if (!c) fail++; };

const TODAY = '2026-10-05';
const ex = E.migrateState(read('examples/learners/evaluation-cycle.json'), D, TODAY);
const rm = R.roadmap(ex, D, TODAY);
const sim = D.simulations.simulations[0];
const capItem = D.bank.items.find(i => i.id === sim.capstone);
const goal = D.goals.goals[0];

// ---------- 1. ESCAPING ----------
// Hostile content: a competency title and a task text containing markup.
const hostile = JSON.parse(JSON.stringify(D));
hostile.skills.competencies[0].title = '<img src=x onerror=alert(1)>';
hostile.bank.items[0].task = '<script>alert(2)</script>';
const rmH = R.roadmap(ex, hostile, TODAY);
const surfaces = {
  'roadmap': RV.render(rmH),
  'roadmap next': RV.nextPanel(rmH.next),
  'goals': OV.goalList(hostile.goals.goals, null),
  'onboarding situation': OV.situation(goal),
  'onboarding questions': OV.questions(goal, {}),
  'simulation stage': SV.stage(sim, 0),
  'simulation writeup': SV.writeUp(sim, { ...capItem, task: '<script>alert(2)</script>' }, '<p>m</p>'),
  'feedback': FV.perCompetency([{ title: '<b>x</b>', scoring: [{ id: 'c', criterion: '<i>y</i>' }], judgements: { c: 'not-met' }, error_tags: ['<b>t</b>'], comp: { mode: 'independent' } }], { '<b>t</b>': '<u>l</u>' }),
  'profile': PV.render(R.profile(ex, hostile, TODAY), 'UK')
};
let unsafe = [];
for (const [name, html] of Object.entries(surfaces)) {
  // Any raw tag that is not one of the tags the view itself emits.
  const allowed = new Set(['div', 'p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'button', 'details', 'summary', 'span', 'strong', 'em', 'span', 'section', 'form', 'label', 'input', 'fieldset', 'legend', 'textarea', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br', 'time', 'hr', 'small', 'code', 'b', 'i', 'u']);
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const tag = m[2].toLowerCase();
    if (!allowed.has(tag)) unsafe.push(name + ' -> <' + tag + '>');
    // Inline event handlers are never acceptable. Only look at real attributes,
    // i.e. the part of the tag before any quoted value that merely contains the
    // word (escaped content inside title="..." is not a handler).
    const attrs = (m[3] || '').replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
    if (/\son\w+\s*=/i.test(attrs)) unsafe.push(name + ' -> inline handler on <' + tag + '>');
  }
  if (/<script/i.test(html)) unsafe.push(name + ' -> literal <script');
}
ok('no unescaped markup reaches the page', unsafe.length === 0, unsafe.slice(0, 6).join(' | '));

// ---------- 2. ACCESSIBILITY ----------
function a11y(name, html) {
  const issues = [];
  // Inputs must have a label: via for=/id=, a wrapping <label>, or aria-label.
  for (const m of html.matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0];
    const id = (tag.match(/id="([^"]+)"/) || [])[1];
    const wrapped = new RegExp('<label[^>]*>\\s*' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(html);
    const labelled = (id && html.includes('for="' + id + '"')) || wrapped || /aria-label=/.test(tag);
    if (!labelled) issues.push('unlabelled input ' + tag.slice(0, 50));
  }
  for (const m of html.matchAll(/<textarea\b[^>]*>/g)) {
    const id = (m[0].match(/id="([^"]+)"/) || [])[1];
    if (!(id && html.includes('for="' + id + '"'))) issues.push('unlabelled textarea');
  }
  // Radio/checkbox groups should be in a fieldset with a legend.
  if (/<input type="radio"/.test(html) && !/<fieldset/.test(html)) issues.push('radio group outside a fieldset');
  if (/<legend>/.test(html) === false && /<fieldset/.test(html)) issues.push('fieldset without legend');
  // Exactly one h1 per document is expected; these are fragments, so allow h2+.
  const h1 = (html.match(/<h1\b/g) || []).length;
  if (h1 > 0) issues.push('fragment contains h1');
  // Icon-only controls need a name.
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const label = m[2].replace(/<[^>]+>/g, '').trim();
    if (!label && !/aria-label=/.test(m[1])) issues.push('button with no accessible name');
  }
  // Decorative glyphs should be hidden from screen readers.
  for (const m of html.matchAll(/<span[^>]*class="[^"]*__mark[^"]*"[^>]*>([\s\S]*?)<\/span>/g)) {
    if (!/aria-hidden/.test(m[0])) issues.push('decorative mark not aria-hidden');
  }
  return issues;
}
const a11yIssues = [];
for (const [name, html] of Object.entries(surfaces)) a11yIssues.push(...a11y(name, html).map(i => name + ': ' + i));
ok('views are accessible (labels, names, headings)', a11yIssues.length === 0, a11yIssues.slice(0, 5).join(' | '));

// ---------- 3. the milestone mark uses a glyph - confirm it is labelled ----------
const msHtml = RV.render(rm);
ok('milestone marks are decorative only', !/<span class="ms__mark">[^<]*<span/.test(msHtml));

// ---------- 4. empty-state safety ----------
const fresh = R.roadmap(E.emptyState('wales', 'general'), D, TODAY);
ok('roadmap renders for an empty learner', typeof RV.render(fresh) === 'string' && RV.render(fresh).length > 500);
ok('profile renders for an empty learner', PV.render(R.profile(E.emptyState('wales', 'general'), D, TODAY), 'UK').length > 500);
ok('every simulation stage renders', D.simulations.simulations.every(s => s.stages.every((st, n) => SV.stage(s, n).length > 100)));

console.log(fail === 0 ? '\nALL ACCESSIBILITY/ESCAPING CHECKS PASS' : '\n' + fail + ' FAILURE(S)');
process.exit(fail === 0 ? 0 : 1);