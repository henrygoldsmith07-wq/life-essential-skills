// Research digest: parsers, de-duplication, selection, model-output handling
// and one end-to-end run against a mocked network. No real requests are made.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'research-'));
process.env.RESEARCH_OUT = OUT;
process.env.RESEARCH_BACKOFF_MS = '1';

const lib = require('../scripts/research/lib');
const src = require('../scripts/research/sources');
const sum = require('../scripts/research/summarise');
const run = require('../scripts/research/run');
const enrich = require('../scripts/research/enrich');

const S = (id, kind = 'journal') => ({ id, name: id, kind });

const ARXIV = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2610.01234v2</id>
    <published>2026-10-15T17:59:59Z</published>
    <title>Sleep regularity and
      memory in adolescents</title>
    <summary>  We study sleep &amp; memory in 2,000 students.  </summary>
    <author><name>Ada Lovelace</name></author><author><name>Alan Turing</name></author>
    <arxiv:doi>10.1000/XYZ.123</arxiv:doi>
    <link href="http://arxiv.org/abs/2610.01234v2" rel="alternate" type="text/html"/>
    <arxiv:primary_category term="q-bio.NC" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

const PUBMED = `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">40000001</PMID><Article>
<Journal><Title>The Lancet</Title><JournalIssue><PubDate><Year>2026</Year><Month>Oct</Month></PubDate></JournalIssue></Journal>
<ArticleTitle>Walking and blood pressure: a <i>meta-analysis</i>.</ArticleTitle>
<ELocationID EIdType="pii">S0140</ELocationID>
<Abstract><AbstractText Label="BACKGROUND">Walking is common.</AbstractText><AbstractText Label="RESULTS">Lower blood pressure.</AbstractText></Abstract>
<AuthorList><Author ValidYN="Y"><LastName>Smith</LastName><ForeName>Jo</ForeName><Initials>J</Initials></Author></AuthorList>
<PublicationTypeList><PublicationType UI="D017418">Meta-Analysis</PublicationType></PublicationTypeList>
<ArticleDate DateType="Electronic"><Year>2026</Year><Month>10</Month><Day>14</Day></ArticleDate>
</Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="pubmed">40000001</ArticleId><ArticleId IdType="doi">10.1016/S0140-6736(26)00001-1</ArticleId></ArticleIdList>
<ReferenceList><Reference><ArticleIdList><ArticleId IdType="doi">10.9999/wrong</ArticleId></ArticleIdList></Reference></ReferenceList></PubmedData></PubmedArticle></PubmedArticleSet>`;

const RSS = `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>News</title>
<atom:link href="https://example.org/feed" rel="self" xmlns:atom="http://www.w3.org/2005/Atom"/>
<item><title><![CDATA[Bees can count & plan]]></title><link>https://example.org/bees</link>
<description>&lt;p&gt;Researchers found &lt;b&gt;bees&lt;/b&gt; count.&lt;/p&gt;</description><pubDate>Wed, 15 Oct 2026 10:00:00 GMT</pubDate><dc:creator>Sam</dc:creator></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">Stars &amp;amp; planets</title>
<link rel="alternate" href="https://example.org/stars"/><summary>A new planet.</summary><updated>2026-10-16T08:00:00Z</updated></entry></feed>`;

