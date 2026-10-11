/* "My Independence Profile": a human-readable progress report, rendered for
 * on-screen reading and printable to PDF. Explicitly not a qualification.
 * Pure rendering from Roadmap.profile() — derives nothing itself.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ProfileView = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function line(t) { return '<h3>' + esc(t) + '</h3>'; }

  function capList(caps, empty) {
    if (!caps.length) return '<p class="empty">' + esc(empty) + '</p>';
    return '<ul class="profilelist">' + caps.map(c =>
      '<li><strong>' + esc(c.title.replace(/ · (foundation|independent|adaptation)/, '')) + '</strong> — ' + esc(c.label) +
      (c.evidence_level ? ' (' + esc(c.evidence_level.replace('-', ' ')) + ')' : '') +
      // error_tags are ids; the roadmap derivation attaches learner-facing labels.
      (c.error_tags.length ? '<br><span class="muted">Focus on: ' + esc(c.error_tags.map(t => (c.error_labels && c.error_labels[t]) || t.replace(/-/g, ' ')).join(', ')) + '</span>' : '') + '</li>').join('') + '</ul>';
  }

  function render(p, localityLabel) {
    const t = p.totals;
    return '<div class="profile">' +
      '<p class="eyebrow">MY INDEPENDENCE PROFILE</p>' +
      '<h2 id="profile-title">' + esc(p.pathway) + '</h2>' +
      '<p class="muted">Generated ' + esc(p.generated) + ' · ' + esc(localityLabel) + '</p>' +
      '<div class="notice notice--info"><p><strong>This is a learning record, not a qualification.</strong> Every line below comes from a task you completed in this browser. Most are self-reviewed, which is a local judgement, not independent verification. It is not a certificate, a credit, or a professional assessment.</p></div>' +

      '<div class="metric-grid">' +
      '<div class="metric"><strong>' + t.demonstrated + '</strong><span>Shown independently</span></div>' +
      '<div class="metric"><strong>' + t.retention_passed + '</strong><span>Retention checks passed</span></div>' +
      '<div class="metric"><strong>' + t.retention_due + '</strong><span>Checks now due</span></div>' +
      '<div class="metric"><strong>' + t.developing + '</strong><span>Still developing</span></div>' +
      '<div class="metric"><strong>' + t.knowledge + '</strong><span>Knowledge checks met</span></div>' +
      '<div class="metric"><strong>' + t.total_independent + '</strong><span>Independent skills in the system</span></div>' +
      '</div>' +

      line('What I can already do independently') +
      capList(p.demonstrated, 'Nothing demonstrated yet. Your first task on the roadmap is the place to start.') +

      (p.recent_improvements.length
        ? line('Recently improved') + '<ul class="profilelist">' + p.recent_improvements.map(c => '<li>' + esc(c.title) + '</li>').join('') + '</ul>'
        : '') +

      line('Still developing') +
      capList(p.developing, 'Nothing in progress.') +

      line('Milestones earned') +
      (p.milestones_earned.length
        ? '<ul class="profilelist">' + p.milestones_earned.map(m => '<li><strong>' + esc(m.title) + '</strong> — ' + esc(m.description) + '</li>').join('') + '</ul>'
        : '<p class="empty">No milestones earned yet.</p>') +

      (p.milestones_in_progress.length
        ? line('Milestones under way') +
          '<ul class="profilelist">' + p.milestones_in_progress.map(m => '<li><strong>' + esc(m.title) + '</strong> — ' + esc(m.progress) + '</li>').join('') + '</ul>'
        : '') +

      (p.milestones_not_started && p.milestones_not_started.length
        ? line('Not started yet') +
          '<ul class="profilelist">' + p.milestones_not_started.map(m => '<li><strong>' + esc(m.title) + '</strong> — ' + esc(m.description) + '</li>').join('') + '</ul>' +
          '<p class="muted">These ' + p.milestones_not_started.length + ' milestone' + (p.milestones_not_started.length === 1 ? '' : 's') + ' will appear on your roadmap as you build the supporting skills.</p>'
        : '') +

      line('Practical, observed skills') +
      (p.practical.some(x => x.outcome === 'demonstrated')
        ? '<ul class="profilelist">' + p.practical.filter(x => x.outcome === 'demonstrated').map(x => '<li>' + esc(x.title) + ' (observed ' + esc(x.date) + ')</li>').join('') + '</ul>'
        : '<p class="empty">No observed practical checks yet. Written answers cannot prove a physical skill.</p>') +

      (p.practical_needed && p.practical_needed.length
        ? '<p class="notice notice--warn"><strong>' + p.practical_needed.length + ' domain gate' + (p.practical_needed.length > 1 ? 's remain' : ' remains') + ' to complete with an observed check.</strong> ' + p.practical_needed.map(d => '<strong>' + esc(d.domain) + '</strong>: ' + esc(d.pending.join(', '))).join('. ') + '.</p>'
        : '') +

      (p.material_warnings && p.material_warnings.length
        ? '<p class="notice notice--info"><strong>Watch your fresh cases.</strong> ' + p.material_warnings.map(w => esc(w.family.replace('.', ' ')) + ' has ' + (w.remaining === 0 ? 'no unseen cases left' : w.remaining + ' unseen case' + (w.remaining > 1 ? 's' : '') + ' left')).join('. ') + '.</p>'
        : '') +

      line('Later checks') +
      (p.retention_due.length
        ? '<ul class="profilelist">' + p.retention_due.map(c => '<li><strong>' + esc(c.title) + (c.domain_title ? ' <span class="muted">(' + esc(c.domain_title) + ')</span>' : '') + '</strong> — due ' + esc(c.next_review) + (c.item_id ? '<div class="actions" style="margin-top:6px"><button type="button" class="secondary" data-task="' + esc(c.item_id) + '">Start the later check</button></div>' : '<span class="muted">Ask an assessor for fresh material.</span>') + '</li>').join('') + '</ul>'
        : '<p>Nothing due.</p>') +
      (p.retention_upcoming.length
        ? '<p><strong>Scheduled:</strong></p><ul class="profilelist">' + p.retention_upcoming.slice(0, 6).map(c => '<li>' + esc(c.title) + (c.domain_title ? ' · <span class="muted">' + esc(c.domain_title) + '</span>' : '') + ' — ' + esc(c.next_review) + '</li>').join('') + '</ul>'
        : '') +

      line('Recommended next') +
       '<p><strong>' + esc(p.next.heading) + '</strong> — ' + esc(p.next.why) + '</p>' +
       (p.next.item_id
         ? '<div class="actions"><button type="button" data-task="' + esc(p.next.item_id) + '">' + esc(p.next.kind === 'retention' ? 'Start the later check' : 'Start this task') + '</button>' + (p.next.learn_path ? '<button type="button" class="secondary" data-learn="' + esc(p.next.learn_path) + '">Learn the skill first</button>' : '') + '</div>'
         : p.next.kind === 'complete'
         ? '<p class="muted">Every skill in your current focus is demonstrated. Browse the sections above for upcoming retention checks, or <a href="#pathways">choose a different pathway</a>.</p>'
         : '<p class="muted">Open the Today or Practice tab to find the right task, or choose another goal or locality.</p>') +

      '<p class="muted profile__foot">This report contains no personal identifiers, no written responses and no account details. It lives in this browser only unless you download it.</p>' +
      '</div>';
  }

  return { render };
});
