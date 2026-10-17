// Turn selected papers into plain-language life skills, facts and news
// takeaways with free hosted models. API keys come only from environment
// variables (GitHub Actions secrets) and are never written to the repository
// or shipped to the browser.
//
// Each paper gets its own agent: one focused model call with the full
// abstract. Every provider with a key runs its own pool of agents at the
// same time, all pulling from one shared queue of papers, so total
// throughput is the sum of every provider's free allowance. Each provider
// has its own sliding-window rate limit and daily budget. A paper that fails
// on one provider goes back on the queue for another. A daily-quota, bad-key
// or no-credit error retires that provider; the others carry on.
'use strict';

const { USER_AGENT, sleep, cleanText } = require('./lib');

const CATEGORIES = ['health', 'mind', 'learning', 'thinking', 'money', 'work', 'relationships', 'digital', 'safety', 'environment', 'world'];
const EVIDENCE = ['systematic review', 'randomised trial', 'observational study', 'lab or animal study', 'modelling', 'qualitative study', 'theory or commentary', 'news report', 'other'];
const CONFIDENCE = ['high', 'moderate', 'low'];

// Model ids change often, so each provider names a family to prefer and the
// best match is picked from its live /models list (or the env override).
// Free-tier defaults are deliberately conservative; override them per
// provider with <ID>_CONCURRENCY, <ID>_RPM and <ID>_DAILY_REQUESTS.
const PROVIDERS = [
  {
    id: 'nvidia', label: 'NVIDIA', base: 'https://integrate.api.nvidia.com/v1', key: 'NVIDIA_API_KEY', model: 'NVIDIA_MODEL',
    // Free endpoints as of Oct 2026: nemotron-3.5-super-vl-120b-a12b (early access) and nemotron-3-super-120b-a12b; ~40 requests/min.
    fallback: 'nvidia/nemotron-3-super-120b-a12b',
    spec: { include: /nemotron/i, exclude: /embed|rerank|reward|guard|safety|retriev|parse|ocr|asr|tts|translate/i, prefer: [[/super/i, 10], [/3[.-]5/, 4], [/ultra/i, 2], [/vl/i, 1], [/nano|mini/i, -3]] },
    defaults: { concurrency: 16, rpm: 35, daily: 5000 },
  },
  {
    id: 'groq', label: 'Groq', base: 'https://api.groq.com/openai/v1', key: 'GROQ_API_KEY', model: 'GROQ_MODEL',
    // Free plan as of Oct 2026: qwen/qwen3.8-27b, qwen/qwen3.6-27b and openai/gpt-oss-120b, each about
    // 30 requests/min, 1,000/day, 8,000 tokens/min and 200,000 tokens/day. A summary is ~2,000 tokens,
    // so the token limits bind first: ~4 a minute and ~100 a day per model.
    fallback: 'qwen/qwen3.8-27b',
    spec: { include: /qwen|gpt-oss-120b/i, exclude: /guard|safeguard|tts|whisper|embed|coder/i, prefer: [[/27b/i, 10], [/3[.-]8/, 6], [/gpt-oss-120b/i, 5]] },
    // Qwen 3 thinks out loud unless told not to; Groq accepts this flag.
    extra: (model) => (/qwen/i.test(model) ? { reasoning_effort: 'none' } : {}),
    defaults: { concurrency: 2, rpm: 4, daily: 300, modelDaily: 100 },
  },
  {
    id: 'openrouter', label: 'OpenRouter', base: 'https://openrouter.ai/api/v1', key: 'OPENROUTER_API_KEY', model: 'OPENROUTER_MODEL',
    // Free Nemotron models as of Oct 2026 include nemotron-3-ultra-550b-a55b:free (1M context) and
    // nemotron-3-super-120b-a12b:free; ~50 free requests a day without credit.
    fallback: 'nvidia/nemotron-3-super-120b-a12b:free',
    spec: { include: /nemotron/i, exclude: /embed|reward|guard|safety/i, freeOnly: true, prefer: [[/ultra/i, 12], [/super/i, 10], [/3[.-]5/, 2], [/lightning|nano/i, -2]] },
    headers: () => ({ 'HTTP-Referer': process.env.SITE_URL || 'https://github.com/henrygoldsmith07-wq/life-essential-skills', 'X-Title': 'Life Essential Skills research digest' }),
    defaults: { concurrency: 6, rpm: 18, daily: 48 },
  },
  {
    id: 'cerebras', label: 'Cerebras', base: 'https://api.cerebras.ai/v1', key: 'CEREBRAS_API_KEY', model: 'CEREBRAS_MODEL',
    // No permanent free tier since July 2026: a 30-day, $5 trial (card required) on gpt-oss-120b and
    // qwen-3.8-27b at 5 requests/min and 1M tokens/day.
    fallback: 'gpt-oss-120b',
    spec: { include: /llama|qwen|gpt-oss/i, exclude: /guard|coder|vision/i, prefer: [[/gpt-oss-120b/i, 8], [/qwen-?3\.8/i, 7], [/235b/i, 6], [/70b/i, 5]] },
    defaults: { concurrency: 2, rpm: 5, daily: 400 },
  },
  {
    id: 'gemini', label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: 'GEMINI_API_KEY', model: 'GEMINI_MODEL',
    // Pro models left the free tier in April 2026; Flash and Flash-Lite remain (about 10 requests/min,
    // 1,500/day). gemini-3.6-flash is current; the newest listed Flash is picked.
    fallback: 'gemini-3.6-flash',
    spec: { include: /gemini.*flash/i, exclude: /embed|image|tts|live|audio|thinking|exp|preview|8b/i, prefer: [[/flash(?!-lite)/i, 8], [/flash-lite/i, 4]] },
    // Flash models think by default; "low" is accepted by every current Flash generation.
    extra: () => ({ reasoning_effort: 'low' }),
    defaults: { concurrency: 4, rpm: 9, daily: 1000 },
  },
  {
    id: 'mistral', label: 'Mistral', base: 'https://api.mistral.ai/v1', key: 'MISTRAL_API_KEY', model: 'MISTRAL_MODEL',
    // "Free mode" (formerly the Experiment plan): limits are shown per workspace in the console.
    fallback: 'mistral-small-latest',
    spec: { include: /mistral|ministral|nemo/i, exclude: /embed|moderation|ocr|codestral|pixtral|voxtral|devstral|magistral|saba/i, prefer: [[/mistral-small-latest/i, 9], [/mistral-medium-latest/i, 8], [/mistral-small/i, 6], [/nemo/i, 3]] },
    defaults: { concurrency: 2, rpm: 50, daily: 2000 },
  },
  {
    // Workers AI: about 10,000 free "neurons" a day, roughly 100–200 summaries
    // from a 70B model. Needs the account id as well as an API token.
    id: 'cloudflare', label: 'Cloudflare Workers AI', key: 'CLOUDFLARE_API_TOKEN', model: 'CLOUDFLARE_MODEL', needs: ['CLOUDFLARE_ACCOUNT_ID'],
    base: (env) => `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/ai/v1`,
    modelsUrl: (env) => `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/ai/models/search?task=${encodeURIComponent('Text Generation')}&per_page=100`,
    fallback: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    spec: { include: /llama-3\.3-70b|llama-4|gpt-oss|qwen|mistral-small/i, exclude: /guard|coder|lora|awq|vision/i, prefer: [[/llama-3\.3-70b.*fast/i, 8], [/gpt-oss-120b/i, 7], [/llama-4-scout/i, 6], [/mistral-small/i, 4]] },
    defaults: { concurrency: 4, rpm: 20, daily: 100 },
  },
  {
    id: 'sambanova', label: 'SambaNova', base: 'https://api.sambanova.ai/v1', key: 'SAMBANOVA_API_KEY', model: 'SAMBANOVA_MODEL',
    // Free tier as of Oct 2026: 20 requests/min and only 20/day per model, on Meta-Llama-3.3-70B-Instruct,
    // DeepSeek-V3.1, gpt-oss-120b, DeepSeek-V3.2 and gemma-4-31B-it, so agents rotate across all five.
    fallback: 'DeepSeek-V3.1',
    spec: { include: /llama|qwen|deepseek-v|gpt-oss|gemma/i, exclude: /guard|vision|embed|whisper|r1|distill|coder/i, prefer: [[/deepseek-v3\.1/i, 9], [/deepseek-v3\.2/i, 8], [/gpt-oss-120b/i, 7], [/llama-3\.3-70b/i, 6], [/gemma/i, 5]] },
    maxModels: 5,
    defaults: { concurrency: 2, rpm: 15, daily: 100, modelDaily: 20 },
  },
];