const RDF = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:prism="http://prismstandard.org/namespaces/basic/2.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<item rdf:about="https://www.nature.com/articles/s41586-026-1"><title>Deep ocean oxygen</title><link>https://www.nature.com/articles/s41586-026-1</link>
<description>Oxygen made in the dark.</description><dc:identifier>doi:10.1038/s41586-026-1</dc:identifier><prism:doi>10.1038/s41586-026-1</prism:doi><dc:date>2026-10-15</dc:date></item></rdf:RDF>`;

test('lib: text cleaning decodes entities, CDATA and nested HTML', () => {
  assert.strictEqual(lib.cleanText('<![CDATA[a &lt;b&gt; c]]>'), 'a c');
  assert.strictEqual(lib.cleanText('caf&#233; &#x2014; ok'), 'café — ok');
  assert.strictEqual(lib.normDoi('https://doi.org/10.1234/ABC'), '10.1234/abc');
  assert.strictEqual(lib.normDoi('not a doi'), '');
  assert.strictEqual(lib.safeUrl('javascript:alert(1)'), '');
});

test('arXiv parser normalises ids, DOI and alphaXiv link', () => {
  const [p] = src.parseArxiv(ARXIV, S('arxiv', 'preprint'));
  assert.strictEqual(p.id, 'arxiv:2610.01234');
  assert.strictEqual(p.title, 'Sleep regularity and memory in adolescents');
  assert.strictEqual(p.abstract, 'We study sleep & memory in 2,000 students.');
  assert.strictEqual(p.doi, '10.1000/xyz.123');
  assert.strictEqual(p.links.alphaxiv, 'https://www.alphaxiv.org/abs/2610.01234');
  assert.strictEqual(p.venue, 'q-bio.NC');
  assert.strictEqual(p.published, '2026-10-15');
  assert.deepStrictEqual(p.authors, ['Ada Lovelace', 'Alan Turing']);
});

test('PubMed parser takes the article DOI (not a reference DOI), labels and review kind', () => {
  const [p] = src.parsePubmed(PUBMED, S('pubmed'));
  assert.strictEqual(p.id, 'pmid:40000001');
  assert.strictEqual(p.doi, '10.1016/s0140-6736(26)00001-1');
  assert.strictEqual(p.abstract, 'BACKGROUND: Walking is common. RESULTS: Lower blood pressure.');
  assert.strictEqual(p.kind, 'review');
  assert.strictEqual(p.published, '2026-10-14');
  assert.strictEqual(p.venue, 'The Lancet');
  assert.strictEqual(p.title, 'Walking and blood pressure: a meta-analysis .');
  const [c] = src.parsePubmed(PUBMED, S('cochrane', 'review'), { cochrane: true });
  assert.strictEqual(c.url, 'https://www.cochranelibrary.com/cdsr/doi/10.1016/S0140-6736(26)00001-1/full');
  assert.strictEqual(c.links.pubmed, 'https://pubmed.ncbi.nlm.nih.gov/40000001/');
});

test('feed parser handles RSS 2.0, Atom and RDF, and drops unsafe links', () => {
  const rss = src.parseFeed(RSS, S('news', 'news'));
  assert.strictEqual(rss.length, 1);
  assert.strictEqual(rss[0].title, 'Bees can count & plan');
  assert.strictEqual(rss[0].abstract, 'Researchers found bees count.');
  assert.strictEqual(rss[0].url, 'https://example.org/bees');
  assert.strictEqual(rss[0].published, '2026-10-15');
  const [atom] = src.parseFeed(ATOM, S('a', 'news'));
  assert.strictEqual(atom.title, 'Stars & planets');
  assert.strictEqual(atom.url, 'https://example.org/stars');
  const [rdf] = src.parseFeed(RDF, S('nature'));
  assert.strictEqual(rdf.doi, '10.1038/s41586-026-1');
  assert.strictEqual(rdf.id, 'doi:10.1038/s41586-026-1');
});

test('JSON API parsers: OpenAlex, Semantic Scholar, bioRxiv, PLOS, Europe PMC, OSF, DOAJ, ChemRxiv, HF', () => {
  assert.strictEqual(src.invertedToText({ world: [1], Hello: [0], again: [2] }), 'Hello world again');
  const [oa] = src.parseOpenAlex({ results: [{ id: 'https://openalex.org/W1', doi: 'https://doi.org/10.5555/x', title: 'T', publication_date: '2026-10-15', abstract_inverted_index: { a: [0] }, primary_location: { source: { display_name: 'J' } }, authorships: [{ author: { display_name: 'A' } }], type: 'review' }] }, S('openalex'));
  assert.deepStrictEqual([oa.id, oa.kind, oa.venue, oa.abstract], ['doi:10.5555/x', 'review', 'J', 'a']);
  const [s2] = src.parseSemanticScholar({ data: [{ paperId: 'p1', title: 'S', abstract: 'x', externalIds: { ArXiv: '2610.1' }, publicationDate: '2026-10-15', authors: [{ name: 'N' }] }] }, S('s2'));
  assert.strictEqual(s2.id, 'arxiv:2610.1');
  assert.ok(s2.links.alphaxiv);
  const [bx] = src.parseBiorxiv({ collection: [{ doi: '10.1101/2026.10.14.1', title: 'M', abstract: 'x', date: '2026-10-15', version: '2', category: 'epidemiology', authors: 'A; B' }] }, { id: 'medrxiv', name: 'medRxiv', kind: 'preprint' }, 'medrxiv');
  assert.strictEqual(bx.url, 'https://www.medrxiv.org/content/10.1101/2026.10.14.1v2');
  assert.strictEqual(bx.venue, 'medRxiv · epidemiology');
  const [pl] = src.parsePlos({ response: { docs: [{ id: '10.1371/journal.pone.1', title_display: 'P', abstract: ['x'], journal: 'PLOS ONE', publication_date: '2026-10-15T00:00:00Z' }] } }, S('plos'));
  assert.strictEqual(pl.url, 'https://doi.org/10.1371/journal.pone.1');
  const ep = src.parseEuropePmc({ resultList: { result: [{ id: 'PPR1', source: 'PPR', title: 'E', abstractText: 'x', bookOrReportDetails: { publisher: 'Research Square' }, firstPublicationDate: '2026-10-15' }, { id: 'PPR2', source: 'PPR', title: 'dup', bookOrReportDetails: { publisher: 'medRxiv' } }] } }, S('europepmc', 'preprint'));
  assert.strictEqual(ep.length, 1);
  assert.strictEqual(ep[0].source_name, 'Research Square (via Europe PMC)');
  const [osf] = src.parseOsf({ data: [{ id: 'abc', attributes: { title: 'O', description: 'x', date_published: '2026-10-15' }, links: { html: 'https://osf.io/preprints/psyarxiv/abc' } }] }, S('osf', 'preprint'), 'psyarxiv');
  assert.strictEqual(osf.source_name, 'PsyArXiv');
  const [dj] = src.parseDoaj({ results: [{ created_date: '2026-10-15T00:00:00Z', bibjson: { title: 'D', identifier: [{ type: 'doi', id: '10.7777/d' }], link: [{ type: 'fulltext', url: 'https://j.org/d' }], journal: { title: 'J' } } }] }, S('doaj'));
  assert.strictEqual(dj.url, 'https://j.org/d');
  const [cx] = src.parseChemrxiv({ itemHits: [{ item: { id: 'c1', title: 'C', doi: '10.26434/c1', publishedDate: '2026-10-15T00:00:00Z', authors: [{ firstName: 'A', lastName: 'B' }] } }] }, S('chemrxiv', 'preprint'));
  assert.deepStrictEqual(cx.authors, ['A B']);
  const [hf] = src.parseHfDaily([{ paper: { id: '2610.01234', title: 'H', summary: 'x', publishedAt: '2026-10-15T00:00:00.000Z' } }], S('hf', 'preprint'));
  assert.strictEqual(hf.id, 'arxiv:2610.01234');
});

test('source registry: unique ids, https homes, every adapter callable', () => {
  const ids = src.SOURCES.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(src.SOURCES.length >= 30);
  for (const id of ['arxiv', 'semanticscholar', 'pubmed', 'cochrane', 'medrxiv', 'biorxiv', 'openalex', 'europepmc']) assert.ok(ids.includes(id), id);
  for (const s of src.SOURCES) {
    assert.match(s.home, /^https:\/\//, s.id);
    assert.strictEqual(typeof s.fetch, 'function');
  }
});

test('dedupe merges the same paper from different sources and keeps the richest abstract', () => {
  const a = lib.makeItem(S('arxiv', 'preprint'), { id: 'arxiv:1', title: 'Same paper about sleep and memory', abstract: 'short', url: 'https://arxiv.org/abs/1', doi: '10.1234/a' });
  const b = lib.makeItem(S('openalex'), { title: 'Same paper about sleep and memory', abstract: 'a much longer abstract', url: 'https://doi.org/10.1234/a', doi: '10.1234/A' });
  const c = lib.makeItem(S('rss', 'news'), { title: 'Same Paper About Sleep and Memory!', url: 'https://news.example/x' });
  const out = lib.dedupe([a, b, c]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].abstract, 'a much longer abstract');
  assert.deepStrictEqual(out[0].also_in.map((x) => x.source_name), ['openalex', 'rss']);
});

test('select favours life-relevant, stronger evidence and spreads across sources', () => {
  const mk = (source, title, abstract) => lib.makeItem(S(source), { title, abstract, url: `https://x.org/${encodeURIComponent(title)}` });
  const items = [
    mk('a', 'Sleep and depression: a systematic review', 'Sleep, depression, anxiety and stress in adults.'),
    mk('a', 'Exercise and mood', 'Physical activity and mood.'),
    mk('a', 'Lattice QCD', 'Quark propagators.'),
    mk('b', 'Household debt and wellbeing', 'Financial stress and debt.'),
    mk('news', 'A new planet', 'A planet orbits a star.'),
  ];
  const picked = lib.select(items, 3, new Set(['news']));
  assert.deepStrictEqual(picked.map((p) => p.title), ['Sleep and depression: a systematic review', 'Household debt and wellbeing', 'A new planet']);
  assert.ok(!lib.select(items, 10).some((p) => p.title === 'Lattice QCD'));
  assert.strictEqual(lib.score(items[0]).category, 'mind');
});

