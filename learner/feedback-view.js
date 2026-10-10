/* Learner-facing feedback: what was right, what was missing, why it mattered,
 * what to practise, and what to try next. Pure rendering from data the engine
 * and feedback assets already provide — it decides nothing.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FeedbackView = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const OUTCOME_TONE = { demonstrated: 'done', assisted: 'warn', 'not-yet': 'stop' };
  const OUTCOME_PLAIN = {
    demonstrated: 'Shown independently',
    assisted: 'Completed with help — useful practice, not independent evidence',
    'not-yet': 'Not yet — an essential step was not met'
  };

  // The "why this matters" sentence per competence mode. Keeps feedback from
  // feeling like a score while staying grounded in the competency's role.
  function whyItMatters(comp) {
    if (!comp) return '';
    if (comp.mode === 'knowledge') return 'Knowing the steps matters because it is what lets you act safely when the situation is unfamiliar.';
    return 'This is a skill you will need again in a slightly different form, so it is worth being able to do it without the prompts.';
  }

  function resultBanner(outcome) {
    return '<div class="fb__result fb__result--' + (OUTCOME_TONE[outcome] || 'stop') + '">' +
      '<p><strong>' + esc(OUTCOME_PLAIN[outcome] || outcome) + '</strong></p></div>';
  }

  /* Make an error tag readable even without the curriculum's label map.
   * The app always passes the real labels; this is the safe fallback so a raw
   * machine id ('assumes-missing-information') can never be shown to a learner
   * just because a caller forgot an argument. */
  function readableTag(t) {
    if (!t) return '';
    return t.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
  }

  /* Per-competency breakdown for the feedback area.
   * `labels` maps error-tag ids to learner-facing wording. */
  function perCompetency(rows, labels) {
    return '<div class="fb__per">' + rows.map(r => {
      const missed = (r.scoring || []).filter(s => r.judgements[s.id] && r.judgements[s.id] !== 'met');
      const met = (r.scoring || []).filter(s => r.judgements[s.id] === 'met');
      const errs = (r.error_tags || []).map(t => (labels && labels[t]) || readableTag(t));
      return '<div class="fb__c">' +
        '<h4>' + esc(r.title) + '</h4>' +
        (met.length ? '<p class="fb__ok">Right: ' + esc(met.map(s => s.criterion).slice(0, 2).join('; ')) + (met.length > 2 ? '…' : '') + '</p>' : '') +
        (missed.length
          ? '<p class="fb__miss">Missing: ' + esc(missed.map(s => s.criterion).slice(0, 2).join('; ')) + (missed.length > 2 ? '…' : '') + '</p>'
          : '<p class="fb__ok">Every essential step was met for this skill.</p>') +
        (errs.length ? '<p class="fb__err">Errors to work on: ' + esc(errs.join(', ')) + '</p>' : '') +
        '<p class="fb__why">' + esc(whyItMatters(r.comp)) + '</p>' +
        '</div>';
    }).join('') + '</div>';
  }

  function nextPractice(n) {
    if (!n) return '';
    return '<div class="fb__next"><h4>Your next practice</h4>' +
      '<p>' + esc(n.why) + '</p>' +
      '<div class="actions">' +
      (n.item_id ? '<button type="button" data-task="' + esc(n.item_id) + '">' + esc(n.kind === 'retention' ? 'Start the later check' : 'Try a fresh situation') + '</button>' : '') +
      (n.learn_path ? '<button type="button" class="secondary" data-learn="' + esc(n.learn_path) + '">Revisit the skill</button>' : '') +
      '</div>' +
      (n.reason && n.reason.length ? '<details><summary>Why this?</summary><ul>' + n.reason.slice(0, 4).map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></details>' : '') +
      '</div>';
  }

  function reassessment(when) {
    if (!when) return '';
    return '<p class="fb__reassess">A fresh check is expected around <strong>' + esc(when) + '</strong>. That is a new situation, days later, to confirm it stuck.</p>';
  }

  // An AI-assisted draft (example, coaching hint, or personalised explanation).
  // It is always framed as practice help, never as the learner's own answer, and
  // is escaped on render so adapter output cannot reach the page as markup.
  function draft(content, warnings) {
    return '<div class="ai-draft card" aria-label="AI-assisted draft">' +
      '<p class="eyebrow">AI-ASSISTED DRAFT</p>' +
      '<p class="muted">A practice aid generated on request. Useful for reasoning, but answering on your own on fresh material is what records evidence; using this counts as solving help.</p>' +
      '<div class="ai-draft__body">' + esc(content) + '</div>' +
      (warnings && warnings.length ? '<p class="muted">Note: ' + esc(warnings.join(' ')) + '</p>' : '') +
      '</div>';
  }

  return { resultBanner, perCompetency, nextPractice, reassessment, whyItMatters, draft, esc };
});