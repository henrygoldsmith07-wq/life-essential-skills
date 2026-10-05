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

  function capState(summary, comp) {
    if (summary.status === 'demonstrated') {
      if (comp.mode === 'knowledge') return 'understood';
      if (summary.retention_status === 'retained') return 'retained';
      return summary.retention_checks ? 'retained-pending' : 'demonstrated';
    }
    if (summary.status === 'assisted') return 'assisted';
    if (summary.status === 'not-yet') return 'needs-work';
    return 'not-started';
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

  function capability(state, data, comp, today, blockedMap) {
    const s = summaryOf(state, data, comp.id);
    const blocked = blockedMap.get(comp.id);
    return {
      id: comp.id,
      title: comp.title,
      mode: comp.mode,
      stage: STAGE[comp.mode] || STAGE.independent,
      capability: capState(s, comp),
      label: (CAP_LABEL[capState(s, comp)] || CAP_LABEL['not-started']).label,
      tone: (CAP_LABEL[capState(s, comp)] || CAP_LABEL['not-started']).tone,
      detail: (CAP_LABEL[capState(s, comp)] || CAP_LABEL['not-started']).detail,
      status: s.status,
      error_tags: s.error_tags,
      evidence_level: s.evidence_level,
      review_basis: s.review_basis,
      next_review: s.next_review,
      retention_status: s.retention_status,
      retention_checks: s.retention_checks,
      retention_passed: s.retention_passed,
      recent_improvement: s.recent_improvement,
      attempts: s.attempts,
      blocked: !!blocked,
      blocked_by: blocked ? blocked.missing : [],
      blocked_titles: blocked ? blocked.missing.map(m => title(data, m)) : [],
      learn_path: comp.learn_path
    };
  }

  function title(data, cid) {
    const c = data.skills.competencies.find(x => x.id === cid);
    return c ? c.title : cid;
  }

  /* Read a summary defensively. Content data and the engine must never be able
   * to crash the whole roadmap: an unknown or mismatched competency id is
   * reported as absent, never as evidence, and never as an error. */
  function summaryOf(state, data, cid) {
    try { return E.summary(state, cid, data); }
    catch (e) { return { status: 'unknown', attempts: 0, error_tags: [], retention_status: 'unchecked', retention_checks: 0, retention_passed: 0, recent_improvement: false, next_review: null, evidence_level: null, last_demonstrated: null }; }
  }

  /* Build the whole capability roadmap.
   * Returns domains with capabilities, a suggested next step, milestones and a
   * prioritised list of what to do next. Everything is derived from state. */
  function roadmap(state, data, today) {
    const byId = new Map(data.skills.competencies.map(c => [c.id, c]));
    // Which competencies are currently blocked, and by what.
    const blockedMap = new Map();
    for (const c of data.skills.competencies) {
      const missing = c.prerequisites.filter(p => summaryOf(state, data, p).status !== 'demonstrated');
      if (missing.length) blockedMap.set(c.id, { missing });
    }

    const domains = data.index.domains.map(d => {
      const comps = data.skills.competencies.filter(c => c.domain === d.id);
      const caps = comps.map(c => capability(state, data, c, today, blockedMap));
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
    const milestones = (data.goals?.milestones || []).map(m => milestone(state, data, m));
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

  function milestone(state, data, m) {
    const need = m.requires || [];
    const any = m.requires_any || [];
    const practical = m.requires_practical || [];
    const statuses = need.map(cid => ({ cid, s: summaryOf(state, data, cid) }));
    const anyDone = any.map(cid => ({ cid, s: summaryOf(state, data, cid) }));
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
      requires_detail: need.map(cid => ({ cid, title: title(data, cid), status: summaryOf(state, data, cid).status })),
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
    const focus = new Set();
    (goal.questions || []).forEach(q => {
      const chosen = (answers || {})[q.id];
      const opt = (q.options || []).find(o => o.value === chosen);
      if (opt) opt.focus.forEach(f => focus.add(f));
    });
    // Always keep the goal's own ordered backbone so the roadmap has a spine.
    goal.focus_competencies.forEach(c => focus.add(c));
    return {
      goal_id: goal.id,
      title: goal.title,
      pathway: goal.pathway,
      capstone: goal.capstone,
      goal_competencies: [...focus],
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
    return {
      generated: today,
      locality: state.locality,
      pathway: pathway ? pathway.title : state.pathway,
      demonstrated, developing, not_started: notStarted,
      milestones_earned: rm.milestones.filter(m => m.earned),
      milestones_in_progress: rm.milestones.filter(m => !m.earned),
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