test('model output: tolerant JSON parsing and strict schema validation', () => {
  assert.deepStrictEqual(sum.parseObject('<think>hmm</think>```json\n{"headline":"x"}\n```'), { headline: 'x' });
  assert.deepStrictEqual(sum.parseObject('Here you go: {"headline":"y"} thanks'), { headline: 'y' });
  assert.deepStrictEqual(sum.parseObject('{"items":[{"headline":"z"}]}'), { headline: 'z' });
  assert.strictEqual(sum.parseObject('nope'), null);
  const paper = { id: 'p1', title: 'A', kind: 'preprint', _category: 'health' };
  const out = sum.applySummary(paper, { keep: true, category: 'nonsense', headline: '<b>Short</b> sleep is linked to worse mood', summary: 's', life_skill: 'Try a regular bedtime.', fact: '', key_terms: ['circadian rhythm', 7, '', 'a', 'b'], quiz: { question: 'What was linked to mood?', answer: 'Short sleep.' }, evidence: 'observational', confidence: 'HIGH', caveat: 'Preprint.' }, 'm');
  assert.strictEqual(out.ai.headline, 'Short sleep is linked to worse mood');
  assert.strictEqual(out.category, 'health');
  assert.strictEqual(out.ai.evidence, 'observational study');
  assert.strictEqual(out.ai.confidence, 'moderate', 'a preprint is never high confidence');
  assert.deepStrictEqual(out.ai.key_terms, ['circadian rhythm', 'a', 'b']);
  assert.deepStrictEqual(out.ai.quiz, { question: 'What was linked to mood?', answer: 'Short sleep.' });
  assert.strictEqual(sum.applySummary(paper, { keep: false, headline: 'skip' }, 'm'), null);
  assert.strictEqual(sum.applySummary(paper, { headline: '' }, 'm'), null);
  assert.ok(!('quiz' in sum.applySummary(paper, { headline: 'h', quiz: { question: 'q' } }, 'm').ai), 'half a quiz is dropped');
  const p = sum.prompt({ title: 'A', source_name: 'arXiv', kind: 'preprint', abstract: 'x'.repeat(5000) });
  assert.match(p, /Title: A/);
  assert.match(p, /not yet peer reviewed/);
  assert.ok(p.length < 5000, 'abstract is clipped');
});

test('limiter caps requests per window and in total', async () => {
  const lim = sum.limiter({ rpm: 2, windowMs: 120, budget: 5 });
  const t0 = Date.now();
  const got = await Promise.all(Array.from({ length: 7 }, () => lim.take()));
  assert.deepStrictEqual(got, [true, true, true, true, true, false, false]);
  assert.ok(Date.now() - t0 >= 230, 'five requests at two per window span three windows');
  assert.strictEqual(lim.used(), 5);
});

// Mock of the three OpenAI-compatible providers, keyed by host, with hooks
// to observe parallelism and to script failures.
const HOSTS = { 'integrate.api.nvidia.com': 'nvidia', 'api.groq.com': 'groq', 'openrouter.ai': 'openrouter' };
const MODELS = {
  nvidia: ['nvidia/nv-embedqa-e5-v5', 'nvidia/nemotron-nano-9b-v2', 'nvidia/llama-3.3-nemotron-super-49b-v1.5', 'nvidia/nemotron-3.5-super-vl'],
  groq: ['whisper-large-v3', 'qwen/qwen3-32b', 'qwen/qwen3.8-27b', 'llama-3.3-70b-versatile'],
  openrouter: ['nvidia/nemotron-3.5-super-vl:free', 'nvidia/nemotron-3.5-super-vl'],
};
function mockProviders({ delayMs = 20, reply } = {}) {
  const seen = { inFlight: 0, peak: 0, calls: { nvidia: 0, groq: 0, openrouter: 0 }, bodies: [] };
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const prov = HOSTS[u.host];
    if (!prov) return new Response('no', { status: 404 });
    if (u.pathname.endsWith('/models')) return new Response(JSON.stringify({ data: MODELS[prov].map((id) => ({ id })) }), { status: 200 });
    seen.calls[prov]++;
    seen.inFlight++;
    seen.peak = Math.max(seen.peak, seen.inFlight);
    await new Promise((r) => setTimeout(r, delayMs));
    seen.inFlight--;
    const body = JSON.parse(init.body);
    seen.bodies.push({ prov, body, auth: init.headers.Authorization });
    const title = (body.messages[1].content.match(/^Title: (.*)$/m) || [])[1];
    const custom = reply && reply(prov, title, body);
    if (custom) return custom;
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: JSON.stringify({ headline: `About ${title}`, summary: 'S', confidence: 'moderate' }) } }] }), { status: 200 });
  };
  return { fetch, seen };
}
const err = (status, message) => new Response(JSON.stringify({ error: { message } }), { status });

