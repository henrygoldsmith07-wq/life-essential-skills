/* Product derivation layer: capability roadmap, milestones, onboarding and profile.
 *
 * This module NEVER derives or changes an outcome. Every status it reports comes
 * from the deterministic engine (LifeSkills.summary / progress / recommend), so
 * the evidence model stays the single source of truth. All it adds is a
 * presentation-shaped, inspectable projection of that evidence, plus goal-based
 * onboarding that only ever *selects focus* (pathway + goal competencies).
 *
 * Dependency-free, no network, no storage. Shares the same code in Node tests
 * and the browser, like engine.js and evidence.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.Roadmap = factory(root.LifeSkills);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  // Learner-facing plain language for the four evidence stages. Deliberately
  // avoids assessment jargon: these words are what a person would say.
  const STAGE = {
    'knowledge':    { label: 'Understand',        plain: 'You can explain the steps and why they matter.' },
    'independent':  { label: 'Do it yourself',    plain: 'You have shown you can do this unaided in a fresh situation.' },
    'adaptation':   { label: 'Adapt',             plain: 'You have shown you can keep working when the situation changes.' },
    'diagnostic':   { label: 'Getting started',   plain: 'A first look, so we know what to focus on.' },
    'transfer':     { label: 'Fresh situation',   plain: 'A new situation you have not seen before.' },
    'practice':     { label: 'Practise with help',plain: 'Useful practice, but not proof you could do it alone.' },
    'retention':    { label: 'Later check',       plain: 'A fresh check, days later, to see if it stuck.' }
  };

  /* Classify a capability from the engine summary.
   *
   * "retained" is only claimed when the MOST RECENT successful evidence was a
   * retention check. If the learner has since done more fresh transfer, the
   * older retention pass no longer describes the present state, so we fall back
   * to "demonstrated" (still true) rather than implying a currency we can't
   * evidence. This is deliberately conservative: it can under-claim ("Can do
   * this" instead of "Can still do this"), never over-claim. */
  function capState(summary, comp, state, today) {
    if (summary.status === 'demonstrated') {
      if (comp.mode === 'knowledge') return 'understood';
      // "Can still do this" only when the most recent attempt WAS a retention check.
      if (summary.retention_status === 'retained' && lastIsRetention(state, summary)) return 'retained';
      // Demonstrated, but a later check is already scheduled.
      return summary.next_review ? 'retained-pending' : 'demonstrated';
    }
    if (summary.status === 'assisted') return 'assisted';
    if (summary.status === 'not-yet') return 'needs-work';
    return 'not-started';
  }

  /* True only when the competency's latest recorded attempt was itself a
   * retention check. Compares against summary.last_attempt so it works for
   * assessor-reviewed and migrated records too. */
  function lastIsRetention(state, summary) {
    if (!summary.last_attempt) return false;
    const mine = state.records.filter(r => r.competency_id === summary.competency_id);
    const last = mine.at(-1);
    return !!last && last.phase === 'retention' && last.date === summary.last_attempt;
  }

  // The five capability states the roadmap exposes. No overall "life score".
  const CAP_LABEL = {
    'demonstrated':        { label: 'Can do this',        tone: 'done',   detail: 'Shown independently in fresh material.' },
    'retained':            { label: 'Can still do this', tone: 'done',   detail: 'Shown independently and passed a later fresh check.' },
    'retained-pending':    { label: 'Done — check later', tone: 'pending',detail: 'Shown independently; a later check is scheduled.' },
    'assisted':            { label: 'Done with help',    tone: 'warn',   detail: 'Completed, but with solving help or familiar material.' },
    'needs-work':          { label: 'Needs practice',     tone: 'stop',   detail: 'An essential criterion was not met.' },
    'understood':          { label: 'Understood',        tone: 'know',   detail: 'Knowledge check met. Written knowledge is not performance.' },
    'not-started':         { label: 'Not started',       tone: 'idle',   detail: 'No evidence recorded yet.' }
  };

  function capability(state, data, comp, today, blockedMap, errLabels, cache) {
    const s = summaryOf(state, data, comp.id, cache);    const blocked = blockedMap.get(comp.id);
    const cap = capState(s, comp, state, today);
    const label = CAP_LABEL[cap] || CAP_LABEL['not-started'];
    return {
      id: comp.id,
      title: comp.title,
      mode: comp.mode,
      stage: STAGE[comp.mode] || STAGE.independent,
      capability: cap,
      label: label.label,
      tone: label.tone,
      detail: label.detail,
      status: s.status,
      error_tags: s.error_tags,
      error_labels: errLabels,
      evidence_level: s.evidence_level,
      review_basis: s.review_basis,
      next_review: s.next_review,
      retention_status: s.retention_status,
      retention_checks: s.retention_checks,
      retention_passed: s.retention_passed,
      recent_improvement: s.recent_improvement,
      attempts: s.attempts,
      today: today,
      blocked: !!blocked,
      blocked_by: blocked ? blocked.missing : [],
      blocked_titles: blocked ? blocked.missing.map(m => title(data, m)) : [],
      learn_path: comp.learn_path
    };
  }

  function title(data, cid) {
    if (!title.cache || title.data !== data) { title.cache = new Map(data.skills.competencies.map(c => [c.id, c.title])); title.data = data; }
    return title.cache.get(cid) || cid;
  }

  /* Learner-facing wording for an error tag id, e.g.
   * 'assumes-missing-information' -> 'Name missing facts before deciding'.
   * Showing the raw id to a learner would be meaningless, so this is applied at
   * the derivation layer rather than patched per view. */
  function errorLabelMap(data) {
    const map = {};
    for (const t of (data.skills.error_tags || [])) if (t && t.id) map[t.id] = t.label || t.id;
    return map;
  }

  /* Read a summary defensively. Content data and the engine must never be able
   * to crash the whole roadmap: an unknown or mismatched competency id is
   * reported as absent, never as evidence, and never as an error.
   *
   * Memoised per render, and keyed on the state object itself rather than a
   * caller-supplied key. Every roadmap() call computes an epoch and installs a
   * fresh cache, so a cache can never outlive the render that created it and
   * cannot go stale if a caller mutates a state object in place. */
  function summaryOf(state, data, cid, cache) {
    const memo = cache || new Map();
    if (memo.has(cid)) return memo.get(cid);
    let out;
    try { out = E.summary(state, cid, data); }
    catch (e) { out = { status: 'unknown', attempts: 0, error_tags: [], retention_status: 'unchecked', retention_checks: 0, retention_passed: 0, recent_improvement: false, next_review: null, evidence_level: null, last_demonstrated: null, competency_id: cid, last_attempt: null }; }
    memo.set(cid, out);
    return out;
  }

  /* Build the whole capability roadmap.
   * Returns domains with capabilities, a suggested next step, milestones and a
   * prioritised list of what to do next. Everything is derived from state. */
  function roadmap(state, data, today) {
    // One memo per render, shared by every summary lookup below.
    const cache = new Map();
    // Learner-facing wording for error tags, resolved once per render.
    const errLabels = errorLabelMap(data);
    // Which competencies are currently blocked, and by what.
    const blockedMap = new Map();
    for (const c of data.skills.competencies) {
      const missing = c.prerequisites.filter(p => summaryOf(state, data, p, cache).status !== 'demonstrated');
      if (missing.length) blockedMap.set(c.id, { missing });
    }

    const domains = data.index.domains.map(d => {
      const comps = data.skills.competencies.filter(c => c.domain === d.id);
      const caps = comps.map(c => capability(state, data, c, today, blockedMap, errLabels, cache));
      const independent = caps.filter(c => c.mode === 'independent');
      const counts = {
        demonstrated: independent.filter(c => c.status === 'demonstrated').length,
        assisted: independent.filter(c => c.status === 'assisted').length,
        needs_work: independent.filter(c => c.status === 'not-yet').length,
        not_started: independent.filter(c => c.status === 'unassessed').length,
        total: independent.length
      };
      const pct = counts.total ? Math.round((counts.demonstrated / counts.total) * 100) : 0;
      return {
        id: d.id, title: d.title, path: d.path,
        capabilities: caps, counts, pct,
        complete: counts.total > 0 && counts.demonstrated === counts.total,
        blocked_count: caps.filter(c => c.blocked).length
      };
    });

    const all = domains.flatMap(d => d.capabilities);
    const milestones = (data.goals?.milestones || []).map(m => milestone(state, data, m, cache));
    const rec = safeRecommend(state, data, today);

    return {
      domains,
      capabilities: all,
      milestones,
      earned: milestones.filter(m => m.earned).length,
      total_milestones: milestones.length,
      next: nextStep(rec, state, data, today, blockedMap),
      blocked: all.filter(c => c.blocked),
      retention_due: all.filter(c => c.next_review && c.next_review <= today),
      retention_upcoming: all.filter(c => c.next_review && c.next_review > today)
        .sort((a, b) => a.next_review.localeCompare(b.next_review)),
      recently_improved: all.filter(c => c.recent_improvement)
    };
  }

  function milestone(state, data, m, cache) {
    const memo = cache || new Map();
    const need = m.requires || [];
    const any = m.requires_any || [];
    const practical = m.requires_practical || [];
    const statuses = need.map(cid => ({ cid, s: summaryOf(state, data, cid, memo) }));
    const anyDone = any.map(cid => ({ cid, s: summaryOf(state, data, cid, memo) }));
    const practicalDone = practical.map(kind => ({
      kind,
      s: state.observations.filter(o => o.kind === kind).at(-1)
    }));
    const needMet = statuses.every(x => x.s.status === 'demonstrated');
    const anyMet = any.length === 0 || anyDone.some(x => x.s.status === 'demonstrated');
    const practicalMet = practicalDone.every(x => x.s?.outcome === 'demonstrated');
    const earned = needMet && anyMet && practicalMet;
    const progressParts = [];
    if (need.length) progressParts.push(statuses.filter(x => x.s.status === 'demonstrated').length + '/' + need.length);
    if (any.length) progressParts.push((anyDone.some(x => x.s.status === 'demonstrated') ? 1 : 0) + '/1+ adapt');
    if (practical.length) progressParts.push(practicalDone.filter(x => x.s?.outcome === 'demonstrated').length + '/' + practical.length + ' observed');
    return {
      ...m,
      earned,
      requires_detail: need.map((cid, i) => ({ cid, title: title(data, cid), status: statuses[i].s.status })),
      progress: progressParts.join(' · '),
      near: !earned && needMet && anyMet && practical.length === 0
    };
  }

  function safeRecommend(state, data, today) {
    try { return E.recommend(state, data, today); }
    catch (e) { return { kind: 'error', reason: [e.message], blocked: [] }; }
  }

  // Turn the engine's single recommendation into the "highest-value next" panel.
  function nextStep(rec, state, data, today, blockedMap) {
    const kindText = {
      retention: { heading: 'A later check is due', why: 'You have shown this before. This checks it stuck, using material you have not seen.' },
      transfer:   { heading: 'Show it in a fresh situation', why: 'This is new material. Doing it without prompts is what counts as evidence.' },
      diagnostic: { heading: 'Get your first look', why: 'A short check so we know what to focus on. This does not award performance evidence.' },
      'complete': { heading: 'Everything in scope has evidence', why: 'Review the dates below, or pick something new to work on.' },
      'fresh-materials-needed': { heading: 'Fresh materials needed', why: 'Every unseen variant in this skill area has been used. An assessor must prepare new material — repeating a known answer cannot prove transfer.' },
      'locality-needed': { heading: 'Choose the right locality', why: 'This task depends on nation-specific rules or services. Do not substitute another nation’s guidance.' },
      error: { heading: 'Roadmap unavailable', why: 'Stored evidence needs repair.' }
    }[rec.kind] || { heading: 'Your next step', why: '' };
    return {
      kind: rec.kind,
      heading: kindText.heading,
      why: kindText.why,
      reason: rec.reason || [],
      item_id: rec.item ? rec.item.id : null,
      title: rec.item ? rec.item.title : null,
      estimated_time_minutes: rec.estimated_time_minutes || null,
      competency_id: rec.competency ? rec.competency.id : null,
      competency_title: rec.competency ? rec.competency.title : null,
      learn_path: rec.learn_path || null,
      blocked_count: (rec.blocked || []).length
    };
  }

  /* Goal-based onboarding. The short diagnostic picks a small set of
   * focus competencies by matching the learner's answers to goal questions.
   * It sets pathway + goal_competencies through the same validated state shape
   * the app already uses, so it cannot create invalid evidence. */
  function onboarding(data, goalId, answers) {
    const goal = (data.goals?.goals || []).find(g => g.id === goalId);
    if (!goal) return null;
    // The goal's own backbone comes first and keeps its declared order, so the
    // sequence is deterministic and readable. Competencies the learner's answers
    // singled out are then appended (deduplicated), because they refine the
    // focus rather than replace it. Note: the engine treats goal_competencies as
    // a membership set, so this ordering is for clarity and future-proofing, not
    // because the recommender currently reads position.
    const focus = [];
    const seenCid = new Set();
    const add = cid => { if (!seenCid.has(cid)) { seenCid.add(cid); focus.push(cid); } };
    goal.focus_competencies.forEach(add);
    (goal.questions || []).forEach(q => {
      const chosen = (answers || {})[q.id];
      const opt = (q.options || []).find(o => o.value === chosen);
      if (opt) opt.focus.forEach(add);
    });
    return {
      goal_id: goal.id,
      title: goal.title,
      pathway: goal.pathway,
      capstone: goal.capstone,
      goal_competencies: focus,
      domains: goal.domains,
      sequence: goal.sequence
    };
  }

  /* Human-readable Independence Profile. A progress report, not a qualification. */
  function profile(state, data, today) {
    const rm = roadmap(state, data, today);
    const demonstrated = rm.capabilities.filter(c => c.status === 'demonstrated' && c.mode !== 'knowledge');
    const developing = rm.capabilities.filter(c => c.mode !== 'knowledge' && ['assisted', 'not-yet'].includes(c.status));
    const notStarted = rm.capabilities.filter(c => c.mode !== 'knowledge' && c.status === 'unassessed');
    const pathway = data.index.pathways.find(p => p.id === state.pathway);
    const practical = (data.practical?.rubrics || []).map(r => {
      const last = state.observations.filter(o => o.kind === r.id).at(-1);
      return { title: r.title, kind: r.id, outcome: last ? last.outcome : 'unobserved', date: last ? last.date : null };
    });

    // A milestone counts as "in progress" only once the learner has actually
    // engaged with something it depends on. Being merely blocked on a
    // prerequisite does not count: every milestone is blocked for a new
    // learner, so counting that would claim all of them are under way.
    const touched = new Set();
    for (const cid of [...demonstrated.map(c => c.id), ...developing.map(c => c.id)]) touched.add(cid);
    for (const o of state.observations) if (o.outcome) touched.add('obs:' + o.kind);
    const engaged = m => (m.requires || []).some(cid => touched.has(cid))
      || (m.requires_any || []).some(cid => touched.has(cid))
      || (m.requires_practical || []).some(k => touched.has('obs:' + k));

    return {
      generated: today,
      locality: state.locality,
      pathway: pathway ? pathway.title : state.pathway,
      demonstrated, developing, not_started: notStarted,
      milestones_earned: rm.milestones.filter(m => m.earned),
      milestones_in_progress: rm.milestones.filter(m => !m.earned && engaged(m)),
      milestones_not_started: rm.milestones.filter(m => !m.earned && !engaged(m)),
      retention_due: rm.retention_due, retention_upcoming: rm.retention_upcoming,
      recent_improvements: rm.recently_improved,
      next: rm.next, practical,
      totals: {
        demonstrated: demonstrated.length,
        developing: developing.length,
        total_independent: rm.capabilities.filter(c => c.mode === 'independent').length,
        knowledge: rm.capabilities.filter(c => c.mode === 'knowledge' && c.status === 'demonstrated').length
      }
    };
  }

  return { roadmap, onboarding, profile, milestone, STAGE, CAP_LABEL };
});