// Reasoning models think out loud by default, which burns the token budget
// and breaks the JSON reply. Each family has its own off switch; a provider
// that rejects a flag gets the request again without it (see runOn).
const thinkingSuffix = (model) => (/nemotron|qwen-?3/i.test(model) ? '\n/no_think' : '');
const thinkingExtra = (model) => (/gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : /nemotron/i.test(model) ? { chat_template_kwargs: { enable_thinking: false } } : {});
const extrasFor = (prov, model) => ({ ...thinkingExtra(model), ...(prov.extra ? prov.extra(model) : {}) });

const SYSTEM = `You are the research editor for "Life Essential Skills", a free curriculum that helps people become capable, independent adults.
You read one new piece of research and explain, in plain British English for a curious 16-year-old, what it means for everyday life and for understanding the world.

Rules:
- Use ONLY what the title and abstract say. Never invent numbers, effects, sample sizes or conclusions.
- Be proportionate to the evidence: a single observational study, a preprint (not yet peer reviewed), an animal/cell study or a model is NOT proof. Say so in the caveat and lower the confidence.
- "life_skill" is a small, safe, general habit or way of thinking the reader could try, written as an imperative ("Try…", "Check…", "Notice…"). Leave it empty if the paper does not support one. Never give personal medical, legal or financial instructions, dosages, or advice to change treatment; point to a qualified professional where relevant.
- "fact" is one durable, accurate thing worth knowing about the world that the paper supports (empty if none).
- "quiz" is one short question that checks the reader understood the finding, with a one-sentence answer drawn from the abstract.
- Correlation is not causation: use "is linked to" unless the design is a randomised trial or systematic review of trials.
- Set "keep" to false if there is no takeaway a non-specialist could understand or use.
Reply with one JSON object only, no prose, no reasoning and no code fences.`;