const papersN = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, title: `Paper ${i}`, kind: 'journal', abstract: 'a' }));
const quiet = { log: () => {}, backoffMs: 1 };
async function withFetch(f, fn) {
  const real = global.fetch;
  global.fetch = f;
  try { return await fn(); } finally { global.fetch = real; }
}

test('providers: only those with a key run, limits come from defaults or env', () => {
  assert.deepStrictEqual(sum.configure({}).map((p) => p.id), []);
  const ps = sum.configure({ GROQ_API_KEY: 'g', NVIDIA_API_KEY: 'n', NVIDIA_CONCURRENCY: '32', GROQ_RPM: '12', GROQ_MODEL: 'qwen/x' });
  assert.deepStrictEqual(ps.map((p) => p.id), ['nvidia', 'groq']);
  assert.strictEqual(ps[0].concurrency, 32);
  assert.strictEqual(ps[1].rpm, 12);
  assert.strictEqual(ps[1].wanted, 'qwen/x');
  assert.strictEqual(ps[1].daily, sum.PROVIDERS.find((p) => p.id === 'groq').defaults.daily);
});

test('model resolution picks each provider\'s preferred family from its live list', () => {
  const spec = (id) => sum.PROVIDERS.find((p) => p.id === id).spec;
  assert.strictEqual(sum.rankModels(MODELS.nvidia, spec('nvidia'))[0], 'nvidia/nemotron-3.5-super-vl');
  assert.ok(!sum.rankModels(MODELS.nvidia, spec('nvidia')).includes('nvidia/nv-embedqa-e5-v5'));
  assert.strictEqual(sum.rankModels(MODELS.groq, spec('groq'))[0], 'qwen/qwen3.8-27b');
  assert.ok(!sum.rankModels(MODELS.groq, spec('groq')).some((m) => /whisper|llama/.test(m)));
  assert.deepStrictEqual(sum.rankModels(MODELS.openrouter, spec('openrouter')), ['nvidia/nemotron-3.5-super-vl:free']);
  assert.strictEqual(sum.rankModels(MODELS.groq, spec('groq'), 'qwen/qwen3-32b')[0], 'qwen/qwen3-32b', 'an explicit, listed model wins');
});

test('one agent per paper, run in parallel across every provider at once', async () => {
  const { fetch, seen } = mockProviders();
  const res = await withFetch(fetch, () => sum.summarise(papersN(30), {
    ...quiet, env: { NVIDIA_API_KEY: 'nv', GROQ_API_KEY: 'gq', OPENROUTER_API_KEY: 'or' },
    providers: { nvidia: { concurrency: 5, rpm: 999 }, groq: { concurrency: 3, rpm: 999 }, openrouter: { concurrency: 2, rpm: 999 } },
  }));
  assert.strictEqual(res.items.length, 30);
  const total = seen.calls.nvidia + seen.calls.groq + seen.calls.openrouter;
  assert.strictEqual(total, 30, 'exactly one model call per paper');
  assert.ok(seen.calls.nvidia > 0 && seen.calls.groq > 0 && seen.calls.openrouter > 0, JSON.stringify(seen.calls));
  assert.strictEqual(seen.peak, 10, 'all 5 + 3 + 2 agents ran at the same time');
  assert.deepStrictEqual(res.items.map((i) => i.ai.headline).sort(), papersN(30).map((p) => `About ${p.title}`).sort(), 'each reply lands on its own paper');
  const groq = seen.bodies.find((b) => b.prov === 'groq');
  assert.strictEqual(groq.body.model, 'qwen/qwen3.8-27b');
  assert.strictEqual(groq.body.reasoning_effort, 'none');
  assert.strictEqual(groq.auth, 'Bearer gq');
  assert.ok(!('reasoning_effort' in seen.bodies.find((b) => b.prov === 'nvidia').body));
  assert.strictEqual(seen.bodies.find((b) => b.prov === 'nvidia').body.model, 'nvidia/nemotron-3.5-super-vl');
  assert.deepStrictEqual(Object.keys(res.providers), ['nvidia', 'groq', 'openrouter']);
  assert.strictEqual(res.providers.groq.summaries + res.providers.nvidia.summaries + res.providers.openrouter.summaries, 30);
  assert.ok(res.items.every((i) => ['nvidia', 'groq', 'openrouter'].includes(i.ai.provider)));
});

test('a dead provider is retired and the others finish its papers', async () => {
  const { fetch, seen } = mockProviders({ reply: (prov) => (prov === 'groq' ? err(401, 'Invalid API Key') : null) });
  const res = await withFetch(fetch, () => sum.summarise(papersN(12), { ...quiet, env: { NVIDIA_API_KEY: 'nv', GROQ_API_KEY: 'bad' }, providers: { nvidia: { concurrency: 3, rpm: 999 }, groq: { concurrency: 3, rpm: 999 } } }));
  assert.strictEqual(res.items.length, 12);
  assert.ok(seen.calls.groq <= 3, `groq stopped after its first failures (${seen.calls.groq})`);
  assert.match(res.providers.groq.stopped, /401/);
  assert.strictEqual(res.providers.nvidia.summaries, 12);
});

