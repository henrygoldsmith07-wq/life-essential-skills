/* Life-transition simulation: a staged, evolving situation.
 *
 * IMPORTANT EVIDENCE CONTRACT (this view cannot break it):
 *  - The simulation never derives, scores or records anything.
 *  - It reveals context progressively, then hands control to the ordinary
 *    assessment flow: the same capstone item, the same per-subskill scoring
 *    rows, the same recordAttempt call, the same derivation.
 *  - Nothing here sets an outcome, and nothing here can turn an assisted
 *    performance into independent evidence.
 * Pure rendering + local UI state only.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SimulationView = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function intro(sim, capstoneItem) {
    return '<div class="card sim">' +
      '<p class="eyebrow">LIFE-TRANSITION SIMULATION</p>' +
      '<h2 id="task-title">' + esc(sim.title) + '</h2>' +
      '<p class="sim__promise">' + esc(sim.promise) + '</p>' +
      '<p class="sim__framing">' + esc(sim.framing) + '</p>' +
      '<p class="sim__setting">' + esc(sim.setting) + '</p>' +
      '<p class="time">About ' + (capstoneItem ? capstoneItem.estimated_time_minutes : 60) + ' minutes, in three parts</p>' +
      '<div class="notice notice--info"><p><strong>How this works.</strong> You will work through the situation in three parts. Each part adds something new — including a change that makes the situation harder. Take notes as you go; write your final answer at the end, as one piece of work.</p>' +
      '<p>Your progress is judged against the same criteria as any other task, and each skill you demonstrate is recorded against that skill on your roadmap.</p></div>' +
      '<div class="actions"><button id="sim-begin">Begin the simulation</button>' +
      '<button class="secondary" id="close-task">Not now</button></div>' +
      '</div>';
  }

  function stage(sim, n) {
    const s = sim.stages[n];
    if (!s) return '';
    const idx = n + 1;
    const total = sim.stages.length;
    return '<div class="card sim">' +
      '<p class="eyebrow">PART ' + idx + ' OF ' + total + '</p>' +
      '<h2 id="task-title">' + esc(s.heading) + '</h2>' +
      '<p class="sim__beat">' + esc(s.beat) + '</p>' +
      '<ol class="sim__reveal">' + s.reveal.map(r => '<li>' + esc(r) + '</li>').join('') + '</ol>' +
      '<div class="sim__ask"><h3>What to do now</h3><p>' + esc(s.ask) + '</p></div>' +
      '<p class="sim__trap"><span class="visually-hidden">Watch for: </span>' + esc(s.trap) + '</p>' +
      '<div class="sim__progress" aria-hidden="true">' + sim.stages.map((_, k) => '<span class="dot' + (k <= n ? ' dot--on' : '') + '"></span>').join('') + '</div>' +
      '<div class="actions">' +
      (n > 0 ? '<button class="secondary" id="sim-back">Back</button>' : '') +
      '<button id="sim-next">' + (n === total - 1 ? 'Finish and write your answer' : 'Continue') + '</button>' +
      '<button class="secondary" id="close-task">Close</button>' +
      '</div></div>';
  }

  function writeUp(sim, capstoneItem, materialsHtml) {
    return '<div class="card sim">' +
      '<p class="eyebrow">YOUR ANSWER</p>' +
      '<h2 id="task-title">' + esc(sim.title) + '</h2>' +
      (sim.records && sim.records.length
        ? '<div class="sim__records"><h3>Also part of this situation</h3><ul>' + sim.records.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></div>'
        : '') +
      materialsHtml +
      '<p class="task-text">' + esc(capstoneItem.task) + '</p>' +
      '<details><summary>Safety and access</summary><ul>' + capstoneItem.safety_constraints.map(s => '<li>' + esc(s) + '</li>').join('') + '</ul><p>Written performance cannot prove physical competence. Access adjustments do not reduce the outcome.</p></details>' +
      '<label for="response">Write the whole thing as one response</label>' +
      '<textarea id="response" placeholder="Work through all three parts in a single response, or use paper or speech. This answer is never saved."></textarea>' +
      '<label><input type="checkbox" id="paper-attempt"> I completed a response on paper or by speaking.</label>' +
      '<div class="actions"><button id="finish-attempt">Finish attempt &amp; check feedback</button>' +
      '<button class="secondary" id="close-task">Close</button></div>' +
      '<div id="feedback-area" hidden></div>' +
      '</div>';
  }

  function debrief(sim) {
    return '<div class="sim__debrief"><h3>What this was about</h3><p>' + esc(sim.debrief) + '</p></div>';
  }

  return { intro, stage, writeUp, debrief, esc };
});