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
          '<p class="muted">' + p.milestones_not_started.length + ' further milestone' + (p.milestones_not_started.length === 1 ? '' : 's') + ' you have not begun. They are listed on your roadmap in the order they unlock.</p>'
        : '') +

      line('Practical, observed skills') +
      (p.practical.some(x => x.outcome === 'demonstrated')
        ? '<ul class="profilelist">' + p.practical.filter(x => x.outcome === 'demonstrated').map(x => '<li>' + esc(x.title) + ' (observed ' + esc(x.date) + ')</li>').join('') + '</ul>'
        : '<p class="empty">No observed practical checks yet. Written answers cannot prove a physical skill.</p>') +

      line('Later checks') +
      (p.retention_due.length
        ? '<p><strong>Due now:</strong> ' + esc(p.retention_due.map(c => c.title).slice(0, 4).join(', ')) + '</p>'
        : '<p>Nothing due.</p>') +
      (p.retention_upcoming.length
        ? '<p><strong>Scheduled:</strong></p><ul class="profilelist">' + p.retention_upcoming.slice(0, 6).map(c => '<li>' + esc(c.title) + ' — ' + esc(c.next_review) + '</li>').join('') + '</ul>'
        : '') +

      line('Recommended next') +
      '<p><strong>' + esc(p.next.heading) + '</strong> — ' + esc(p.next.why) + '</p>' +

      '<p class="muted profile__foot">This report contains no personal identifiers, no written responses and no account details. It lives in this browser only unless you download it.</p>' +
      '</div>';
  }

  return { render };
});