test('a paper that fails on one provider is retried on another', async () => {
  const { fetch, seen } = mockProviders({
    reply: (prov, title) => (prov === 'nvidia' && title === 'Paper 0' ? new Response(JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] }), { status: 200 }) : null),
  });
  const res = await withFetch(fetch, () => sum.summarise(papersN(1), { ...quiet, env: { NVIDIA_API_KEY: 'nv', GROQ_API_KEY: 'gq' }, providers: { nvidia: { concurrency: 1, rpm: 999 }, groq: { concurrency: 1, rpm: 999 } } }));
  assert.strictEqual(res.items.length, 1);
  assert.ok(seen.calls.nvidia >= 1, 'NVIDIA took the paper first');
  assert.strictEqual(res.items[0].ai.provider, 'groq', 'and Groq finished it');
});

test('optional provider flags are dropped if the provider rejects them', async () => {
  const { fetch, seen } = mockProviders({ reply: (prov, title, body) => (prov === 'groq' && body.reasoning_effort ? err(400, 'unknown parameter reasoning_effort') : null) });
  const res = await withFetch(fetch, () => sum.summarise(papersN(4), { ...quiet, env: { GROQ_API_KEY: 'gq' }, providers: { groq: { concurrency: 1, rpm: 999 } } }));
  assert.strictEqual(res.items.length, 4);
  assert.strictEqual(seen.bodies.filter((b) => b.body.reasoning_effort).length, 1, 'only the first request carried the flag');
});

test('each provider keeps to its own daily budget, retries included', async () => {
  let fails = 1;
  const { fetch, seen } = mockProviders({ reply: (prov, title) => (title === 'Paper 0' && fails-- > 0 ? err(503, 'busy') : null) });
  const res = await withFetch(fetch, () => sum.summarise(papersN(6), { ...quiet, env: { NVIDIA_API_KEY: 'nv' }, providers: { nvidia: { concurrency: 6, rpm: 999, daily: 5 } } }));
  assert.strictEqual(seen.calls.nvidia, 5, 'never exceeds the daily budget');
  assert.strictEqual(res.calls, 5);
  assert.strictEqual(res.items.length, 4);
  assert.ok(res.errors.includes('daily request budget used up'));
});

test('rate-limit replies wait and retry; daily quota on every model retires the provider', async () => {
  let n = 0;
  const { fetch, seen } = mockProviders({ delayMs: 2, reply: (prov) => (prov === 'groq' && n++ < 2 ? err(429, 'Rate limit reached for requests per minute') : prov === 'nvidia' ? err(429, 'Daily quota exceeded') : null) });
  const res = await withFetch(fetch, () => sum.summarise(papersN(5), { ...quiet, env: { NVIDIA_API_KEY: 'nv', GROQ_API_KEY: 'gq' }, providers: { nvidia: { concurrency: 2, rpm: 999 }, groq: { concurrency: 1, rpm: 999 } } }));
  assert.strictEqual(res.items.length, 5, 'Groq rode out its per-minute limit and finished everything');
  assert.ok(seen.calls.nvidia <= 6, `at most one try per model per agent (${seen.calls.nvidia})`);
  assert.match(res.providers.nvidia.stopped, /every model unavailable.*quota/i);
  assert.strictEqual(res.providers.groq.summaries, 5);
});

test('a model out of daily quota is set aside and the provider moves to its next model', async () => {
  const { fetch, seen } = mockProviders({ reply: (prov, title, body) => (body.model === 'qwen/qwen3.8-27b' ? err(429, 'Rate limit reached for model qwen/qwen3.8-27b on tokens per day (TPD)') : null) });
  const res = await withFetch(fetch, () => sum.summarise(papersN(4), { ...quiet, env: { GROQ_API_KEY: 'gq' }, providers: { groq: { concurrency: 1, rpm: 999 } } }));
  assert.strictEqual(res.items.length, 4);
  assert.ok(!res.providers.groq.stopped);
  const models = seen.bodies.map((b) => b.body.model);
  assert.strictEqual(models.filter((m) => m === 'qwen/qwen3.8-27b').length, 1, 'the exhausted model is not retried');
  assert.ok(models.slice(1).every((m) => m === 'qwen/qwen3-32b'), models.join());
});

test('a per-model daily allowance rotates agents across a provider\'s models', async () => {
  const lists = { data: [{ id: 'DeepSeek-V3.1' }, { id: 'DeepSeek-V3.2' }, { id: 'gpt-oss-120b' }] };
  const used = [];
  const f = async (url, init = {}) => {
    if (init.method === 'GET') return new Response(JSON.stringify(lists), { status: 200 });
    used.push(JSON.parse(init.body).model);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"headline":"h"}' } }] }), { status: 200 });
  };
  const res = await withFetch(f, () => sum.summarise(papersN(7), { ...quiet, env: { SAMBANOVA_API_KEY: 'sa' }, providers: { sambanova: { concurrency: 1, rpm: 999, modelDaily: 2 } } }));
  assert.deepStrictEqual(used, ['DeepSeek-V3.1', 'DeepSeek-V3.1', 'DeepSeek-V3.2', 'DeepSeek-V3.2', 'gpt-oss-120b', 'gpt-oss-120b']);
  assert.strictEqual(res.items.length, 6, 'six allowances across three models');
  assert.match(res.providers.sambanova.stopped, /every model unavailable/);
});

test('no key: papers are kept without summaries and no request is made', async () => {
  const res = await withFetch(() => assert.fail('no network expected'), () => sum.summarise(papersN(3), { ...quiet, env: {} }));
  assert.deepStrictEqual([res.items.length, res.calls], [0, 0]);
  assert.match(res.errors[0], /NVIDIA_API_KEY/);
});

