// Turn selected papers into plain-language life skills, facts and news
// takeaways with a free OpenRouter model. The key comes only from the
// OPENROUTER_API_KEY environment variable (a GitHub Actions secret) and is
// never written to the repository or shipped to the browser.
'use strict';

const { USER_AGENT, sleep, cleanText } = require('./lib');

const API = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'nvidia/nemotron-3.5-super-vl:free';

const CATEGORIES = ['health', 'mind', 'learning', 'thinking', 'money', 'work', 'relationships', 'digital', 'safety', 'environment', 'world'];
const EVIDENCE = ['systematic review', 'randomised trial', 'observational study', 'lab or animal study', 'modelling', 'qualitative study', 'theory or commentary', 'news report', 'other'];
const CONFIDENCE = ['high', 'moderate', 'low'];

const SYSTEM = `You are the research editor for "Life Essential Skills", a free curriculum that helps people become capable, independent adults.
You read new research and explain, in plain British English for a curious 16-year-old, what it means for everyday life and for understanding the world.

Rules:
- Use ONLY what the title and abstract say. Never invent numbers, effects, sample sizes or conclusions.
- Be proportionate to the evidence: a single observational study, a preprint (not yet peer reviewed), an animal/cell study or a model is NOT proof. Say so in the caveat and lower the confidence.
- "life_skill" is a small, safe, general habit or way of thinking the reader could try, written as an imperative ("Try…", "Check…", "Notice…"). Leave it empty if the paper does not support one. Never give personal medical, legal or financial instructions, dosages, or advice to change treatment; point to a qualified professional where relevant.
- "fact" is one durable, accurate thing worth knowing about the world that the paper supports (empty if none).
- Correlation is not causation: use "is linked to" unless the design is a randomised trial or systematic review of trials.
- Set "keep" to false for papers with no takeaway a non-specialist could understand or use.
Reply with JSON only, no prose and no code fences.`;

function prompt(batch) {
  const papers = batch.map((p, i) => [
    `#${i + 1}`,
    `Title: ${p.title}`,
    `Source: ${p.source_name}${p.venue && p.venue !== p.source_name ? ` · ${p.venue}` : ''} (${p.kind}${p.kind === 'preprint' ? ', not yet peer reviewed' : ''})`,
    `Published: ${p.published || 'unknown'}`,
    `Abstract: ${(p.abstract || '(no abstract available — use the title only and set confidence to low)').slice(0, 1600)}`,
  ].join('\n')).join('\n\n');
  return `Summarise each paper below.

Return exactly: {"items":[{"n":1,"keep":true,"category":"one of ${CATEGORIES.join('|')}","headline":"the finding in one plain sentence (max 22 words)","summary":"2-3 plain sentences: what was studied, what was found","why_it_matters":"one sentence on why this matters to everyday life or understanding the world","life_skill":"one actionable sentence or empty string","fact":"one sentence or empty string","evidence":"one of ${EVIDENCE.join('|')}","confidence":"high|moderate|low","caveat":"one sentence on the main limitation"}]}
Include one object per paper, using its # number as "n".

${papers}`;
}

// Free models sometimes wrap JSON in fences or reasoning tags; recover the object.
function parseJson(text) {
  const cleaned = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  const tries = [cleaned];
  const objStart = cleaned.indexOf('{');
  const objEnd = cleaned.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) tries.push(cleaned.slice(objStart, objEnd + 1));
  const arrStart = cleaned.indexOf('[');
  const arrEnd = cleaned.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) tries.push(cleaned.slice(arrStart, arrEnd + 1));
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      if (Array.isArray(v)) return v;
      if (v && Array.isArray(v.items)) return v.items;
    } catch { /* try next */ }
  }
  return [];
}

