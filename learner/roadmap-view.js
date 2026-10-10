/* Independence Roadmap: a capability map built from evidence, not a score.
 *
 * Pure rendering. All derivation lives in Roadmap (roadmap.js), which reads the
 * deterministic engine. No business logic lives here.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoadmapView = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const TONE_ICON = { done: '✓', pending: '◔', warn: '◑', stop: '!', know: 'i', idle: '·' };

  // A single capability chip — the atomic unit of the map.
  function chip(c) {
    const title = c.blocked ? 'Blocked until: ' + c.blocked_titles.join(', ') : c.label;
    return '<span class="cap cap--' + esc(c.tone) + (c.blocked ? ' cap--locked' : '') + '" title="' + esc(title) + '">' +
      '<span class="cap__dot" aria-hidden="true">' + TONE_ICON[c.tone] + '</span>' +
      esc(c.stage.label) +
      '</span>';
  }

  function capabilityRow(c) {
    // error_tags arrive as ids (e.g. 'assumes-missing-information'). Show the
    // learner-facing label when we have one; otherwise de-slug it so a raw
    // machine id is never shown as-is.
    const errs = (c.error_tags || [])
      .map(t => (c.error_labels && c.error_labels[t]) || t.replace(/-/g, ' '));
    return '<li class="capcard">' +
      '<div class="capcard__head">' + chip(c) +
      '<h4>' + esc(c.title.replace(/ · (foundation|independent|adaptation)/, '')) + '</h4></div>' +
      '<p class="capcard__detail">' + esc(c.detail) + '</p>' +
      (errs.length ? '<p class="capcard__work">Work on: ' + esc(errs.join(', ')) + '</p>' : '') +
      (c.blocked ? '<p class="capcard__blocked">Needs first: ' + esc(c.blocked_titles.join(', ')) + '</p>' : '') +
      (c.next_review ? '<p class="capcard__due">' + (c.next_review <= (c.today || '9999-12-31') ? 'Check due ' + esc(c.next_review) : 'Next check ' + esc(c.next_review)) + '</p>' : '') +
      (c.recent_improvement ? '<p class="capcard__up">Improved on your last attempt</p>' : '') +
      '</li>';
  }

  /* A domain summary row. The capability list is deferred until the user opens
   * the domain, so the roadmap costs ~12 collapsed rows on first paint instead
   * of ~92 capability cards. See roadmap.js note on the lazy reveal. */
  function domainCard(d) {
    const bar = '<div class="bar" role="img" aria-label="' + d.counts.demonstrated + ' of ' + d.counts.total + ' independent capabilities demonstrated">' +
      '<span class="bar__fill" style="width:' + d.pct + '%"></span></div>';
    // Written evidence can be complete while an observed check is still
    // pending. Name it on the card so the learner knows the one remaining
    // step — and why the domain is not yet marked complete.
    const pending = (d.practical_pending || []).map(p =>
      '<p class="domain__pending">Needs an observed check: ' + esc(p.title) + '</p>').join('');
    return '<details class="domain"' + (d.complete ? ' data-complete="1"' : '') + ' data-domain="' + esc(d.id) + '">' +
      '<summary>' +
      '<span class="domain__title">' + esc(d.title) + '</span>' +
      '<span class="domain__count">' + d.counts.demonstrated + '/' + d.counts.total + '</span>' +
      bar +
      '</summary>' +
      pending +
      '<div class="domain__body" data-body="' + esc(d.id) + '">' +
      '<p class="muted">' + d.counts.demonstrated + ' shown independently · ' + d.counts.assisted + ' with help · ' + d.counts.needs_work + ' need practice' +
      (d.blocked_count ? ' · ' + d.blocked_count + ' waiting on another skill' : '') + '</p>' +
      '<p class="muted domain__loading">Open to see every skill in this area.</p>' +
      '<p><a href="' + esc(d.path) + '">Read the ' + esc(d.title.toLowerCase()) + ' guide</a></p>' +
      '</div></details>';
  }

  /* Rendered on demand when a domain is opened. */
  function domainBody(d) {
    // Repeat the pending-observation line inside the expanded body: the
    // collapsed card may have been overlooked, and the expanded view is
    // where the learner decides what to do next.
    const pending = (d.practical_pending || []).map(p =>
      '<p class="domain__pending">Needs an observed check: ' + esc(p.title) + ' — arrange it with an assessor. Written answers alone cannot meet this gate.</p>').join('');
    return '<p class="muted">' + d.counts.demonstrated + ' shown independently · ' + d.counts.assisted + ' with help · ' + d.counts.needs_work + ' need practice' +
      (d.blocked_count ? ' · ' + d.blocked_count + ' waiting on another skill' : '') + '</p>' +
      pending +
      '<ul class="caplist">' + d.capabilities.map(capabilityRow).join('') + '</ul>' +
      '<p><a href="' + esc(d.path) + '">Read the ' + esc(d.title.toLowerCase()) + ' guide</a></p>';
  }

  function nextPanel(n) {
    if (!n || n.kind === 'error') return '';
    return '<section class="card next" aria-labelledby="next-heading">' +
      '<p class="eyebrow">YOUR NEXT STEP</p>' +
      '<h2 id="next-heading">' + esc(n.heading) + '</h2>' +
      '<p>' + esc(n.why) + '</p>' +
      (n.title ? '<h3>' + esc(n.title) + '</h3>' +
        (n.estimated_time_minutes ? '<p class="time">About ' + n.estimated_time_minutes + ' minutes</p>' : '') : '') +
      (n.reason && n.reason.length ? '<ul class="reasons">' + n.reason.slice(0, 4).map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>' : '') +
      '<div class="actions">' +
      (n.item_id ? '<button type="button" data-task="' + esc(n.item_id) + '">' + (n.kind === 'retention' ? 'Start the later check' : 'Start this task') + '</button>' : '') +
      (n.learn_path ? '<button type="button" class="secondary" data-learn="' + esc(n.learn_path) + '">Learn the skill first</button>' : '') +
      '</div>' +
      '</section>';
  }

  function milestoneRow(m) {
    const progressHtml = !m.earned && m.progress_fraction > 0
      ? '<div class="ms__progress"><div class="ms__bar" style="width:' + Math.round(m.progress_fraction * 100) + '%"></div></div>'
      : '';
    return '<li class="ms ms--' + (m.earned ? 'earned' : m.near ? 'near' : 'todo') + '">' +
      '<span class="ms__mark" aria-hidden="true">' + (m.earned ? '★' : '☆') + '</span>' +
      '<div><h4>' + esc(m.title) + '</h4>' +
      '<p>' + esc(m.description) + '</p>' +
      progressHtml +
      '<p class="muted">' + (m.earned ? 'Shown by your own evidence' : esc(m.progress)) + '</p></div>' +
      '</li>';
  }

  function milestonesPanel(rm) {
    if (!rm.milestones.length) return '';
    const earned = rm.milestones.filter(m => m.earned);
    const rest = rm.milestones.filter(m => !m.earned);
    return '<section class="card" aria-labelledby="ms-heading">' +
      '<p class="eyebrow">WHAT YOU CAN NOW DO</p>' +
      '<h2 id="ms-heading">Milestones</h2>' +
      '<p>' + earned.length + ' of ' + rm.total_milestones + ' earned. Each one is backed by your own demonstration, not a score.</p>' +
      (earned.length ? '<ul class="mslist">' + earned.map(milestoneRow).join('') + '</ul>' :
        '<p class="empty">Nothing earned yet. Milestones appear the moment a real demonstration backs them.</p>') +
      (rest.length ? '<details><summary>Still to earn (' + rest.length + ')</summary><ul class="mslist">' + rest.map(milestoneRow).join('') + '</ul></details>' : '') +
      '</section>';
  }

  function blockedPanel(rm) {
    const b = rm.blocked.filter(c => c.mode !== 'knowledge');
    if (!b.length) return '';
    return '<details class="card"><summary>Waiting on another skill (' + b.length + ')</summary>' +
      '<p class="muted">These are strong, but each one is sequenced behind a skill that is not demonstrated yet. Show the first skill and this one unlocks.</p>' +
      '<ul class="caplist">' + b.slice(0, 12).map(capabilityRow).join('') + '</ul>' +
      (b.length > 12 ? '<p class="muted">Showing the first 12 of ' + b.length + '.</p>' : '') + '</details>';
  }

  function legend() {
    return '<div class="legend">' +
      ['done|Shown independently', 'pending|Done, later check scheduled', 'warn|Done with help', 'stop|Needs practice', 'know|Understood (knowledge only)'].map(x => {
        const [tone, label] = x.split('|');
        return '<span class="legend__item"><span class="cap cap--' + tone + '"><span class="cap__dot" aria-hidden="true">' + TONE_ICON[tone] + '</span>' + label.split(' ')[0] + '</span> ' + esc(label) + '</span>';
      }).join('') +
      '</div>';
  }

  function materialWarningsPanel(rm) {
    if (!rm.material_warnings || !rm.material_warnings.length) return '';
    return '<section class="card ms ms--warn" aria-labelledby="mat-heading">' +
      '<p class="eyebrow">MATERIAL LIMIT</p>' +
      '<h2 id="mat-heading">Watch your fresh cases</h2>' +
      '<p>Some skill areas have only a few unseen cases left before you will need new material prepared by an assessor.</p>' +
      rm.material_warnings.map(w =>
        '<div class="ms__warn"><strong>' + esc(w.family.replace('.', ' ')) + '</strong> — ' +
        (w.warning === 'exhausted'
          ? '<span class="stop">No unseen cases left (' + w.seen + ' of ' + w.total + ' used). This area is blocked for fresh work.</span>'
          : '<span class="warn">Only ' + w.remaining + ' unseen case' + (w.remaining > 1 ? 's' : '') + ' left (' + w.seen + ' of ' + w.total + ' used). Use it wisely before scheduling a reassessment.</span>') +
        '</div>'
      ).join('') +
      '</section>';
  }

  /* Top-level roadmap render. Returns HTML; the app sets innerHTML. */
  function render(rm) {
    const shown = rm.domains.filter(d => d.counts.demonstrated > 0 || d.counts.assisted > 0 || d.counts.needs_work > 0 || d.counts.not_started > 0);
    return '<div class="roadmap-intro">' +
      '<p>Everything below comes from evidence you recorded. Nothing here is a score, and there is no overall grade.</p>' + legend() +
      '</div>' +
      materialWarningsPanel(rm) +
      nextPanel(rm.next) +
      '<section aria-labelledby="map-heading"><p class="eyebrow">YOUR CAPABILITY MAP</p><h2 id="map-heading">What you can already do</h2>' +
      '<p class="intro">Each area shows what you have shown independently, what you have done with help, and what still needs practice. Open an area to see every skill.</p>' +
      '<div class="domains">' + shown.map(domainCard).join('') + '</div>' +
      '</section>' +
      milestonesPanel(rm) +
      blockedPanel(rm);
  }

  return { render, nextPanel, milestoneRow, chip, capabilityRow, domainCard, domainBody, legend, materialWarningsPanel };
});