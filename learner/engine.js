/* One dependency-free rules engine for Node tests and the browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LifeSkills = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const statuses = ['demonstrated', 'assisted', 'not-yet'];
  const phases = ['diagnostic', 'practice', 'transfer', 'retention'];
  const nations = ['england', 'wales', 'scotland', 'northern-ireland'];
  const day = 86400000;
  function iso(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const n = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(+n) && n.toISOString().slice(0, 10) === value;
  }
  function addDays(date, days) { return new Date(+new Date(date + 'T00:00:00Z') + days * day).toISOString().slice(0, 10); }
  function elapsed(a, b) { return Math.round((+new Date(b + 'T00:00:00Z') - +new Date(a + 'T00:00:00Z')) / day); }
  function covers(scope, locality) {
    if (scope === 'global' || scope === locality) return true;
    if (scope === 'uk') return locality === 'uk' || nations.includes(locality);
    if (scope === 'great-britain') return ['england', 'wales', 'scotland', 'great-britain'].includes(locality);
    return false; // UK unspecified never assumes an individual nation.
  }
  function eligible(item, locality) { return item.jurisdictions.some(j => covers(j, locality)); }
  function emptyState(locality = 'uk', pathway = 'general') {
    return {schema_version: 1, locality, pathway, goal_competencies: [], records: [], observations: []};
  }
  function exactKeys(value, keys, label, errors) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(label + ': expected object'); return false; }
    if (Object.keys(value).some(k => !keys.includes(k)) || keys.some(k => !(k in value))) errors.push(label + ': unknown or missing fields');
    return true;
  }
  function validateState(state, data, today) {
    const errors = [];
    if (!exactKeys(state, ['schema_version','locality','pathway','goal_competencies','records','observations'], 'State', errors)) return errors;
    if (state.schema_version !== 1) errors.push('State version must be 1');
    if (!['uk','wales'].includes(state.locality)) errors.push('Choose supported UK or Wales locality');
    if (!data.index.pathways.some(p => p.id === state.pathway)) errors.push('Unknown pathway');
    const comps = new Map(data.skills.competencies.map(c => [c.id, c]));
    const items = new Map(data.bank.items.map(i => [i.id, i]));
    const tags = new Set(data.skills.error_tags.map(t => t.id));
    if (!Array.isArray(state.observations) || state.observations.length > 500) errors.push('Invalid practical observations');
    else state.observations.forEach((o,n) => {
      if (!exactKeys(o,['kind','date','outcome','reviewed_by'],'Observation '+n,errors)) return;
      if (!['observed-meal-preparation','observed-sample-restore','observed-account-protection'].includes(o.kind) || !iso(o.date) || (today && o.date>today) || !statuses.includes(o.outcome) || o.reviewed_by!=='assessor') errors.push('Invalid practical observation: assessor review required');
      if (n && o.date < state.observations[n-1]?.date) errors.push('Practical observations must be in date order');
    });
    if (!Array.isArray(state.goal_competencies) || new Set(state.goal_competencies).size !== state.goal_competencies.length || state.goal_competencies.some(c => !comps.has(c))) errors.push('Invalid goal competencies');
    if (!Array.isArray(state.records) || state.records.length > 5000) { errors.push('Invalid records'); return errors; }
    const seen = new Set();
    let previous = '';
    state.records.forEach((r, n) => {
      const label = 'Record ' + n;
      if (!exactKeys(r, ['id','competency_id','item_id','assessment_version','date','phase','outcome','help_used','access_supports','error_tags','criteria_met','reviewed_by','solution_seen'], label, errors)) return;
      const c = comps.get(r.competency_id), item = items.get(r.item_id);
      if (typeof r.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(r.id) || seen.has(r.id)) errors.push(label + ': duplicate or invalid record ID');
      seen.add(r.id);
      if (!c || !item || !item.competencies.includes(r.competency_id) || item.version !== r.assessment_version) errors.push(label + ': assessment/competency/version mismatch');
      if (!iso(r.date) || (today && r.date > today) || r.date < previous) errors.push(label + ': invalid, future, or unordered date');
      previous = r.date;
      if (!statuses.includes(r.outcome) || !phases.includes(r.phase)) errors.push(label + ': invalid outcome or phase');
      if (typeof r.help_used !== 'boolean' || typeof r.solution_seen !== 'boolean') errors.push(label + ': help and solution flags must be boolean');
      if (!Array.isArray(r.access_supports) || new Set(r.access_supports).size!==r.access_supports.length || r.access_supports.some(v => !['screen-reader','scribe','extra-time','spoken-response','large-print','translation','alternative-context'].includes(v))) errors.push(label + ': invalid access supports');
      if (!Array.isArray(r.error_tags) || new Set(r.error_tags).size !== r.error_tags.length || r.error_tags.some(t => !tags.has(t) || (c && !c.error_tags.includes(t)))) errors.push(label + ': unknown competency error tag');
      if (!Array.isArray(r.criteria_met) || new Set(r.criteria_met).size !== r.criteria_met.length || (item && r.criteria_met.some(k => !item.scoring.some(s => s.id === k)))) errors.push(label + ': invalid criterion evidence');
      if (!['self','assessor'].includes(r.reviewed_by)) errors.push(label + ': invalid reviewer type');
      if (r.outcome === 'demonstrated' && (r.help_used || r.solution_seen || !Array.isArray(r.error_tags) || r.error_tags.length || !Array.isArray(r.criteria_met) || (item && item.scoring.some(s => s.essential && !r.criteria_met.includes(s.id))))) errors.push(label + ': independent evidence requires every essential criterion and no solving help/errors');
      if (r.outcome === 'assisted' && !r.help_used && !r.solution_seen) errors.push(label + ': assisted outcome needs solving help or prior solution exposure');
      if (item && !eligible(item, state.locality)) errors.push(label + ': incompatible jurisdiction');
      if (item && r.phase === 'transfer' && item.mode === 'knowledge') errors.push(label + ': knowledge task cannot prove transfer');
      if (r.phase === 'retention') {
        const prior = state.records.slice(0, n).filter(x => x?.competency_id === r.competency_id);
        const success = prior.filter(x => x.outcome === 'demonstrated').at(-1);
        if (!success || r.date <= success.date || state.records.slice(0,n).some(x => items.get(x?.item_id)?.exposure_group === item?.exposure_group)) errors.push(label + ': retention needs earlier demonstration and unseen delayed materials');
      }
      if (r.phase === 'transfer' && state.records.slice(0, n).some(x => items.get(x?.item_id)?.exposure_group === item?.exposure_group)) errors.push(label + ': transfer requires unseen materials');
    });
    return errors;
  }
  function policyFor(c, data) { return data.skills.review_policy.overrides[c.review_policy] || data.skills.review_policy.default; }
  function summary(state, cid, data) {
    const c = data.skills.competencies.find(x => x.id === cid);
    if (!c) throw new Error('Unknown competency: ' + cid);
    const attempts = state.records.filter(r => r.competency_id === cid);
    const successes = attempts.filter(r => r.outcome === 'demonstrated');
    const last = attempts.at(-1);
    const checks = attempts.filter(r => r.phase === 'retention');
    const policy = policyFor(c, data);
    let next = null, count = 0;
    for (const r of attempts) {
      if (r.outcome !== 'demonstrated') { count = 0; next = addDays(r.date, policy.retry_days); }
      else {
        if (r.phase === 'retention') count++;
        next = addDays(r.date, policy.intervals_days[Math.min(count, policy.intervals_days.length - 1)]);
      }
    }
    // A current full performance already exercises this family's basic output.
    // Do not infer an unrecorded knowledge award, or schedule redundant checks.
    const higher = state.records.filter(r=>r.competency_id===cid.replace(/\.foundation$/,'.independent')).at(-1);
    if (c.mode==='knowledge' && last?.outcome==='demonstrated' && higher?.outcome==='demonstrated') next=null;
    return {competency_id: cid, status: last ? last.outcome : 'unassessed', attempts: attempts.length,
      first_demonstrated: successes[0]?.date || null, last_demonstrated: successes.at(-1)?.date || null,
      last_attempt: last?.date || null, help_used: last?.help_used || false, error_tags: last?.error_tags || [],
      retention_checks: checks.length, retention_passed: checks.filter(r => r.outcome === 'demonstrated').length,
      retention_status: !checks.length ? 'unchecked' : checks.at(-1).outcome === 'demonstrated' ? 'retained' : 'needs-review', next_review: next};
  }
  function rollup(state, legacyId, data) {
    const rule = data.skills.rollups.find(r => r.id === legacyId);
    if (!rule) throw new Error('Unknown domain competency');
    const evidence = rule.requires.map(id => summary(state, id, data));
    const practicalMissing = rule.additional_evidence.filter(kind => state.observations.filter(o=>o.kind===kind).at(-1)?.outcome !== 'demonstrated');
    const status = evidence.every(s => s.status === 'demonstrated') ? (practicalMissing.length ? 'practical-evidence-required' : 'demonstrated') : evidence.some(s => s.status === 'not-yet') ? 'not-yet' : evidence.some(s => s.status === 'assisted') ? 'assisted' : 'unassessed';
    return {id: legacyId, status, scope: rule.scope, evidence, missing: evidence.filter(s => s.status !== 'demonstrated').map(s => s.competency_id), practical_missing:practicalMissing};
  }
  function progress(state, data, today) {
    const all = data.skills.competencies.map(c => ({...summary(state,c.id,data), domain:c.domain, mode:c.mode}));
    const counts = rows => ({demonstrated: rows.filter(s => s.status === 'demonstrated' && s.mode !== 'knowledge').length,
      knowledge: rows.filter(s => s.status === 'demonstrated' && s.mode === 'knowledge').length,
      assisted: rows.filter(s => s.status === 'assisted').length, needs_work: rows.filter(s => s.status === 'not-yet').length,
      unassessed: rows.filter(s => s.status === 'unassessed').length,
      retention_passed: rows.reduce((n,s) => n+s.retention_passed,0), due: rows.filter(s => s.last_demonstrated && s.next_review <= today).length});
    const pathway = data.index.pathways.find(p => p.id === state.pathway);
    return {totals: counts(all), domains: data.index.domains.map(d => ({id:d.id,title:d.title,...counts(all.filter(s => s.domain===d.id))})),
      pathway: {...counts(all.filter(s => pathway.domains.includes(s.domain))), total: all.filter(s => pathway.domains.includes(s.domain) && s.mode !== 'knowledge').length}, skills:all};
  }
  function recommend(state, data, today) {
    const invalid = validateState(state, data, today);
    if (invalid.length) throw new Error(invalid.join('; '));
    if (!iso(today)) throw new Error('Recommendation requires an ISO date');
    const p = data.index.pathways.find(x => x.id === state.pathway);
    const summaries = new Map(data.skills.competencies.map(c => [c.id,summary(state,c.id,data)]));
    const byId = new Map(data.skills.competencies.map(c => [c.id,c]));
    const seen = new Set(state.records.map(r => data.bank.items.find(i=>i.id===r.item_id).exposure_group));
    const goals = new Set(state.goal_competencies);
    function collect(id) { byId.get(id).prerequisites.forEach(x => { if (!goals.has(x)) { goals.add(x); collect(x); } }); }
    state.goal_competencies.forEach(collect);
    const candidates = [];
    const blocked = [];
    for (const [order,c] of data.skills.competencies.entries()) {
      const s = summaries.get(c.id);
      const due = !!s.last_demonstrated && s.next_review <= today;
      const missing = c.prerequisites.filter(x => summaries.get(x).status !== 'demonstrated');
      const relevant = goals.has(c.id) || p.domains.includes(c.domain);
      if (!due && (!relevant || s.status === 'demonstrated')) continue;
      if (missing.length) { blocked.push({competency_id:c.id,missing}); continue; }
      const options = data.bank.items.filter(i => i.competencies.includes(c.id) && eligible(i,state.locality) && i.prerequisites.every(x => summaries.get(x)?.status === 'demonstrated'));
      const fresh = options.filter(i => !seen.has(i.exposure_group));
      const chosen = fresh.find(i=>s.error_tags.some(t=>i.focus_errors.includes(t))) || fresh[0];
      const reason = [];
      if (due) reason.push('Delayed review due ' + s.next_review + '; use unseen materials.');
      else if (s.status === 'not-yet') reason.push('This criterion is not yet met.');
      else if (s.status === 'assisted') reason.push('The last attempt used help; try without solving prompts.');
      else reason.push('No evidence recorded for this criterion.');
      if (goals.has(c.id)) reason.push('Supports your selected goal or its prerequisite.');
      if (s.error_tags.length) reason.push('Work on: ' + s.error_tags.map(t => data.skills.error_tags.find(e => e.id === t).label).join(', ') + '.');
      if (chosen && s.error_tags.some(t=>chosen.focus_errors.includes(t))) reason.push('This fresh variant specifically tests the step missed in your recent attempt.');
      c.prerequisites.forEach(x => reason.push(byId.get(x).title + ' demonstrated.'));
      if (s.last_attempt) reason.push('Last attempt was ' + elapsed(s.last_attempt,today) + ' days ago.');
      const dependents = data.skills.competencies.filter(x => x.prerequisites.includes(c.id));
      if (dependents.length) reason.push('Prepares you for ' + dependents[0].title + '.');
      const safetyError = s.error_tags.some(t=>['unsafe-advice','reveals-sensitive-information','wrong-jurisdiction','ignores-consent'].includes(t));
      if(safetyError) reason.unshift('Repair the safety, privacy, consent or jurisdiction error before harder work.');
      const stage = due ? 0 : safetyError ? 1 : goals.has(c.id) && s.status !== 'unassessed' ? 2 : s.status === 'not-yet' ? 3 : s.status === 'assisted' ? 4 : goals.has(c.id) ? 5 : 6;
      candidates.push({c,s,chosen,reason, key:[stage, due ? s.next_review : s.last_attempt || '9999', p.domains.indexOf(c.domain)<0 ? 99:p.domains.indexOf(c.domain),order]});
    }
    candidates.sort((a,b) => { for(let n=0;n<a.key.length;n++) { if(a.key[n]<b.key[n])return -1;if(a.key[n]>b.key[n])return 1; }return 0; });
    if (!candidates.length) return {kind:'complete',reason:['Current eligible goals have evidence. Review upcoming dates or choose another goal.'],blocked};
    const best = candidates[0];
    if (!best.chosen) {
      const local = data.bank.items.some(i=>i.competencies.includes(best.c.id) && eligible(i,state.locality));
      return {kind:local?'fresh-materials-needed':'locality-needed',competency:best.c,reason:[...best.reason,local?'No eligible unseen variant remains. An assessor must prepare different materials; repeating a known answer cannot prove transfer.':'This target has no assessment for the selected locality. Choose the relevant supported nation or another skill; do not substitute another nation’s rules.'],learn_path:best.c.learn_path,blocked};
    }
    return {kind:best.s.last_demonstrated && best.s.next_review <= today ? 'retention' : best.c.mode === 'knowledge' ? 'diagnostic' : 'transfer',
      item:best.chosen,competency:best.c,reason:best.reason,estimated_time_minutes:best.chosen.estimated_time_minutes,learn_path:best.c.learn_path,blocked};
  }
  function recordAttempt(state, data, itemId, input, today) {
    const item = data.bank.items.find(i => i.id === itemId);
    if (!item) throw new Error('Unknown assessment item');
    const next = JSON.parse(JSON.stringify(state));
    item.competencies.forEach((cid,n) => {
      const prior = summary(state,cid,data);
      const due = prior.last_demonstrated && prior.next_review <= today;
      const outcome = input.outcome === 'demonstrated' && (input.help_used || input.solution_seen) ? 'assisted' : input.outcome;
      next.records.push({id:'r-' + today + '-' + next.records.length + '-' + n,competency_id:cid,item_id:itemId,assessment_version:item.version,
        date:today,phase:input.phase || (due ? 'retention' : item.mode === 'knowledge' ? 'diagnostic' : 'transfer'),outcome,
        help_used:!!input.help_used,solution_seen:!!input.solution_seen,access_supports:input.access_supports || [],error_tags:input.error_tags || [],
        criteria_met:input.criteria_met || [],reviewed_by:input.reviewed_by || 'self'});
    });
    const errors = validateState(next,data,today);
    if(errors.length) throw new Error(errors.join('; '));
    return next;
  }
  function evaluate(state, data) {
    return data.skills.competencies.map(c => {
      const records = state.records.filter(r => r.competency_id === c.id);
      const pre = records.find(r => r.phase==='diagnostic');
      const post = records.find(r => r.phase==='transfer');
      const delayed = records.filter(r => r.phase==='retention').at(-1);
      const describe = r => r ? {outcome:r.outcome,criteria_met:r.criteria_met.length,criteria_total:data.bank.items.find(i=>i.id===r.item_id).scoring.filter(s=>s.essential).length,
        help_used:r.help_used,error_tags:r.error_tags,item_id:r.item_id,date:r.date} : null;
      return {competency_id:c.id,pre:describe(pre),unseen_post:describe(post),delayed:describe(delayed),
        errors_removed:pre && post ? pre.error_tags.filter(t=>!post.error_tags.includes(t)) : [],
        comparable_criteria:!!pre && !!post && data.bank.items.find(i=>i.id===pre.item_id).scoring.map(s=>s.id).join() === data.bank.items.find(i=>i.id===post.item_id).scoring.map(s=>s.id).join()};
    }).filter(r=>r.pre || r.unseen_post || r.delayed);
  }
  return {iso,addDays,covers,eligible,emptyState,validateState,summary,rollup,progress,recommend,recordAttempt,evaluate};
});
