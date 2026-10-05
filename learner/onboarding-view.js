/* Goal-based onboarding. Pure rendering; selection logic lives in Roadmap.onboarding.
 *
 * The flow is: choose a goal -> answer 1-3 short questions -> we set the
 * pathway and focus competencies (valid evidence-free state changes) -> the
 * engine's own recommendation engine drives everything after that.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OnboardingView = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function goalCard(g, selected) {
    return '<button class="goaltile' + (selected === g.id ? ' goaltile--on' : '') + '" data-goal="' + esc(g.id) + '" aria-pressed="' + (selected === g.id ? 'true' : 'false') + '">' +
      '<span class="goaltile__title">' + esc(g.title) + '</span>' +
      '<span class="goaltile__promise">' + esc(g.promise) + '</span>' +
      '</button>';
  }

  function goalList(goals, selected) {
    return '<div class="goaltiles" role="group" aria-label="Choose what you are working towards">' +
      goals.map(g => goalCard(g, selected)).join('') + '</div>';
  }

  function situation(goal) {
    return '<div class="card situation"><p class="eyebrow">YOUR SITUATION</p><p class="quote">' + esc(goal.situation) + '</p>' +
      '<p>' + esc(goal.why_useful) + '</p></div>';
  }

  function question(q, chosen) {
    return '<fieldset class="q"><legend>' + esc(q.prompt) + '</legend>' +
      q.options.map(o => '<label class="qopt"><input type="radio" name="' + esc(q.id) + '" value="' + esc(o.value) + '"' + (chosen === o.value ? ' checked' : '') + '> ' + esc(o.label) + '</label>').join('') +
      '</fieldset>';
  }

  function questions(goal, answers) {
    if (!goal.questions || !goal.questions.length) return '';
    return '<form id="onboard-form">' + goal.questions.map(q => question(q, answers ? answers[q.id] : null)).join('') +
      '<div class="actions"><button type="submit">Build my roadmap</button></div></form>';
  }

  function sequence(plan) {
    if (!plan || !plan.sequence || !plan.sequence.length) return '';
    return '<ol class="sequence">' + plan.sequence.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>';
  }

  return { goalList, situation, questions, sequence, goalCard, esc };
});