test('new source parsers: ERIC, ClinicalTrials.gov, NASA ADS, CORE', () => {
  const [eric] = src.parseEric({ response: { docs: [{ id: 'EJ1400001', title: 'Retrieval practice in Year 9', description: 'Quizzing beat re-reading.', author: ['A. Smith'], source: 'Journal of Ed', publicationdateyear: 2026, peerreviewed: 'T' }] } }, S('eric'));
  assert.deepStrictEqual([eric.id, eric.url, eric.kind, eric.published], ['eric:EJ1400001', 'https://eric.ed.gov/?id=EJ1400001', 'journal', '']);
  const [ct] = src.parseClinicalTrials({ studies: [{ protocolSection: { identificationModule: { nctId: 'NCT01234567', briefTitle: 'Walking for sleep' }, descriptionModule: { briefSummary: 'A walking programme.' }, conditionsModule: { conditions: ['Insomnia'] }, statusModule: { resultsFirstPostDateStruct: { date: '2026-10-14' } } } }, { protocolSection: {} }] }, S('clinicaltrials', 'trial'));
  assert.deepStrictEqual([ct.id, ct.url, ct.kind, ct.published], ['nct:NCT01234567', 'https://clinicaltrials.gov/study/NCT01234567', 'trial', '2026-10-14']);
  assert.match(ct.abstract, /Conditions: Insomnia\./);
  const [ads] = src.parseAds({ response: { docs: [{ bibcode: '2026ApJ...999....1X', title: ['A new exoplanet'], abstract: 'Found a planet.', doi: ['10.3847/abc'], pubdate: '2026-10-00', pub: 'ApJ' }] } }, S('nasa-ads'));
  assert.deepStrictEqual([ads.id, ads.published, ads.venue], ['doi:10.3847/abc', '2026-10-01', 'ApJ']);
  const [core] = src.parseCore({ results: [{ id: 42, title: 'Sleep and grades', abstract: 'x', downloadUrl: 'https://core.ac.uk/download/42.pdf', publishedDate: '2026-10-15T00:00:00', authors: [{ name: 'B' }] }] }, S('core'));
  assert.deepStrictEqual([core.id, core.links.free], ['core:42', 'https://core.ac.uk/download/42.pdf']);
});

test('sources that need a key are skipped, not failed, when it is missing', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const real = global.fetch;
  global.fetch = async (url) => { assert.ok(!String(url).includes('adsabs'), 'no ADS call without a key'); return new Response('{}', { status: 200 }); };
  try { await run.main(['--only', 'nasa-ads', '--no-ai'], () => {}); } finally { global.fetch = real; }
  assert.strictEqual(process.exitCode, 1, 'a run that reaches no source fails');
  process.exitCode = 0;
  const feed = JSON.parse(fs.readFileSync(path.join(OUT, 'feed.json'), 'utf8'));
  const ads = feed.sources.find((x) => x.id === 'nasa-ads');
  assert.deepStrictEqual([ads.ok, ads.error, ads.requires], [null, 'add ADS_API_KEY to enable', 'ADS_API_KEY']);
  assert.strictEqual(feed.date, today);
});

test('Gemini, Cerebras, Mistral and SambaNova model lists resolve to the best free model', async () => {
  const lists = {
    'generativelanguage.googleapis.com': { data: [{ id: 'models/gemini-3.1-pro' }, { id: 'models/gemini-2.5-flash' }, { id: 'models/gemini-3.6-flash' }, { id: 'models/gemini-3.6-flash-lite' }, { id: 'models/text-embedding-004' }] },
    'api.cerebras.ai': { data: [{ id: 'qwen-3.8-27b' }, { id: 'gpt-oss-120b' }] },
    'api.mistral.ai': { data: [{ id: 'mistral-embed' }, { id: 'mistral-small-latest' }] },
    'api.sambanova.ai': { data: [{ id: 'Meta-Llama-3.3-70B-Instruct' }, { id: 'DeepSeek-V3.1' }, { id: 'DeepSeek-R1' }, { id: 'gpt-oss-120b' }] },
  };
  const used = {};
  const f = async (url, init = {}) => {
    const u = new URL(String(url));
    if (init.method === 'GET') {
      assert.ok(u.pathname.endsWith('/models'), u.href);
      return new Response(JSON.stringify(lists[u.host]), { status: 200 });
    }
    const body = JSON.parse(init.body);
    used[u.host] = { model: body.model, path: u.pathname, extra: body.reasoning_effort };
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"headline":"h"}' } }] }), { status: 200 });
  };
  const env = { GEMINI_API_KEY: 'ge', CEREBRAS_API_KEY: 'ce', MISTRAL_API_KEY: 'mi', SAMBANOVA_API_KEY: 'sa' };
  const res = await withFetch(f, () => sum.summarise(papersN(20), { ...quiet, env, providers: { gemini: { rpm: 999 }, cerebras: { rpm: 999 }, mistral: { rpm: 999 }, sambanova: { rpm: 999 } } }));
  assert.strictEqual(res.items.length, 20);
  assert.deepStrictEqual(used['generativelanguage.googleapis.com'], { model: 'gemini-3.6-flash', path: '/v1beta/openai/chat/completions', extra: 'low' }, 'newest Flash, never Pro');
  assert.deepStrictEqual(used['api.cerebras.ai'], { model: 'gpt-oss-120b', path: '/v1/chat/completions', extra: 'low' });
  assert.strictEqual(used['api.mistral.ai'].model, 'mistral-small-latest');
  assert.strictEqual(used['api.sambanova.ai'].model, 'DeepSeek-V3.1');
  assert.strictEqual(res.peak, 10, 'all 4 + 2 + 2 + 2 default agents ran at once');
});