const clip = (s, n) => {
  const t = cleanText(s);
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const pick = (v, allowed, fallback) => {
  const s = String(v || '').toLowerCase().trim();
  return allowed.find((a) => a === s) || allowed.find((a) => s && (a.startsWith(s) || s.startsWith(a.split(' ')[0]))) || fallback;
};

// Validate model output against the schema; anything malformed is dropped.
function applySummaries(batch, rows, model) {
  const out = [];
  for (const row of rows) {
    const idx = Number(row && row.n) - 1;
    const paper = batch[idx];
    if (!paper || row.keep === false) continue;
    const headline = clip(row.headline, 220);
    if (!headline) continue;
    let confidence = pick(row.confidence, CONFIDENCE, 'low');
    if (paper.kind === 'preprint' && confidence === 'high') confidence = 'moderate';
    out.push({
      ...paper,
      category: pick(row.category, CATEGORIES, paper._category || 'world'),
      ai: {
        headline,
        summary: clip(row.summary, 700),
        why_it_matters: clip(row.why_it_matters, 300),
        life_skill: clip(row.life_skill, 300),
        fact: clip(row.fact, 300),
        evidence: pick(row.evidence, EVIDENCE, 'other'),
        confidence,
        caveat: clip(row.caveat, 300),
        model,
      },
    });
  }
  return out;
}

async function api(path, key, body, { timeoutMs = 120000 } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      'HTTP-Referer': process.env.SITE_URL || 'https://github.com/henrygoldsmith07-wq/life-essential-skills',
      'X-Title': 'Life Essential Skills research digest',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: { message: text.slice(0, 200) } }; }
  if (!res.ok || json.error) {
    const err = new Error(`OpenRouter ${res.status}: ${json.error?.message || 'error'}`);
    err.status = res.status || json.error?.code;
    err.retryAfter = Number(res.headers.get('retry-after')) || 0;
    throw err;
  }
  return json;
}

// Model slugs change; resolve the requested one against OpenRouter's public
// model list and fall back to the closest free Nemotron model if it is gone.
function rankModels(ids, wanted) {
  if (ids.includes(wanted)) return [wanted, ...ids.filter((m) => m !== wanted && /nemotron/i.test(m) && m.endsWith(':free'))];
  const scoreId = (m) => (/super/i.test(m) ? 4 : 0) + (/3[.-]5/.test(m) ? 3 : 0) + (/vl/i.test(m) ? 2 : 0) + (/ultra/i.test(m) ? 1 : 0);
  return ids.filter((m) => /nemotron/i.test(m) && m.endsWith(':free')).sort((a, b) => scoreId(b) - scoreId(a));
}

async function resolveModels(key, wanted, log) {
  try {
    const list = await api('/models', key, null, { timeoutMs: 30000 });
    const ids = (list.data || []).map((m) => m.id);
    const ranked = rankModels(ids, wanted);
    if (ranked[0] !== wanted) log(`model ${wanted} not listed; using ${ranked[0] || wanted}`);
    return ranked.length ? ranked.slice(0, 3) : [wanted];
  } catch (e) {
    log(`could not list models (${e.message}); trying ${wanted}`);
    return [wanted];
  }
}

async function complete(key, models, content, log) {
  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const json = await api('/chat/completions', key, {
          model,
          temperature: 0.2,
          max_tokens: 6000,
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content }],
        });
        const text = json.choices?.[0]?.message?.content || '';
        if (!text.trim()) throw Object.assign(new Error('empty completion'), { status: 502 });
        return { text, model: json.model || model };
      } catch (e) {
        lastErr = e;
        if (e.status === 401 || e.status === 402) throw e; // bad key / no credit: stop
        if (e.status === 404 || e.status === 400) break; // try next model
        const wait = e.retryAfter ? e.retryAfter * 1000 : 8000 * (attempt + 1);
        log(`  ${model}: ${e.message}; retrying in ${Math.round(wait / 1000)}s`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

async function summarise(papers, { key, model = DEFAULT_MODEL, batchSize = 8, log = console.log, gapMs = 4000 } = {}) {
  if (!key) return { items: [], model: null, calls: 0, errors: ['OPENROUTER_API_KEY not set — papers listed without AI summaries'] };
  const models = await resolveModels(key, model, log);
  const items = [];
  const errors = [];
  let used = models[0];
  let calls = 0;
  for (let i = 0; i < papers.length; i += batchSize) {
    const batch = papers.slice(i, i + batchSize);
    try {
      const res = await complete(key, models, prompt(batch), log);
      calls++;
      used = res.model;
      const rows = parseJson(res.text);
      const kept = applySummaries(batch, rows, res.model);
      log(`  batch ${i / batchSize + 1}: ${kept.length}/${batch.length} kept`);
      items.push(...kept);
    } catch (e) {
      errors.push(e.message);
      log(`  batch ${i / batchSize + 1} failed: ${e.message}`);
      if (e.status === 401 || e.status === 402 || (e.status === 429 && /per-day|quota/i.test(e.message))) break; // stop burning the daily allowance
    }
    if (i + batchSize < papers.length) await sleep(gapMs);
  }
  return { items, model: used, calls, errors };
}

module.exports = { summarise, prompt, parseJson, applySummaries, rankModels, DEFAULT_MODEL, CATEGORIES, EVIDENCE };
