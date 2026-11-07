/* Interactive practical tools: a monthly budget builder, a weekly review
 * planner, and a decision workspace. These turn the static Markdown
 * worksheets (templates/budget.md, templates/weekly-review.md,
 * templates/decision-journal.md) into usable offline tools — the gap every
 * serious competitor (MoneyHelper, Barclays LifeSkills) fills with an
 * interactive planner rather than a worksheet.
 *
 * EVIDENCE CONTRACT: tools are practice aids, never evidence. Nothing here
 * derives an outcome, writes to the evidence state, or is imported as a
 * record. Drafts live under a separate localStorage key per learner profile
 * so they can never affect validation or derivation. A tool draft used to
 * solve a task counts as solving help and must be recorded honestly in the
 * attempt — the tool says so on screen.
 *
 * No dependencies. UMD: browser global PracticalTools, Node requireable.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PracticalTools = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PREFIX = 'life-essential-skills-tools-v1';
  const storageKey = profileId => PREFIX + '::' + profileId;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Parse a money input liberally: "£1,200.50", "1200", "" -> number or 0.
  // Returns NaN only for genuinely non-numeric text ("abc", "12x").
  function parseAmount(raw) {
    if (raw == null) return 0;
    let s = String(raw).trim().replace(/[£$€,\s]/g, '');
    if (s === '' || s === '-') return 0;
    if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return NaN;
    return Number(s);
  }

  const INCOME_LABELS = ['Take-home income', 'Other reliable income'];
  const OUTGOING_LABELS = ['Housing', 'Utilities', 'Food', 'Transport', 'Health and care costs', 'Debt payments', 'Other essentials', 'Flexible spending', 'Emergency savings', 'Other planned savings'];

  function emptyBudget() {
    return {
      opening: '',
      income: INCOME_LABELS.map(label => ({ label, amount: '', day: '' })),
      outgoings: OUTGOING_LABELS.map(label => ({ label, amount: '', day: '' })),
      irregularLabel: '',
      irregularExpected: '',
      irregularMonths: '',
      updated: null
    };
  }

  function rowTotal(rows) {
    let sum = 0;
    for (const r of rows || []) {
      const v = parseAmount(r.amount);
      if (Number.isFinite(v)) sum += v;
    }
    return Math.round(sum * 100) / 100;
  }

  function irregularAllowance(b) {
    const total = parseAmount(b.irregularExpected);
    const months = Number(String(b.irregularMonths).trim());
    if (!Number.isFinite(total) || total <= 0) return 0;
    if (!Number.isInteger(months) || months < 1 || months > 60) return 0;
    return Math.round((total / months) * 100) / 100;
  }

  function budgetTotals(b) {
    const income = rowTotal(b.income);
    const allowance = irregularAllowance(b);
    const outgoings = Math.round((rowTotal(b.outgoings) + allowance) * 100) / 100;
    return { income, outgoings, allowance, unallocated: Math.round((income - outgoings) * 100) / 100 };
  }

  // Cash-flow timing: walk dated flows in day order from the opening balance
  // and report the lowest point. Rows without a day are ignored; with no
  // dated rows there is nothing to check (returns null).
  function timingCheck(openingRaw, incomeRows, outgoingRows) {
    const opening = parseAmount(openingRaw);
    if (!Number.isFinite(opening)) return null;
    const flows = [];
    for (const r of incomeRows || []) {
      const day = Number(String(r.day).trim());
      const v = parseAmount(r.amount);
      if (Number.isInteger(day) && day >= 1 && day <= 31 && Number.isFinite(v) && v > 0) flows.push({ day, delta: v, label: r.label });
    }
    for (const r of outgoingRows || []) {
      const day = Number(String(r.day).trim());
      const v = parseAmount(r.amount);
      if (Number.isInteger(day) && day >= 1 && day <= 31 && Number.isFinite(v) && v > 0) flows.push({ day, delta: -v, label: r.label });
    }
    if (!flows.length) return null;
    flows.sort((a, b) => a.day - b.day);
    let balance = opening, lowest = opening, lowestDay = null;
    for (const f of flows) {
      balance = Math.round((balance + f.delta) * 100) / 100;
      if (balance < lowest) { lowest = balance; lowestDay = f.day; }
    }
    return { lowest, lowestDay, belowZero: lowest < 0 };
  }

  function validateBudget(b) {
    const warnings = [];
    const all = [...(b.income || []), ...(b.outgoings || [])];
    if (all.some(r => Number.isNaN(parseAmount(r.amount)))) warnings.push('Some amounts are not numbers — they are ignored in the totals until fixed.');
    if (all.some(r => parseAmount(r.amount) < 0)) warnings.push('Negative amounts do not belong here — move a refund into income instead.');
    const t = budgetTotals(b);
    if (t.income <= 0) warnings.push('No income entered yet — a budget starts from what actually arrives.');
    else if (t.unallocated < 0) warnings.push('Outgoings exceed income by ' + money(-t.unallocated) + ' — choose one spending adjustment before anything else.');
    const timing = timingCheck(b.opening, b.income, b.outgoings);
    if (timing && timing.belowZero) warnings.push('The balance falls below zero around day ' + timing.lowestDay + ' — bill timing matters as much as the monthly total.');
    if (String(b.irregularExpected).trim() && !irregularAllowance(b)) warnings.push('The irregular-expense allowance needs an expected amount and whole months remaining (1–60).');
    return warnings;
  }

  function money(v) {
    return '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function budgetMarkdown(b) {
    const t = budgetTotals(b);
    const row = r => '| ' + r.label + ' | ' + (String(r.amount).trim() || '—') + ' | ' + (String(r.day).trim() || '—') + ' |';
    return '# Monthly budget (from the budgeting tool)\n\n' +
      'Opening available balance: ' + (String(b.opening).trim() || '—') + '\n\n' +
      '## Income\n\n' + b.income.map(row).join('\n') + '\n**Total income: ' + money(t.income) + '**\n\n' +
      '## Planned outgoings\n\n' + b.outgoings.map(row).join('\n') +
      '\nIrregular-expense allowance' + (b.irregularLabel ? ' (' + b.irregularLabel + ')' : '') + ': ' + money(t.allowance) + '\n' +
      '**Total planned outgoings: ' + money(t.outgoings) + '**\n\n' +
      '**Unallocated amount or gap: ' + money(t.unallocated) + '**\n\n' +
      'Practice aid only — not evidence. Figures you enter here stay in this browser.\n';
  }

  function emptyReview() {
    return { practised: '', independent: '', forgot: '', priorities: [{ action: '', when: '', barrier: '' }, { action: '', when: '', barrier: '' }, { action: '', when: '', barrier: '' }], reviewDate: '', updated: null };
  }

  function validateReview(r) {
    const warnings = [];
    if (!String(r.practised).trim() && !String(r.independent).trim()) warnings.push('Note at least what you practised — the review is for you, not for the record.');
    const filled = (r.priorities || []).filter(p => String(p.action).trim());
    if (!filled.length) warnings.push('Name one smallest next action — a plan without an action is a wish.');
    if (String(r.reviewDate).trim() && !validDate(r.reviewDate)) warnings.push('The review date should be a real date (YYYY-MM-DD).');
    return warnings;
  }

  function reviewMarkdown(r) {
    const lines = ['# Weekly review (from the planning tool)', '',
      'What I practised: ' + (String(r.practised).trim() || '—'),
      'What I can do without the guide: ' + (String(r.independent).trim() || '—'),
      'What I forgot or misunderstood: ' + (String(r.forgot).trim() || '—'), '',
      '## Next week', ''];
    (r.priorities || []).forEach((p, n) => {
      lines.push((n + 1) + '. ' + (String(p.action).trim() || '—') + ' — when: ' + (String(p.when).trim() || '—') + ' — likely barrier: ' + (String(p.barrier).trim() || '—'));
    });
    lines.push('', 'Next review: ' + (String(r.reviewDate).trim() || '—'), '', 'Practice aid only — not evidence. This plan stays in this browser.');
    return lines.join('\n') + '\n';
  }

  // Chronological evidence log: one entry per attempt bundle (capstone
  // attempts record several competencies under one attempt id — they belong
  // on one line), one per assessor review, one per practical observation.
  // Exposures are not evidence and are excluded. Pure derivation from state.
  function logEntries(state) {
    const entries = [];
    const byAttempt = new Map();
    for (const r of state.records || []) {
      if (!byAttempt.has(r.attempt_id)) byAttempt.set(r.attempt_id, []);
      byAttempt.get(r.attempt_id).push(r);
    }
    for (const [attemptId, rows] of byAttempt) {
      const first = rows[0];
      entries.push({
        date: first.date, kind: 'attempt',
        summary: rows.map(r => r.competency_id + ': ' + r.outcome + (r.evidence_level === 'assessor-reviewed' ? ' (assessor-reviewed)' : ' (self-reviewed)')).join('; '),
        item_id: first.item_id, attempt_id: attemptId
      });
    }
    for (const v of state.reviews || []) entries.push({ date: v.date, kind: 'review', summary: 'Assessor review of ' + v.record_id + ' (' + v.basis + ')', record_id: v.record_id });
    for (const o of state.observations || []) entries.push({ date: o.date, kind: 'observation', summary: o.kind + ': ' + o.outcome + ' (observed)', obs_kind: o.kind });
    entries.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return entries.slice(-200);
  }

  function budgetForm(b) {
    const num = (id, label, value, extra) => '<label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" data-budget="' + id + '" inputmode="decimal" autocomplete="off" value="' + esc(value) + '"' + (extra || '') + '>';
    let html = '<div class="tool__grid">';
    html += '<div><h3>Income</h3>' + b.income.map((r, n) => num('t-income-' + n, r.label + ' (£)', r.amount)).join('') + '</div>';
    html += '<div><h3>Planned outgoings</h3>' + b.outgoings.map((r, n) => num('t-out-' + n, r.label + ' (£)', r.amount)).join('') + '</div></div>';
    html += '<details><summary>Bill timing (optional — checks the balance through the month)</summary><p class="muted">Opening balance plus the day each bill or pay arrives (1–31). Undated rows are ignored here but still count in the totals.</p>';
    html += num('t-opening', 'Opening available balance (£)', b.opening);
    html += '<div class="tool__grid"><div>' + b.income.map((r, n) => num('t-income-day-' + n, r.label + ' — day received', r.day)).join('') + '</div>';
    html += '<div>' + b.outgoings.map((r, n) => num('t-out-day-' + n, r.label + ' — day due', r.day)).join('') + '</div></div></details>';
    html += '<details><summary>Irregular expense (optional — yearly bill saved monthly)</summary>';
    html += num('t-irr-label', 'Expense (e.g. annual bus pass)', b.irregularLabel);
    html += '<div class="tool__grid"><div>' + num('t-irr-expected', 'Expected amount (£)', b.irregularExpected) + '</div><div>' + num('t-irr-months', 'Months left to save', b.irregularMonths) + '</div></div></details>';
    return html;
  }

  function budgetResult(b) {
    const t = budgetTotals(b);
    const timing = timingCheck(b.opening, b.income, b.outgoings);
    const warnings = validateBudget(b);
    let html = '<div class="tool__summary" aria-live="polite"><p class="tool__total">Income <strong>' + esc(money(t.income)) + '</strong> · Outgoings <strong>' + esc(money(t.outgoings)) + '</strong>' +
      (t.allowance ? ' (includes ' + esc(money(t.allowance)) + ' monthly allowance)' : '') +
      ' · <span class="' + (t.unallocated < 0 ? 'tool__gap' : 'tool__ok') + '">Unallocated ' + esc(money(t.unallocated)) + '</span></p>';
    if (timing) html += '<p class="muted">Lowest balance through the month: ' + esc(money(timing.lowest)) + (timing.belowZero ? ' — below zero.' : ' — stays above zero.') + '</p>';
    if (warnings.length) html += '<ul>' + warnings.map(w => '<li class="tool__warn">' + esc(w) + '</li>').join('') + '</ul>';
    return html + '</div>';
  }

  function reviewForm(r) {
    const text = (id, label, value) => '<label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" data-review="' + id + '" autocomplete="off" value="' + esc(value) + '">';
    let html = text('r-practised', 'What did you actually practise?', r.practised) +
      text('r-independent', 'What can you now do without the guide?', r.independent) +
      text('r-forgot', 'What did you forget or misunderstand?', r.forgot);
    html += '<h3>Next week — smallest actions first</h3>';
    (r.priorities || []).forEach((p, n) => {
      html += '<div class="tool__grid"><div>' + text('r-p' + n + '-action', 'Priority ' + (n + 1) + ' action', p.action) + '</div><div>' +
        text('r-p' + n + '-when', 'When', p.when) + text('r-p' + n + '-barrier', 'Likely barrier', p.barrier) + '</div></div>';
    });
    html += text('r-date', 'Next review date', r.reviewDate);
    const warnings = validateReview(r);
    if (warnings.length) html += '<ul>' + warnings.map(w => '<li class="tool__warn">' + esc(w) + '</li>').join('') + '</ul>';
    return html;
  }

  // Decision workspace: turns the decision-journal worksheet into a tool a
  // learner can actually reason with. Grounded in the FS decision journal
  // (a short "before" record: situation, options, expectations, state —
  // reviewed later against what happened) and the Alliance weight-and-rate
  // method (name what matters, weight importance, rate each option on the
  // same criteria). The weighted comparison is support for judgement, never
  // a verdict: the tool says so on screen, and "wait or test first" is
  // always an option. Same evidence contract as every other tool: a
  // practice aid only, never evidence, never imported as a record.
  const DECISION_CRITERIA = ['Total cost', 'Time and access needs', 'Benefits if it works', 'Risks and exit options'];
  const DECISION_OPTIONS = ['Option A', 'Option B', 'Wait or test first'];

  function emptyDecision() {
    return {
      question: '', date: '', deadline: '',
      options: DECISION_OPTIONS.map(name => ({ name, notes: '' })),
      importance: DECISION_CRITERIA.map(() => ''),
      ratings: DECISION_CRITERIA.map(() => ['', '', '']),
      confidence: '', baseRate: '', talkTo: '',
      choice: '', reason: '', reviewDate: '', outcome: '', reflection: '',
      updated: null
    };
  }

  function validDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
    if (!match) return false;
    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  const weightOf = v => { const n = Number(String(v).trim()); return n === 1 || n === 2 || n === 3 ? n : 0; };

  // Weighted support per option: sum of importance x rating over criteria
  // where both are set. Unset cells contribute nothing and are counted, so
  // the result can say how complete the comparison is.
  function decisionTotals(d) {
    const scores = [0, 0, 0];
    let rated = 0, cells = 0;
    (d.importance || []).forEach((imp, c) => {
      const w = weightOf(imp);
      (d.ratings && d.ratings[c] || []).forEach((r, o) => {
        const v = weightOf(r);
        cells++;
        if (w && v) { scores[o] += w * v; rated++; }
      });
    });
    return { scores, rated, cells };
  }

  function validateDecision(d) {
    const warnings = [];
    if (!String(d.question).trim()) warnings.push('Name the decision as a question — "which flat should I take?" beats "housing".');
    const t = decisionTotals(d);
    if (!t.rated) warnings.push('Set an importance and a rating to see the comparison — it stays empty until then.');
    else if (t.rated < t.cells) warnings.push('Some importance or rating boxes are still empty — the comparison only covers what you rated.');
    if (String(d.choice).trim() && !String(d.reason).trim()) warnings.push('You picked an option without saying why — the reason is what the later review learns from.');
    for (const field of ['date', 'deadline', 'reviewDate']) {
      if (String(d[field]).trim() && !validDate(d[field])) warnings.push('Dates should be real dates (YYYY-MM-DD).');
    }
    return warnings;
  }

  function decisionMarkdown(d) {
    const t = decisionTotals(d);
    const optName = o => (d.options && d.options[o] && String(d.options[o].name).trim()) || DECISION_OPTIONS[o];
    const lines = ['# Decision workspace (a practice aid — not evidence)', '',
      'Question: ' + (String(d.question).trim() || '—'),
      'Date: ' + (String(d.date).trim() || '—') + ' — Decide by: ' + (String(d.deadline).trim() || '—'), '',
      '## Options', ''];
    (d.options || []).forEach((o, n) => {
      lines.push('### ' + optName(n) + ' (support: ' + t.scores[n] + ')', String(o.notes).trim() || '—', '');
    });
    lines.push('## What mattered', '');
    DECISION_CRITERIA.forEach((c, n) => {
      const imp = weightOf(d.importance && d.importance[n]);
      const rates = (d.ratings && d.ratings[n] || []).map((r, o) => optName(o) + ': ' + (weightOf(r) || '—')).join(' · ');
      lines.push('- ' + c + ' (importance ' + (imp || '—') + '): ' + rates);
    });
    lines.push('', 'Confidence: ' + (String(d.confidence).trim() || '—'),
      'What usually happens in similar situations: ' + (String(d.baseRate).trim() || '—'),
      'Who to talk it through with: ' + (String(d.talkTo).trim() || '—'), '',
      '## Choice and review', '',
      'Choice: ' + (String(d.choice).trim() || '—'),
      'Reason: ' + (String(d.reason).trim() || '—'),
      'Review on: ' + (String(d.reviewDate).trim() || '—'),
      'What actually happened: ' + (String(d.outcome).trim() || '—'),
      'What I learned about how I decide: ' + (String(d.reflection).trim() || '—'), '',
      'Practice aid only — not evidence. This workspace stays in this browser.');
    return lines.join('\n') + '\n';
  }

  function decisionForm(d) {
    const text = (id, label, value) => '<label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" data-decision="' + id + '" autocomplete="off" value="' + esc(value) + '">';
    const optName = o => (d.options && d.options[o] && String(d.options[o].name).trim()) || DECISION_OPTIONS[o];
    let html = text('d-question', 'The decision, as a question', d.question);
    html += '<div class="tool__grid"><div>' + text('d-date', 'Date (YYYY-MM-DD)', d.date) + '</div><div>' + text('d-deadline', 'Decide by (YYYY-MM-DD, if there is a deadline)', d.deadline) + '</div></div>';
    html += '<h3>Options — including waiting</h3><p class="muted">Name up to three real alternatives. Waiting or testing first is a decision too.</p>';
    (d.options || []).forEach((o, n) => {
      html += '<div class="tool__grid"><div>' + text('d-opt-' + n + '-name', 'Name of ' + DECISION_OPTIONS[n].toLowerCase(), o.name) + '</div><div>' + text('d-opt-' + n + '-notes', 'What this would involve', o.notes) + '</div></div>';
    });
    html += '<h3>What matters, and how each option rates</h3><p class="muted">First say how important each point is (1–3), then rate every option on it (1 = poor, 3 = strong). Leave a box empty where it does not apply.</p>';
    DECISION_CRITERIA.forEach((c, n) => {
      const imp = (id, label, value, choices) => '<label for="' + id + '">' + esc(label) + '</label><select id="' + id + '" data-decision="' + id + '">' + choices.map(([v, l]) => '<option value="' + v + '"' + (String(value).trim() === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
      const impChoices = [['', 'Not set'], ['1', '1 — matters a little'], ['2', '2 — matters'], ['3', '3 — matters most']];
      const rateChoices = [['', 'Not rated'], ['1', '1 — poor'], ['2', '2 — okay'], ['3', '3 — strong']];
      html += '<fieldset><legend>' + esc(c) + '</legend>' + imp('d-imp-' + n, 'How important is this?', d.importance[n], impChoices);
      (d.ratings[n] || []).forEach((r, o) => { html += imp('d-rate-' + n + '-' + o, optName(o), r, rateChoices); });
      html += '</fieldset>';
    });
    html += '<h3>Before you choose</h3>';
    html += text('d-confidence', 'How confident are you, and why?', d.confidence);
    html += text('d-baserate', 'What usually happens to people in a similar situation?', d.baseRate);
    html += text('d-talkto', 'Who could you talk this through with?', d.talkTo);
    html += '<h3>Choice and later review</h3>';
    const choiceVal = String(d.choice).trim();
    html += '<label for="d-choice">Your choice</label><select id="d-choice" data-decision="d-choice"><option value="">Not chosen yet</option>' +
      ['a', 'b', 'wait'].map(v => '<option value="' + v + '"' + (choiceVal === v ? ' selected' : '') + '>' + esc({ a: optName(0), b: optName(1), wait: optName(2) }[v]) + '</option>').join('') + '</select>';
    html += text('d-reason', 'Why this one? (this is what the review learns from)', d.reason);
    html += text('d-review-date', 'Look at this again on (YYYY-MM-DD)', d.reviewDate);
    html += text('d-outcome', 'What actually happened (fill in later)', d.outcome);
    html += text('d-reflection', 'What did you learn about how you decide? (fill in later)', d.reflection);
    return html;
  }

  function decisionResult(d) {
    const t = decisionTotals(d);
    const optName = o => (d.options && d.options[o] && String(d.options[o].name).trim()) || DECISION_OPTIONS[o];
    const warnings = validateDecision(d);
    let html = '<div class="tool__summary" aria-live="polite">';
    if (t.rated) {
      html += '<p class="tool__total">' + [0, 1, 2].map(o => esc(optName(o)) + ' <strong>' + t.scores[o] + '</strong>').join(' · ') + '</p>' +
        '<p class="muted">Weighted support, not a verdict: the highest total shows where your own ratings point, not which option is right. An unrated point counts for nothing — check what you left out before deciding.</p>';
    } else {
      html += '<p class="muted">The comparison appears here once you set an importance and a rating above.</p>';
    }
    if (warnings.length) html += '<ul>' + warnings.map(w => '<li class="tool__warn">' + esc(w) + '</li>').join('') + '</ul>';
    return html + '</div>';
  }

  return {
    PREFIX, storageKey, esc, parseAmount, money,
    INCOME_LABELS, OUTGOING_LABELS,
    emptyBudget, rowTotal, irregularAllowance, budgetTotals, timingCheck, validateBudget, budgetMarkdown,
    emptyReview, validateReview, reviewMarkdown,
    DECISION_CRITERIA, DECISION_OPTIONS, emptyDecision, decisionTotals, validateDecision, decisionMarkdown, decisionForm, decisionResult,
    logEntries, budgetForm, budgetResult, reviewForm
  };
});
