// Practical tools: budget maths, timing, validation, markdown, evidence log.
// Uses only Node built-ins; mirrors the edge cases a learner will hit.
'use strict';
const assert = require('assert');
const T = require('../learner/tools.js');

const t = (name, fn) => { try { fn(); console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + '  ' + e.message); process.exitCode = 1; } };

t('parseAmount accepts currency and blanks', () => {
  assert.strictEqual(T.parseAmount('£1,200.50'), 1200.5);
  assert.strictEqual(T.parseAmount(''), 0);
  assert.strictEqual(T.parseAmount(null), 0);
  assert.strictEqual(T.parseAmount('  45 '), 45);
});

t('parseAmount rejects non-numeric text', () => {
  assert.ok(Number.isNaN(T.parseAmount('abc')));
  assert.ok(Number.isNaN(T.parseAmount('12x')));
});

t('budget totals include the irregular allowance once', () => {
  const b = T.emptyBudget();
  b.income[0].amount = '1000';
  b.outgoings[0].amount = '400';
  b.irregularExpected = '120';
  b.irregularMonths = '12';
  const totals = T.budgetTotals(b);
  assert.strictEqual(totals.income, 1000);
  assert.strictEqual(totals.allowance, 10);
  assert.strictEqual(totals.outgoings, 410);
  assert.strictEqual(totals.unallocated, 590);
});

t('irregular allowance needs whole months in range', () => {
  const b = T.emptyBudget();
  b.irregularExpected = '120'; b.irregularMonths = '0';
  assert.strictEqual(T.irregularAllowance(b), 0);
  b.irregularMonths = 'six';
  assert.strictEqual(T.irregularAllowance(b), 0);
});

t('irregular allowance matches the worksheet example and warns only when unusable', () => {
  // templates/budget.md: an annual expense of 120 saved over twelve months
  // gives a monthly allowance of 10; with six months remaining it is 20.
  const b = T.emptyBudget();
  b.irregularExpected = '120'; b.irregularMonths = '12';
  assert.strictEqual(T.irregularAllowance(b), 10);
  b.irregularMonths = '6';
  assert.strictEqual(T.irregularAllowance(b), 20);
  assert.ok(!T.validateBudget(b).some(w => /irregular/i.test(w)), 'a valid allowance raises no warning');
  // Amount present but months unusable: the plain-word warning appears.
  b.irregularMonths = '0';
  assert.ok(T.validateBudget(b).some(w => /whole months remaining/.test(w)));
});

t('decision totals count cells so partial coverage can warn', () => {
  // validateDecision warns when rated < cells, so cells must cover every
  // importance x rating box, set or not.
  const d = T.emptyDecision();
  d.importance = ['3', '1', '', ''];
  d.ratings = [['3', '1', '2'], ['2', '2', '2'], ['', '', ''], ['', '', '']];
  assert.strictEqual(T.decisionTotals(d).cells, 12, 'four criteria x three options');
  assert.strictEqual(T.decisionTotals(T.emptyDecision()).cells, 12, 'empty boxes still count');
});

t('timing check finds a below-zero low point', () => {
  const b = T.emptyBudget();
  b.income[0] = { label: 'Pay', amount: '500', day: '1' };
  b.outgoings[0] = { label: 'Rent', amount: '600', day: '2' };
  const timing = T.timingCheck('0', b.income, b.outgoings);
  assert.strictEqual(timing.belowZero, true);
  assert.strictEqual(timing.lowest, -100);
});

t('timing check returns null with no dated rows', () => {
  const b = T.emptyBudget();
  assert.strictEqual(T.timingCheck('100', b.income, b.outgoings), null);
});

t('overspending warns in plain words', () => {
  const b = T.emptyBudget();
  b.income[0].amount = '500';
  b.outgoings[0].amount = '700';
  assert.ok(T.validateBudget(b).some(w => /exceed income/.test(w)));
});

t('budget markdown never leaks raw input as markup', () => {
  const b = T.emptyBudget();
  b.irregularLabel = '<script>x</script>';
  const md = T.budgetMarkdown(b);
  assert.ok(md.includes('<script>x</script>'), 'markdown is plain text, kept as written');
  const html = T.budgetForm(b);
  assert.ok(!html.includes('<script>x</script>'), 'form HTML must escape');
});

t('review validation asks for one action', () => {
  assert.ok(T.validateReview(T.emptyReview()).some(w => /smallest next action/.test(w)));
  const r = T.emptyReview();
  r.practised = 'budget'; r.priorities[0].action = 'cook once';
  assert.strictEqual(T.validateReview(r).length, 0);
});