function prompt(p) {
  return `Summarise this paper.

Title: ${p.title}
Source: ${p.source_name}${p.venue && p.venue !== p.source_name ? ` · ${p.venue}` : ''} (${p.kind}${p.kind === 'preprint' ? ', not yet peer reviewed' : ''})
Published: ${p.published || 'unknown'}
Abstract: ${(p.abstract || '(no abstract available — use the title only and set confidence to low)').slice(0, 3500)}

Return exactly this object:
{"keep":true,"category":"one of ${CATEGORIES.join('|')}","headline":"the finding in one plain sentence (max 22 words)","summary":"2-3 plain sentences: what was studied, what was found","why_it_matters":"one sentence on why this matters to everyday life or understanding the world","life_skill":"one actionable sentence or empty string","fact":"one sentence or empty string","key_terms":["up to 3 short terms a reader could look up"],"quiz":{"question":"one short question","answer":"one sentence"},"evidence":"one of ${EVIDENCE.join('|')}","confidence":"high|moderate|low","caveat":"one sentence on the main limitation"}`;
}

// Models sometimes wrap JSON in fences or reasoning tags; recover the object.
function parseObject(text) {
  const cleaned = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  const tries = [cleaned];
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) tries.push(cleaned.slice(start, end + 1));
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      const obj = Array.isArray(v) ? v[0] : Array.isArray(v && v.items) ? v.items[0] : v;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
    } catch { /* try next */ }
  }
  return null;
}