test('Unpaywall and Wikipedia enrichment', async () => {
  assert.strictEqual(enrich.parseUnpaywall({ is_oa: true, best_oa_location: { url_for_pdf: 'https://repo.org/p.pdf' } }), 'https://repo.org/p.pdf');
  assert.strictEqual(enrich.parseUnpaywall({ is_oa: false }), '');
  assert.deepStrictEqual(enrich.parseWikiSummary({ type: 'standard', extract: 'Circadian rhythm is a natural 24-hour cycle. It regulates sleep.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Circadian_rhythm' } } }),
    { text: 'Circadian rhythm is a natural 24-hour cycle.', url: 'https://en.wikipedia.org/wiki/Circadian_rhythm' });
  assert.strictEqual(enrich.parseWikiSummary({ type: 'disambiguation', extract: 'x' }), null);

  const items = [{ doi: '10.1234/a', url: 'https://doi.org/10.1234/a', links: {}, ai: { key_terms: ['Circadian rhythm', 'social jet lag'] } }, { doi: '', links: {}, ai: { key_terms: ['circadian rhythm'] } }];
  assert.strictEqual(await withFetch(() => assert.fail('no email, no Unpaywall'), () => enrich.addFreeLinks(items, {})), 0);
  const calls = [];
  const f = async (url) => {
    calls.push(String(url));
    if (String(url).includes('unpaywall')) return new Response(JSON.stringify({ is_oa: true, best_oa_location: { url: 'https://repo.org/a' } }), { status: 200 });
    if (String(url).includes('Circadian')) return new Response(JSON.stringify({ type: 'standard', extract: 'A 24-hour cycle in living things.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Circadian_rhythm' } } }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  await withFetch(f, () => enrich.addFreeLinks(items, { CONTACT_EMAIL: 'me@example.org' }));
  assert.strictEqual(items[0].links.free, 'https://repo.org/a');
  assert.ok(calls[0].includes('email=me%40example.org'));
  const g = await withFetch(f, () => enrich.buildGlossary(items, { 'social jet lag': null }));
  assert.deepStrictEqual(Object.keys(g).sort(), ['circadian rhythm', 'social jet lag'], 'terms are de-duplicated case-insensitively');
  assert.strictEqual(g['circadian rhythm'].url, 'https://en.wikipedia.org/wiki/Circadian_rhythm');
  assert.strictEqual(calls.filter((c) => c.includes('wikipedia')).length, 1, 'a term already looked up is not fetched again');
});

test('end-to-end run with a mocked network writes feed, archive, index and papers', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const arxiv = ARXIV.replace('2026-10-15T17:59:59Z', `${today}T08:00:00Z`);
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push(u);
    const ok = (body, type = 'application/json') => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'content-type': type } });
    if (u.startsWith('https://export.arxiv.org/')) return ok(arxiv, 'application/atom+xml');
    if (u.includes('esearch.fcgi')) return ok({ esearchresult: { idlist: ['40000001'] } });
    if (u.includes('efetch.fcgi')) return ok(PUBMED, 'text/xml');
    if (u.startsWith('https://api.biorxiv.org/details/medrxiv/')) return ok({ messages: [{ total: 1 }], collection: [{ doi: '10.1101/2026.1', title: 'Loneliness and heart disease in older adults', abstract: 'Loneliness was linked to cardiovascular disease in a cohort.', date: today, version: '1', category: 'epidemiology', authors: 'A' }] });
    if (u.startsWith('https://www.nature.com/')) throw new Error('blocked');
    if (u === 'https://integrate.api.nvidia.com/v1/models') return ok({ data: [{ id: 'nvidia/nemotron-3.5-super-vl' }] });
    if (u === 'https://integrate.api.nvidia.com/v1/chat/completions') {
      const body = JSON.parse(init.body);
      assert.strictEqual(init.headers.Authorization, 'Bearer test-key');
      const row = { keep: true, category: 'health', headline: 'Finding', summary: 'S.', why_it_matters: 'W.', life_skill: 'Try X.', fact: 'F.', evidence: 'observational study', confidence: 'moderate', caveat: 'C.' };
      return ok({ model: body.model, choices: [{ message: { content: JSON.stringify(row) } }] });
    }
    return new Response('not found', { status: 404 });
  };
  process.env.NVIDIA_API_KEY = 'test-key';
  try {
    await run.main(['--only', 'arxiv,pubmed,medrxiv,nature', '--days', '3'], () => {});
  } finally {
    global.fetch = realFetch;
    delete process.env.NVIDIA_API_KEY;
  }
  const feed = JSON.parse(fs.readFileSync(path.join(OUT, 'feed.json'), 'utf8'));
  assert.strictEqual(feed.items.length, 3);
  assert.strictEqual(feed.model, 'nvidia/nemotron-3.5-super-vl');
  assert.strictEqual(feed.stats.providers.nvidia.summaries, 3);
  assert.ok(feed.items.every((i) => !('excerpt' in i)), 'the feed omits excerpts');
  assert.ok(feed.items.every((i) => i.ai && i.digest_date === today && !('abstract' in i)));
  const nature = feed.sources.find((s) => s.id === 'nature');
  assert.deepStrictEqual([nature.ok, typeof nature.error], [false, 'string']);
  assert.strictEqual(feed.sources.find((s) => s.id === 'pubmed').ok, true);
  assert.strictEqual(feed.sources.find((s) => s.id === 'bbc-science').ok, null, 'unqueried sources are listed as not checked');
  const index = JSON.parse(fs.readFileSync(path.join(OUT, 'archive', 'index.json'), 'utf8'));
  assert.deepStrictEqual(index.days, [{ date: today, count: 3 }]);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(OUT, 'papers.json'), 'utf8')).items.length, 3);
  assert.ok(!JSON.stringify(feed).includes('test-key'), 'the key never reaches the output');

  // A second run the same day does not re-summarise papers already in the feed.
  const before = calls.filter((c) => c.endsWith('/chat/completions')).length;
  assert.strictEqual(feed.stats.model_calls, 3, 'one call per paper');
  global.fetch = async (url) => {
    if (String(url).endsWith('/chat/completions')) assert.fail('re-summarised a seen paper');
    return new Response(String(url).includes('arxiv') ? arxiv : '{}', { status: 200 });
  };
  process.env.NVIDIA_API_KEY = 'test-key';
  try { await run.main(['--only', 'arxiv', '--days', '3'], () => {}); } finally { global.fetch = realFetch; delete process.env.NVIDIA_API_KEY; }
  assert.strictEqual(before, 3);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(OUT, 'feed.json'), 'utf8')).items.length, 3);
});

