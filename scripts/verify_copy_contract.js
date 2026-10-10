// Guard the strings the browser suite depends on.
//
// The e2e suite drives the real page by accessible name and label. Renaming
// user-facing copy therefore breaks the browser job in a way no unit check,
// validator or render test can see - it happened once (the feedback heading was
// reworded, failing five journeys) and was only caught in CI.
//
// This extracts every string the e2e spec looks up and asserts it still exists
// in the learner sources, so the breakage fails fast in the quality job with a
// clear reason instead of surfacing as a timeout in the browser job.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const spec = fs.readFileSync(path.join(root, 'tests/e2e/learner.spec.js'), 'utf8');
const sources = ['learner/app.js', 'learner/index.html', 'learner/ui.js', 'learner/assessor.js', 'learner/evidence.js', 'learner/engine.js', 'learner/catalog.js',
  // The simulation journey looks up copy that lives in the simulation view
  // and in the generated learner data (stage headings, titles).
  'learner/simulation-view.js', 'learner/data.js']
  .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');

// Values that are data, not copy: select-option values, view hashes, judgement
// values, role names and the fictional-locality codes.
const NOT_COPY = new Set([
  'button', 'link', 'heading', 'met', 'not-met', 'partly-met',
  'capstones', 'guided', 'unseen', 'money', 'wales', 'uk',
  'observed-sample-restore'
]);

const wanted = new Set();
for (const m of spec.matchAll(/getBy(?:Role|Label|Text)\(([^)]*)\)/g)) {
  for (const s of m[1].matchAll(/'([^']+)'/g)) if (!NOT_COPY.has(s[1])) wanted.add(s[1]);
}
// Option values and the access-support label are looked up by value.
for (const m of spec.matchAll(/selectOption\('([^']+)'\)/g)) if (!NOT_COPY.has(m[1])) wanted.add(m[1]);

let fail = 0;
const missing = [];
for (const s of [...wanted].sort()) {
  // Match either the literal, or the hyphenated id form the UI renders
  // ("extra time" is the label for the `extra-time` support).
  const asId = s.replace(/ /g, '-');
  if (sources.includes(s) || sources.includes(asId)) {
    console.log('PASS ' + s);
  } else {
    console.log('FAIL ' + s + '  (not found in the learner sources)');
    missing.push(s);
    fail++;
  }
}

console.log('\nchecked ' + wanted.size + ' strings the browser suite depends on');
if (missing.length) {
  console.log('\nThese lookups would fail in the browser job. Either restore the copy or update tests/e2e/learner.spec.js:');
  missing.forEach(s => console.log('  - ' + s));
}
console.log(fail === 0 ? '\nALL COPY-CONTRACT CHECKS PASS' : '\n' + fail + ' FAILURE(S)');
process.exit(fail === 0 ? 0 : 1);