const clip = (s, n) => {
  const t = cleanText(typeof s === 'string' ? s : '');
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const pick = (v, allowed, fallback) => {
  const s = String(v || '').toLowerCase().trim();
  return allowed.find((a) => a === s) || allowed.find((a) => s && (a.startsWith(s) || s.startsWith(a.split(' ')[0]))) || fallback;
};

// Validate one model reply against the schema. Returns null to drop the paper.
function applySummary(paper, row, model, provider) {
  if (!row || row.keep === false) return null;
  const headline = clip(row.headline, 220);
  if (!headline) return null;
  let confidence = pick(row.confidence, CONFIDENCE, 'low');
  if (paper.kind === 'preprint' && confidence === 'high') confidence = 'moderate';
  const quiz = row.quiz && typeof row.quiz === 'object' ? { question: clip(row.quiz.question, 200), answer: clip(row.quiz.answer, 300) } : null;
  return {
    ...paper,
    category: pick(row.category, CATEGORIES, paper._category || 'world'),
    ai: {
      headline,
      summary: clip(row.summary, 700),
      why_it_matters: clip(row.why_it_matters, 300),
      life_skill: clip(row.life_skill, 300),
      fact: clip(row.fact, 300),
      key_terms: (Array.isArray(row.key_terms) ? row.key_terms : []).map((t) => clip(t, 40)).filter(Boolean).slice(0, 3),
      ...(quiz && quiz.question && quiz.answer ? { quiz } : {}),
      evidence: pick(row.evidence, EVIDENCE, 'other'),
      confidence,
      caveat: clip(row.caveat, 300),
      model,
      ...(provider ? { provider } : {}),
    },
  };
}

// Sliding-window limiter: at most `rpm` requests start in any `windowMs`,
// and at most `budget` requests start in the whole run.
function limiter({ rpm, windowMs, budget }) {
  const starts = [];
  let used = 0;
  let queue = Promise.resolve();
  const take = () => {
    const slot = queue.then(async () => {
      if (used >= budget) return false;
      for (;;) {
        const now = Date.now();
        while (starts.length && now - starts[0] >= windowMs) starts.shift();
        if (starts.length < rpm) break;
        await sleep(windowMs - (now - starts[0]) + 5);
      }
      starts.push(Date.now());
      used++;
      return true;
    });
    queue = slot.catch(() => {});
    return slot;
  };
  return { take, used: () => used };
}

async function api(prov, path, body, { timeoutMs = 120000 } = {}) {
  const res = await fetch(/^https:/.test(path) ? path : `${prov.base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${prov.apiKey}`,
      ...(prov.headers ? prov.headers() : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: { message: text.slice(0, 200) } }; }
  const errMsg = json.error && (json.error.message || json.error) || json.detail;
  if (!res.ok || json.error) {
    const err = new Error(`${prov.label} ${res.status}: ${typeof errMsg === 'string' ? errMsg.slice(0, 200) : 'error'}`);
    err.status = res.ok ? Number(json.error && json.error.code) || 502 : res.status;
    err.retryAfter = Number(res.headers.get('retry-after')) || 0;
    throw err;
  }
  return json;
}

const versionOf = (m) => Math.max(0, ...[...m.matchAll(/(?:qwen|nemotron|gemini|llama|-v)-?(\d+(?:\.\d+)?)/gi)].map((x) => Number(x[1])));

function rankModels(ids, spec, wanted) {
  const ok = ids.filter((m) => spec.include.test(m) && !(spec.exclude && spec.exclude.test(m)) && (!spec.freeOnly || m.endsWith(':free')));
  const score = (m) => spec.prefer.reduce((s, [re, w]) => s + (re.test(m) ? w : 0), 0) + versionOf(m) / 100;
  const ranked = ok.sort((a, b) => score(b) - score(a));
  if (wanted && ids.includes(wanted)) return [wanted, ...ranked.filter((m) => m !== wanted)];
  return ranked;
}

async function resolveModels(prov, log) {
  const wanted = prov.wanted;
  try {
    const list = await api(prov, prov.modelsUrl || '/models', null, { timeoutMs: 30000 });
    const rows = Array.isArray(list) ? list : list.data || list.models || list.result || [];
    // Gemini lists "models/gemini-…" and Cloudflare lists "@cf/…" names next
    // to a uuid id; chat calls take the bare model name.
    const idOf = (m) => (m && typeof m === 'object' ? (/^@/.test(m.name || '') ? m.name : m.id || m.name) : m);
    const ids = rows.map((m) => String(idOf(m) || '').replace(/^models\//, '')).filter(Boolean);
    const ranked = rankModels(ids, prov.spec, wanted);
    if (wanted && ranked[0] !== wanted) log(`  ${prov.label}: ${wanted} not listed; using ${ranked[0] || wanted}`);
    return ranked.length ? ranked.slice(0, prov.maxModels || 3) : [wanted || prov.fallback];
  } catch (e) {
    log(`  ${prov.label}: could not list models (${e.message}); trying ${wanted || prov.fallback}`);
    return [wanted || prov.fallback];
  }
}

// Bad key or no credit: the whole provider is unusable. A daily quota is
// usually per model, so only that model is set aside.
const fatal = (e) => e.status === 401 || e.status === 402 || e.status === 403;
const dailyQuota = (e) => e.status === 429 && /per-day|per day|daily|quota|credits|tokens per day|\bTPD\b|\bRPD\b/i.test(e.message);

// One agent on one provider: summarise one paper. Rate-limit replies wait
// and retry; other transient errors get two tries per model.
async function runOn(prov, paper, ctx) {
  let lastErr = new Error('no models');
  for (const model of prov.models) {
    if (prov.exhausted.has(model)) continue;
    let attempts = 0;
    let waits = 0;
    let useExtra = !prov.noExtra;
    while (attempts < 2) {
      if (prov.stopped) return { error: prov.stopped };
      if (prov.modelDaily && (prov.modelUses[model] || 0) >= prov.modelDaily) {
        retireModel(prov, model, 'per-model daily allowance used up');
        break;
      }
      if (!(await prov.limit.take())) {
        prov.stopped = prov.stopped || 'daily request budget used up';
        return { error: prov.stopped };
      }
      prov.modelUses[model] = (prov.modelUses[model] || 0) + 1;
      try {
        const json = await api(prov, '/chat/completions', {
          model,
          temperature: 0.2,
          max_tokens: 3000,
          messages: [{ role: 'system', content: SYSTEM + thinkingSuffix(model) }, { role: 'user', content: prompt(paper) }],
          ...(useExtra ? extrasFor(prov, model) : {}),
        });
        prov.calls++;
        const used = json.model || model;
        const row = parseObject(json.choices?.[0]?.message?.content);
        if (!row) throw Object.assign(new Error(`${prov.label}: unparseable reply`), { status: 502 });
        return { item: applySummary(paper, row, used, prov.id), model: used };
      } catch (e) {
        lastErr = e;
        if (fatal(e)) {
          prov.stopped = e.message;
          return { error: e.message };
        }
        if (dailyQuota(e)) {
          retireModel(prov, model, e.message);
          break;
        }
        if (e.status === 400 && useExtra && Object.keys(extrasFor(prov, model)).length) {
          useExtra = false; // the provider rejected our optional flags: drop them for good
          prov.noExtra = true;
          continue;
        }
        if (e.status === 404) { retireModel(prov, model, e.message); break; } // model gone
        if (e.status === 400) break; // this paper refused: next model
        if (e.status === 429 && waits < 5) {
          waits++;
          await sleep(e.retryAfter ? e.retryAfter * 1000 : ctx.backoffMs * waits);
          continue;
        }
        attempts++;
        await sleep(ctx.backoffMs * attempts);
      }
    }
  }
  if (prov.stopped) return { error: prov.stopped };
  return { error: lastErr.message };
}

// Set a model aside for the rest of the run; with none left, retire the provider.
function retireModel(prov, model, reason) {
  prov.exhausted.add(model);
  if (prov.models.every((m) => prov.exhausted.has(m))) prov.stopped = prov.stopped || `${prov.label}: every model unavailable (${String(reason).slice(0, 120)})`;
}

const envNum = (env, name) => (env[name] !== undefined && env[name] !== '' && Number.isFinite(Number(env[name])) ? Number(env[name]) : undefined);

// Providers that have a key, with limits from defaults or env
// (<ID>_CONCURRENCY, <ID>_RPM, <ID>_DAILY_REQUESTS).
function configure(env = process.env, overrides = {}) {
  return PROVIDERS.filter((p) => env[p.key] && (p.needs || []).every((k) => env[k])).map((p) => {
    const id = p.id.toUpperCase();
    const o = overrides[p.id] || {};
    return {
      ...p,
      base: typeof p.base === 'function' ? p.base(env) : p.base,
      modelsUrl: typeof p.modelsUrl === 'function' ? p.modelsUrl(env) : p.modelsUrl,
      apiKey: env[p.key],
      wanted: env[p.model] || '',
      concurrency: o.concurrency ?? envNum(env, `${id}_CONCURRENCY`) ?? p.defaults.concurrency,
      rpm: o.rpm ?? envNum(env, `${id}_RPM`) ?? p.defaults.rpm,
      daily: o.daily ?? envNum(env, `${id}_DAILY_REQUESTS`) ?? p.defaults.daily,
      modelDaily: o.modelDaily ?? envNum(env, `${id}_MODEL_DAILY_REQUESTS`) ?? p.defaults.modelDaily,
    };
  });
}

async function summarise(papers, opts = {}) {
  const log = opts.log || console.log;
  const env = opts.env || process.env;
  const windowMs = opts.windowMs ?? envNum(env, 'RESEARCH_WINDOW_MS') ?? 60000;
  const ctx = { backoffMs: opts.backoffMs ?? envNum(env, 'RESEARCH_BACKOFF_MS') ?? 8000 };
  const providers = configure(env, opts.providers);
  if (!providers.length) return { items: [], model: null, calls: 0, peak: 0, providers: {}, errors: ['No model API key set (NVIDIA_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY) — papers listed without AI summaries'] };

  await Promise.all(providers.map(async (p) => {
    p.models = await resolveModels(p, log);
    p.limit = limiter({ rpm: p.rpm, windowMs, budget: p.daily });
    p.calls = 0;
    p.items = 0;
    p.stopped = null;
    p.exhausted = new Set();
    p.modelUses = {};
  }));
  log(`  ${papers.length} papers, one agent each: ${providers.map((p) => `${p.label} ${p.models[0]} ×${p.concurrency} (≤${p.rpm}/min, budget ${p.daily})`).join(' · ')}`);

  const queue = papers.map((paper, i) => ({ i, paper, tried: new Set() }));
  const results = new Array(papers.length);
  let inFlight = 0;
  let peak = 0;
  const live = () => providers.filter((p) => !p.stopped);

  async function worker(prov) {
    for (;;) {
      if (prov.stopped) return;
      const k = queue.findIndex((j) => !j.tried.has(prov.id));
      if (k < 0) {
        if (!inFlight) return;
        await sleep(25); // a job in flight elsewhere may still bounce back to this provider
        continue;
      }
      const [job] = queue.splice(k, 1);
      inFlight++;
      peak = Math.max(peak, inFlight);
      const r = await runOn(prov, job.paper, ctx);
      job.tried.add(prov.id);
      if (r.item || r.model) {
        results[job.i] = { ...r, provider: prov.id };
        if (r.item) prov.items++;
      } else if (live().some((p) => !job.tried.has(p.id))) {
        queue.push(job); // let another provider try it
      } else {
        results[job.i] = { error: r.error };
        log(`  ✗ ${job.paper.title.slice(0, 70)} — ${r.error}`);
      }
      inFlight--;
    }
  }

  await Promise.all(providers.flatMap((p) => Array.from({ length: Math.min(p.concurrency, papers.length) }, () => worker(p))));
  for (const job of queue) results[job.i] = results[job.i] || { error: 'every provider was unavailable' };

  const items = results.filter((r) => r && r.item).map((r) => r.item);
  const errors = [...new Set([...results.filter((r) => r && r.error).map((r) => r.error), ...providers.filter((p) => p.stopped).map((p) => p.stopped)])];
  const byProvider = Object.fromEntries(providers.map((p) => [p.id, { label: p.label, model: p.models[0], calls: p.calls, summaries: p.items, concurrency: p.concurrency, ...(p.stopped ? { stopped: p.stopped.slice(0, 160) } : {}) }]));
  const top = providers.slice().sort((a, b) => b.items - a.items)[0];
  return { items, model: top.models[0], calls: providers.reduce((a, p) => a + p.limit.used(), 0), peak, providers: byProvider, errors };
}

module.exports = { summarise, configure, extrasFor, thinkingSuffix, prompt, parseObject, applySummary, limiter, rankModels, PROVIDERS, CATEGORIES, EVIDENCE };