t('review and decision dates validate real calendar days including leap years', () => {
  const review = T.emptyReview();
  review.practised = 'budget'; review.priorities[0].action = 'cook once';
  review.reviewDate = '2024-02-29';
  assert.strictEqual(T.validateReview(review).length, 0);
  review.reviewDate = '2026-02-29';
  assert.ok(T.validateReview(review).some(w => /real date/.test(w)));

  const decision = T.emptyDecision();
  decision.date = '2026-02-31';
  decision.deadline = '2026-04-30';
  assert.ok(T.validateDecision(decision).some(w => /real dates/.test(w)));
  decision.date = '2024-02-29';
  decision.deadline = '2026-04-31';
  assert.ok(T.validateDecision(decision).some(w => /real dates/.test(w)));
  decision.deadline = '2026-04-30';
  assert.ok(!T.validateDecision(decision).some(w => /real dates/.test(w)));
});

t('storage keys isolate profiles', () => {
  assert.notStrictEqual(T.storageKey('a'), T.storageKey('b'));
  assert.ok(T.storageKey('a').includes('a'));
});

t('evidence log groups capstone bundles into one entry', () => {
  const state = {
    records: [
      { id: 'r1', attempt_id: 'a1', competency_id: 'c.1', item_id: 'I', date: '2026-01-02', outcome: 'demonstrated', evidence_level: 'self-reviewed' },
      { id: 'r2', attempt_id: 'a1', competency_id: 'c.2', item_id: 'I', date: '2026-01-02', outcome: 'assisted', evidence_level: 'self-reviewed' },
      { id: 'r3', attempt_id: 'a2', competency_id: 'c.1', item_id: 'J', date: '2026-01-05', outcome: 'not-yet', evidence_level: 'self-reviewed' }
    ],
    reviews: [{ id: 'v1', record_id: 'r1', date: '2026-01-03', basis: 'original-output' }],
    observations: [{ id: 'o1', kind: 'k', date: '2026-01-04', outcome: 'demonstrated' }],
    exposures: [{ item_id: 'X', attempt_id: 'e1', date: '2026-01-01', assessment_version: 1 }]
  };
  const entries = T.logEntries(state);
  assert.strictEqual(entries.length, 4, '2 attempts + 1 review + 1 observation; exposures excluded');
  assert.ok(entries.every((e, i, a) => i === 0 || a[i - 1].date <= e.date), 'chronological');
  assert.ok(entries[0].summary.includes('c.1') && entries[0].summary.includes('c.2'), 'bundle grouped');
});

t('evidence log is empty for a new learner', () => {
  assert.deepStrictEqual(T.logEntries({ records: [], reviews: [], observations: [], exposures: [] }), []);
});

t('decision totals weight importance by rating', () => {
  const d = T.emptyDecision();
  d.importance = ['3', '1', '', ''];
  d.ratings = [['3', '1', '2'], ['2', '2', '2'], ['', '', ''], ['', '', '']];
  const totals = T.decisionTotals(d);
  assert.deepStrictEqual(totals.scores, [11, 5, 8]);
  assert.strictEqual(totals.rated, 6);
});

t('decision totals ignore unset cells', () => {
  const totals = T.decisionTotals(T.emptyDecision());
  assert.deepStrictEqual(totals.scores, [0, 0, 0]);
  assert.strictEqual(totals.rated, 0);
});

t('decision validation asks for a question and a reason', () => {
  const warnings = T.validateDecision(T.emptyDecision());
  assert.ok(warnings.some(w => /as a question/.test(w)));
  const d = T.emptyDecision();
  d.question = 'Which flat should I take?'; d.choice = 'a';
  assert.ok(T.validateDecision(d).some(w => /without saying why/.test(w)));
  d.reason = 'Closer to work and the exit terms are clear.';
  d.importance = ['2', '', '', '']; d.ratings[0] = ['3', '1', ''];
  assert.ok(!T.validateDecision(d).some(w => /without saying why/.test(w)));
});

t('decision result frames totals as support, never a verdict', () => {
  const d = T.emptyDecision();
  d.importance = ['3', '', '', '']; d.ratings[0] = ['3', '1', ''];
  const html = T.decisionResult(d);
  assert.ok(html.includes('not a verdict'));
  assert.ok(!/<script/.test(T.decisionForm(d)));
});

t('decision form escapes hostile option names', () => {
  const d = T.emptyDecision();
  d.options[0].name = '<img src=x onerror=y>';
  const html = T.decisionForm(d);
  assert.ok(!html.includes('<img src=x onerror=y>'));
  assert.ok(T.decisionMarkdown(d).includes('<img src=x onerror=y>'), 'markdown export is plain text, kept as written');
});

t('decision markdown records choice and review for later', () => {
  const d = T.emptyDecision();
  d.question = 'Which flat?'; d.choice = 'wait'; d.reason = 'Need the paperwork first.'; d.reviewDate = '2026-12-01';
  const md = T.decisionMarkdown(d);
  assert.ok(md.includes('Which flat?') && md.includes('wait') && md.includes('2026-12-01'));
  assert.ok(md.includes('not evidence'));
});

console.log('done');
