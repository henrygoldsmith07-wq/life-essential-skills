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
process.env.RESEARCH_GAP_MS = '0';

const lib = require('../scripts/research/lib');
const src = require('../scripts/research/sources');
const sum = require('../scripts/research/summarise');
const run = require('../scripts/research/run');

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
  assert.deepStrictEqual(sum.parseJson('<think>hmm</think>```json\n{"items":[{"n":1}]}\n```'), [{ n: 1 }]);
  assert.deepStrictEqual(sum.parseJson('Here you go: [{"n":2}] thanks'), [{ n: 2 }]);
  assert.deepStrictEqual(sum.parseJson('nope'), []);
  const batch = [
    { id: 'p1', title: 'A', kind: 'preprint', _category: 'health' },
    { id: 'p2', title: 'B', kind: 'journal' },
    { id: 'p3', title: 'C', kind: 'journal' },
  ];
  const out = sum.applySummaries(batch, [
    { n: 1, keep: true, category: 'nonsense', headline: '<b>Short</b> sleep is linked to worse mood', summary: 's', life_skill: 'Try a regular bedtime.', fact: '', evidence: 'observational', confidence: 'HIGH', caveat: 'Preprint.' },
    { n: 2, keep: false, headline: 'skip me' },
    { n: 3, headline: '' },
    { n: 9, headline: 'no such paper' },
  ], 'm');
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].ai.headline, 'Short sleep is linked to worse mood');
  assert.strictEqual(out[0].category, 'health');
  assert.strictEqual(out[0].ai.evidence, 'observational study');
  assert.strictEqual(out[0].ai.confidence, 'moderate', 'a preprint is never high confidence');
  const p = sum.prompt(batch);
  assert.match(p, /#1\nTitle: A/);
  assert.match(p, /not yet peer reviewed/);
});

test('model resolution prefers the requested slug, else the closest free Nemotron Super', () => {
  const ids = ['openai/gpt-x', 'nvidia/nemotron-nano-9b-v2:free', 'nvidia/nemotron-3.5-super-vl:free', 'nvidia/nemotron-3.5-super-vl'];
  assert.strictEqual(sum.rankModels(ids, 'nvidia/nemotron-3.5-super-vl:free')[0], 'nvidia/nemotron-3.5-super-vl:free');
  assert.strictEqual(sum.rankModels(ids, 'nvidia/renamed:free')[0], 'nvidia/nemotron-3.5-super-vl:free');
  assert.ok(sum.rankModels(ids, 'x').every((m) => m.endsWith(':free')));
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
    if (u === 'https://openrouter.ai/api/v1/models') return ok({ data: [{ id: 'nvidia/nemotron-3.5-super-vl:free' }] });
    if (u === 'https://openrouter.ai/api/v1/chat/completions') {
      const body = JSON.parse(init.body);
      assert.strictEqual(init.headers.Authorization, 'Bearer test-key');
      const n = (body.messages[1].content.match(/^#\d+$/gm) || []).length;
      const items = Array.from({ length: n }, (_, i) => ({ n: i + 1, keep: true, category: 'health', headline: `Finding ${i + 1}`, summary: 'S.', why_it_matters: 'W.', life_skill: 'Try X.', fact: 'F.', evidence: 'observational study', confidence: 'moderate', caveat: 'C.' }));
      return ok({ model: body.model, choices: [{ message: { content: JSON.stringify({ items }) } }] });
    }
    return new Response('not found', { status: 404 });
  };
  process.env.OPENROUTER_API_KEY = 'test-key';
  try {
    await run.main(['--only', 'arxiv,pubmed,medrxiv,nature', '--days', '3'], () => {});
  } finally {
    global.fetch = realFetch;
    delete process.env.OPENROUTER_API_KEY;
  }
  const feed = JSON.parse(fs.readFileSync(path.join(OUT, 'feed.json'), 'utf8'));
  assert.strictEqual(feed.items.length, 3);
  assert.strictEqual(feed.model, 'nvidia/nemotron-3.5-super-vl:free');
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
  global.fetch = async (url) => {
    if (String(url).endsWith('/chat/completions')) assert.fail('re-summarised a seen paper');
    return new Response(String(url).includes('arxiv') ? arxiv : '{}', { status: 200 });
  };
  process.env.OPENROUTER_API_KEY = 'test-key';
  try { await run.main(['--only', 'arxiv', '--days', '3'], () => {}); } finally { global.fetch = realFetch; delete process.env.OPENROUTER_API_KEY; }
  assert.strictEqual(before, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(OUT, 'feed.json'), 'utf8')).items.length, 3);
});

test('run args are bounded', () => {
  assert.deepStrictEqual(run.args(['--days', '999', '--max', 'x']).days, 2);
  assert.strictEqual(run.args(['--max', '10']).max, 10);
});