test('Cloudflare Workers AI needs an account id and resolves "@cf/" model names', async () => {
  assert.deepStrictEqual(sum.configure({ CLOUDFLARE_API_TOKEN: 't' }).map((p) => p.id), [], 'no account id, no provider');
  const [cf] = sum.configure({ CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'acc 1' });
  assert.strictEqual(cf.base, 'https://api.cloudflare.com/client/v4/accounts/acc%201/ai/v1');
  const used = [];
  const f = async (url, init = {}) => {
    const u = String(url);
    if (init.method === 'GET') {
      assert.match(u, /\/ai\/models\/search\?task=Text%20Generation/);
      return new Response(JSON.stringify({ result: [{ id: 'uuid-1', name: '@cf/meta/llama-3.1-8b-instruct' }, { id: 'uuid-2', name: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' }, { id: 'uuid-3', name: '@cf/meta/llama-guard-3-8b' }] }), { status: 200 });
    }
    used.push({ u, model: JSON.parse(init.body).model });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"headline":"h"}' } }] }), { status: 200 });
  };
  const res = await withFetch(f, () => sum.summarise(papersN(2), { ...quiet, env: { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'acc1' }, providers: { cloudflare: { rpm: 999 } } }));
  assert.strictEqual(res.items.length, 2);
  assert.deepStrictEqual(used[0], { u: 'https://api.cloudflare.com/client/v4/accounts/acc1/ai/v1/chat/completions', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' });
});

test('reasoning models are asked not to think out loud', () => {
  const groq = sum.PROVIDERS.find((p) => p.id === 'groq');
  const nvidia = sum.PROVIDERS.find((p) => p.id === 'nvidia');
  const cerebras = sum.PROVIDERS.find((p) => p.id === 'cerebras');
  assert.strictEqual(sum.thinkingSuffix('nvidia/nemotron-3.5-super-vl'), '\n/no_think');
  assert.strictEqual(sum.thinkingSuffix('qwen/qwen3.8-27b'), '\n/no_think');
  assert.strictEqual(sum.thinkingSuffix('llama-3.3-70b'), '');
  assert.deepStrictEqual(sum.extrasFor(nvidia, 'nvidia/nemotron-3.5-super-vl'), { chat_template_kwargs: { enable_thinking: false } });
  assert.deepStrictEqual(sum.extrasFor(groq, 'qwen/qwen3.8-27b'), { reasoning_effort: 'none' });
  assert.deepStrictEqual(sum.extrasFor(cerebras, 'gpt-oss-120b'), { reasoning_effort: 'low' });
  assert.deepStrictEqual(sum.extrasFor(cerebras, 'llama-3.3-70b'), {});
});

test('archive keeps 180 days and stores no abstract text', async () => {
  const arch = path.join(OUT, 'archive');
  fs.mkdirSync(arch, { recursive: true });
  const old = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10);
  const recentDay = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
  for (const d of [old, recentDay]) fs.writeFileSync(path.join(arch, `${d}.json`), JSON.stringify({ items: [] }));
  const index = JSON.parse(fs.readFileSync(path.join(arch, 'index.json'), 'utf8'));
  fs.writeFileSync(path.join(arch, 'index.json'), JSON.stringify({ schema: 1, days: [...index.days, { date: recentDay, count: 0 }, { date: old, count: 0 }] }));
  const today = new Date().toISOString().slice(0, 10);
  const doc = `<feed><entry><id>http://arxiv.org/abs/2610.09999v1</id><published>${today}T08:00:00Z</published><title>Sleep and memory in older adults</title><summary>Sleep, memory and depression in a cohort of 5,000 adults.</summary></entry></feed>`;
  const f = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://export.arxiv.org/')) return new Response(doc, { status: 200 });
    if (u.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'nvidia/nemotron-3.5-super-vl' }] }), { status: 200 });
    if (u.endsWith('/chat/completions')) return new Response(JSON.stringify({ choices: [{ message: { content: '{"headline":"h","category":"health"}' } }] }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  process.env.NVIDIA_API_KEY = 'k';
  try { await withFetch(f, () => run.main(['--only', 'arxiv', '--days', '3'], () => {})); } finally { delete process.env.NVIDIA_API_KEY; }
  assert.ok(!fs.existsSync(path.join(arch, `${old}.json`)), 'the 200-day-old file is removed');
  assert.ok(fs.existsSync(path.join(arch, `${recentDay}.json`)), 'a 20-day-old file stays');
  const days = JSON.parse(fs.readFileSync(path.join(arch, 'index.json'), 'utf8')).days.map((d) => d.date);
  assert.ok(!days.includes(old) && days.includes(recentDay) && days.includes(today));
  const todays = JSON.parse(fs.readFileSync(path.join(arch, `${today}.json`), 'utf8')).items;
  assert.ok(todays.length && todays.every((i) => !('abstract' in i) && !('excerpt' in i)));
});

test('run args are bounded, and the default batch grows with the providers available', () => {
  assert.deepStrictEqual(run.args(['--days', '999', '--max', 'x'], {}).days, 2);
  assert.strictEqual(run.args(['--max', '10'], {}).max, 10);
  assert.strictEqual(run.args([], { OPENROUTER_API_KEY: 'k' }).max, 40);
  assert.strictEqual(run.args([], { GROQ_API_KEY: 'k' }).max, 120);
});
