// Research sources for the daily digest. Each adapter fetches recent work from
// one free, key-less public API or feed and returns normalised items (see
// lib.makeItem). Parsers are separate pure functions so they can be tested
// against fixtures without network access. A failing source never fails the
// run: its error is recorded in the feed's source-health list instead.
//
// alphaXiv and Elicit have no free public API. alphaXiv discusses arXiv
// papers, so every arXiv item links to its alphaXiv discussion page; Elicit
// searches the Semantic Scholar / OpenAlex corpus, which is pulled directly.
'use strict';

const { blocks, first, attrs, cleanText, makeItem, fetchText, fetchJson, sleep, isoDate } = require('./lib');

// ---- arXiv (+ alphaXiv discussion links) -------------------------------------

const ARXIV_CATS = ['cs.CY', 'cs.HC', 'cs.AI', 'cs.CR', 'econ.GN', 'q-bio.NC', 'q-bio.PE', 'physics.soc-ph', 'physics.pop-ph', 'stat.AP', 'q-fin.GN', 'astro-ph.EP'];

function arxivLinks(id) {
  return { alphaxiv: `https://www.alphaxiv.org/abs/${id}`, pdf: `https://arxiv.org/pdf/${id}` };
}

function parseArxiv(xml, source) {
  return blocks(xml, 'entry').map((entry) => {
    const absUrl = cleanText(first(entry, 'id'));
    const id = (absUrl.match(/abs\/([^\s]+?)(v\d+)?$/) || [])[1];
    if (!id) return null;
    return makeItem(source, {
      id: `arxiv:${id}`,
      title: first(entry, 'title'),
      abstract: first(entry, 'summary'),
      url: `https://arxiv.org/abs/${id}`,
      links: arxivLinks(id),
      doi: cleanText(first(entry, 'doi')),
      venue: attrs(entry, 'primary_category', 'term')[0]?.value || 'arXiv',
      authors: blocks(entry, 'author').map((a) => first(a, 'name')),
      published: cleanText(first(entry, 'published')),
    });
  }).filter(Boolean);
}

// ---- Hugging Face Daily Papers (community-curated arXiv) ----------------------

function parseHfDaily(json, source) {
  return (Array.isArray(json) ? json : []).map((row) => {
    const p = row.paper || row;
    if (!p.id) return null;
    return makeItem(source, {
      id: `arxiv:${p.id}`,
      title: p.title || row.title,
      abstract: p.summary || row.summary,
      url: `https://arxiv.org/abs/${p.id}`,
      links: { ...arxivLinks(p.id), discussion: `https://huggingface.co/papers/${p.id}` },
      authors: (p.authors || []).map((a) => a.name),
      published: p.publishedAt || row.publishedAt,
      venue: 'arXiv',
    });
  }).filter(Boolean);
}

// ---- Semantic Scholar --------------------------------------------------------

function parseSemanticScholar(json, source) {
  return (json.data || []).map((p) => {
    const ext = p.externalIds || {};
    const id = ext.DOI ? undefined : ext.ArXiv ? `arxiv:${ext.ArXiv}` : `s2:${p.paperId}`;
    return makeItem(source, {
      id,
      title: p.title,
      abstract: p.abstract || p.tldr?.text,
      url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
      links: { semanticscholar: p.paperId ? `https://www.semanticscholar.org/paper/${p.paperId}` : '', ...(ext.ArXiv ? arxivLinks(ext.ArXiv) : {}) },
      doi: ext.DOI,
      venue: p.venue,
      authors: (p.authors || []).map((a) => a.name),
      published: p.publicationDate,
      kind: (p.publicationTypes || []).some((t) => /review|meta/i.test(t)) ? 'review' : undefined,
    });
  }).filter(Boolean);
}

// ---- OpenAlex ------------------------------------------------------------------

function invertedToText(inv) {
  if (!inv || typeof inv !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(inv)) for (const pos of positions) words[pos] = word;
  return words.filter((w) => w !== undefined).join(' ');
}

function parseOpenAlex(json, source) {
  return (json.results || []).map((w) => makeItem(source, {
    id: w.doi ? undefined : `openalex:${String(w.id).split('/').pop()}`,
    title: w.title || w.display_name,
    abstract: invertedToText(w.abstract_inverted_index),
    url: w.primary_location?.landing_page_url || w.doi || w.id,
    links: { openalex: w.id },
    doi: w.doi,
    venue: w.primary_location?.source?.display_name,
    authors: (w.authorships || []).map((a) => a.author?.display_name),
    published: w.publication_date,
    kind: w.type === 'review' ? 'review' : w.type === 'preprint' ? 'preprint' : 'journal',
  })).filter(Boolean);
}

// ---- PubMed / Cochrane (NCBI E-utilities) ----------------------------------------

const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

function pubmedDate(article) {
  const d = first(article, 'ArticleDate') || first(article, 'PubDate');
  const y = cleanText(first(d, 'Year'));
  if (!y) return '';
  let m = cleanText(first(d, 'Month')).toLowerCase();
  m = MONTHS[m.slice(0, 3)] || (m ? m.padStart(2, '0') : '01');
  const day = cleanText(first(d, 'Day')).padStart(2, '0') || '01';
  return `${y}-${m}-${day === '00' ? '01' : day}`;
}

function parsePubmed(xml, source, { cochrane = false } = {}) {
  return blocks(xml, 'PubmedArticle').map((art) => {
    const pmid = cleanText(first(art, 'PMID'));
    if (!pmid) return null;
    // The first ArticleIdList is the article's own; later ones belong to its references.
    const doi = (first(art, 'ArticleIdList').match(/<ArticleId\s+IdType="doi"\s*>([^<]+)</i) || [])[1]
      || (art.match(/<ELocationID[^>]*EIdType="doi"[^>]*>([^<]+)</i) || [])[1] || '';
    const abstract = [...first(art, 'Abstract').matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/gi)].map(([, attr, text]) => {
      const label = (attr.match(/Label="([^"]*)"/i) || [])[1];
      return label ? `${cleanText(label)}: ${cleanText(text)}` : cleanText(text);
    }).join(' ');
    const types = blocks(art, 'PublicationType').map(cleanText).join(' ');
    const doiClean = cleanText(doi);
    const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
    return makeItem(source, {
      id: `pmid:${pmid}`,
      title: first(art, 'ArticleTitle'),
      abstract,
      url: cochrane && doiClean ? `https://www.cochranelibrary.com/cdsr/doi/${doiClean}/full` : pubmedUrl,
      links: { pubmed: pubmedUrl },
      doi: doiClean,
      venue: first(first(art, 'Journal'), 'Title'),
      authors: blocks(art, 'Author').map((a) => `${cleanText(first(a, 'ForeName')) || cleanText(first(a, 'Initials'))} ${cleanText(first(a, 'LastName'))}`.trim()),
      published: pubmedDate(art),
      kind: cochrane || /systematic review|meta-analysis/i.test(types) ? 'review' : /randomized controlled trial/i.test(types) ? 'trial' : 'journal',
    });
  }).filter(Boolean);
}

const PUBMED_TOPICS = ['sleep', 'exercise', '"physical activity"', 'diet', 'nutrition', '"mental health"', 'depression', 'anxiety', 'loneliness', 'wellbeing', 'stress', 'alcohol', 'smoking', '"screen time"', '"social media"', 'learning', 'memory', 'ageing', 'dementia', '"blood pressure"', 'obesity', 'financial', 'parenting', '"air pollution"', 'vaccination', 'injury'];

async function eutils(ctx, term, retmax) {
  const common = `tool=life-essential-skills${ctx.env.CONTACT_EMAIL ? `&email=${encodeURIComponent(ctx.env.CONTACT_EMAIL)}` : ''}${ctx.env.NCBI_API_KEY ? `&api_key=${encodeURIComponent(ctx.env.NCBI_API_KEY)}` : ''}`;
  const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  const search = await fetchJson(`${base}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${retmax}&term=${encodeURIComponent(term)}&${common}`);
  const ids = search.esearchresult?.idlist || [];
  if (!ids.length) return '';
  await sleep(400);
  return fetchText(`${base}/efetch.fcgi?db=pubmed&retmode=xml&rettype=abstract&id=${ids.join(',')}&${common}`, { timeoutMs: 40000 });
}

const ncbiRange = (from, to) => `("${from.replace(/-/g, '/')}"[edat] : "${to.replace(/-/g, '/')}"[edat])`;

// ---- Europe PMC preprints (Research Square, SSRN, Preprints.org, …) -------------

function parseEuropePmc(json, source) {
  return (json.resultList?.result || []).map((r) => makeItem(source, {
    id: r.doi ? undefined : `epmc:${r.source}:${r.id}`,
    title: r.title,
    abstract: r.abstractText,
    url: `https://europepmc.org/article/${r.source}/${r.id}`,
    links: { europepmc: `https://europepmc.org/article/${r.source}/${r.id}` },
    doi: r.doi,
    venue: r.bookOrReportDetails?.publisher || r.journalInfo?.journal?.title,
    source_name: r.bookOrReportDetails?.publisher ? `${r.bookOrReportDetails.publisher} (via Europe PMC)` : undefined,
    authors: String(r.authorString || '').split(/,\s*/),
    published: r.firstPublicationDate,
    kind: 'preprint',
  })).filter((i) => i && !/medrxiv|biorxiv/i.test(i.venue));
}

// ---- medRxiv / bioRxiv -------------------------------------------------------------

function parseBiorxiv(json, source, server) {
  return (json.collection || []).map((p) => makeItem(source, {
    title: p.title,
    abstract: p.abstract,
    url: `https://www.${server}.org/content/${p.doi}v${p.version || 1}`,
    doi: p.doi,
    venue: `${source.name} · ${p.category || ''}`.replace(/ · $/, ''),
    authors: String(p.authors || '').split(/;\s*/),
    published: p.date,
    kind: 'preprint',
  })).filter(Boolean);
}

// ---- PLOS --------------------------------------------------------------------------

function parsePlos(json, source) {
  return (json.response?.docs || []).map((d) => makeItem(source, {
    title: d.title_display,
    abstract: Array.isArray(d.abstract) ? d.abstract.join(' ') : d.abstract,
    doi: d.id,
    url: `https://doi.org/${d.id}`,
    venue: d.journal,
    authors: d.author_display || [],
    published: d.publication_date,
    kind: 'journal',
  })).filter(Boolean);
}

// ---- DOAJ (open-access journals) -----------------------------------------------------

function parseDoaj(json, source) {
  return (json.results || []).map((r) => {
    const b = r.bibjson || {};
    const doi = (b.identifier || []).find((x) => String(x.type).toLowerCase() === 'doi')?.id;
    return makeItem(source, {
      title: b.title,
      abstract: b.abstract,
      doi,
      url: (b.link || []).find((l) => l.type === 'fulltext')?.url || (doi ? `https://doi.org/${doi}` : ''),
      venue: b.journal?.title,
      authors: (b.author || []).map((a) => a.name),
      published: r.created_date,
      kind: 'journal',
    });
  }).filter(Boolean);
}

// ---- OSF preprints (PsyArXiv, SocArXiv, EdArXiv, MetaArXiv) ---------------------------

const OSF_PROVIDERS = { psyarxiv: 'PsyArXiv', socarxiv: 'SocArXiv', edarxiv: 'EdArXiv', metaarxiv: 'MetaArXiv' };

function parseOsf(json, source, provider) {
  return (json.data || []).map((p) => {
    const a = p.attributes || {};
    return makeItem(source, {
      id: a.doi ? undefined : `osf:${p.id}`,
      title: a.title,
      abstract: a.description,
      url: p.links?.html || `https://osf.io/${p.id}`,
      doi: a.doi || p.links?.preprint_doi,
      venue: OSF_PROVIDERS[provider],
      source_name: OSF_PROVIDERS[provider],
      published: a.date_published || a.date_created,
      kind: 'preprint',
    });
  }).filter(Boolean);
}

// ---- ChemRxiv ----------------------------------------------------------------------------

function parseChemrxiv(json, source) {
  return (json.itemHits || []).map(({ item }) => item && makeItem(source, {
    title: item.title,
    abstract: item.abstract,
    doi: item.doi,
    url: `https://chemrxiv.org/engage/chemrxiv/article-details/${item.id}`,
    venue: 'ChemRxiv',
    authors: (item.authors || []).map((a) => `${a.firstName || ''} ${a.lastName || ''}`),
    published: item.publishedDate,
    kind: 'preprint',
  })).filter(Boolean);
}

// ---- ERIC (education research, US Institute of Education Sciences) ----------------------

function parseEric(json, source) {
  return ((json.response && json.response.docs) || []).map((d) => makeItem(source, {
    id: `eric:${d.id}`,
    title: d.title,
    abstract: d.description,
    url: `https://eric.ed.gov/?id=${encodeURIComponent(d.id)}`,
    doi: Array.isArray(d.doi) ? d.doi[0] : d.doi,
    venue: d.source,
    authors: d.author || [],
    // ERIC gives a publication year only, so no day is invented here.
    kind: String(d.peerreviewed).toUpperCase() === 'T' ? 'journal' : 'preprint',
  })).filter(Boolean);
}

// ---- ClinicalTrials.gov (trials that just posted results) ------------------------------------

function parseClinicalTrials(json, source) {
  return (json.studies || []).map((st) => {
    const p = st.protocolSection || {};
    const id = p.identificationModule || {};
    if (!id.nctId) return null;
    const conds = (p.conditionsModule && p.conditionsModule.conditions) || [];
    return makeItem(source, {
      id: `nct:${id.nctId}`,
      title: id.briefTitle || id.officialTitle,
      abstract: [(p.descriptionModule && p.descriptionModule.briefSummary) || '', conds.length ? `Conditions: ${conds.join(', ')}.` : ''].join(' '),
      url: `https://clinicaltrials.gov/study/${id.nctId}`,
      venue: 'ClinicalTrials.gov · results posted',
      published: p.statusModule && p.statusModule.resultsFirstPostDateStruct && p.statusModule.resultsFirstPostDateStruct.date,
      kind: 'trial',
    });
  }).filter(Boolean);
}

// ---- NASA ADS (astronomy and space; needs a free key) -----------------------------------------

function parseAds(json, source) {
  return ((json.response && json.response.docs) || []).map((d) => makeItem(source, {
    id: d.doi && d.doi[0] ? undefined : `ads:${d.bibcode}`,
    title: Array.isArray(d.title) ? d.title[0] : d.title,
    abstract: d.abstract,
    url: `https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(d.bibcode)}/abstract`,
    doi: d.doi && d.doi[0],
    venue: d.pub,
    authors: d.author || [],
    published: d.pubdate && d.pubdate.replace(/-00/g, '-01'),
    kind: 'journal',
  })).filter(Boolean);
}

// ---- CORE (UK open-access aggregator; needs a free key) ------------------------------------------

function parseCore(json, source) {
  return (json.results || []).map((w) => makeItem(source, {
    id: w.doi ? undefined : `core:${w.id}`,
    title: w.title,
    abstract: w.abstract,
    url: `https://core.ac.uk/works/${w.id}`,
    links: { free: w.downloadUrl },
    doi: w.doi,
    venue: (w.journals && w.journals[0] && w.journals[0].title) || w.publisher,
    authors: (w.authors || []).map((a) => a.name),
    published: w.publishedDate,
    kind: 'journal',
  })).filter(Boolean);
}

// ---- RSS / Atom / RDF feeds (journals, science news) ------------------------------------

function parseFeed(xml, source) {
  const entries = blocks(xml, 'item');
  const atom = !entries.length;
  return (atom ? blocks(xml, 'entry') : entries).slice(0, 60).map((e) => {
    let link = cleanText(first(e, 'link'));
    if (!link || atom) {
      const hrefs = attrs(e, 'link', 'href');
      link = (hrefs.find((h) => /rel\s*=\s*["']alternate/i.test(h.tag)) || hrefs.find((h) => !/rel\s*=/i.test(h.tag)) || hrefs[0] || {}).value || link;
    }
    const doiText = cleanText(first(e, 'doi')) || cleanText(first(e, 'identifier')).replace(/^doi:\s*/i, '');
    return makeItem(source, {
      id: undefined,
      title: first(e, 'title'),
      abstract: first(e, 'description') || first(e, 'summary') || first(e, 'encoded') || first(e, 'content'),
      url: link || cleanText(first(e, 'guid')),
      doi: doiText,
      venue: source.name,
      authors: blocks(e, 'creator').concat(blocks(e, 'author').map((a) => first(a, 'name') || a)),
      published: cleanText(first(e, 'pubDate')) || cleanText(first(e, 'date')) || cleanText(first(e, 'published')) || cleanText(first(e, 'updated')),
    });
  }).filter(Boolean);
}

const recent = (items, from) => items.filter((i) => !i.published || i.published >= from);

// ---- Source registry ------------------------------------------------------------------------

function feed(id, name, url, kind, opts = {}) {
  return { id, name, kind, home: opts.home || new URL(url).origin, general: kind === 'news' || opts.general, group: kind === 'news' ? 'Science news' : 'Journals', fetch: async (ctx) => recent(parseFeed(await fetchText(url), { id, name, kind }), ctx.feedFrom) };
}

const SOURCES = [
  {
    id: 'arxiv', name: 'arXiv', kind: 'preprint', group: 'Preprint servers', home: 'https://arxiv.org',
    fetch: async (ctx) => {
      const q = ARXIV_CATS.map((c) => `cat:${c}`).join(' OR ');
      const xml = await fetchText(`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}&sortBy=submittedDate&sortOrder=descending&start=0&max_results=150`, { timeoutMs: 45000 });
      return recent(parseArxiv(xml, { id: 'arxiv', name: 'arXiv', kind: 'preprint' }), ctx.feedFrom);
    },
  },
  {
    id: 'hf-daily-papers', name: 'Hugging Face Daily Papers', kind: 'preprint', group: 'Preprint servers', home: 'https://huggingface.co/papers',
    fetch: async (ctx) => recent(parseHfDaily(await fetchJson('https://huggingface.co/api/daily_papers?limit=50'), { id: 'hf-daily-papers', name: 'Hugging Face Daily Papers', kind: 'preprint' }), ctx.feedFrom),
  },
  {
    id: 'semanticscholar', name: 'Semantic Scholar', kind: 'journal', group: 'Scholarly indexes', home: 'https://www.semanticscholar.org',
    fetch: async (ctx) => {
      const queries = ['sleep health', 'mental health wellbeing', 'personal finance household debt', 'learning memory study', 'misinformation decision making', 'physical activity exercise', 'diet nutrition', 'loneliness social relationships', 'online scams cybersecurity users'];
      const headers = ctx.env.S2_API_KEY ? { 'x-api-key': ctx.env.S2_API_KEY } : {};
      const out = [];
      const errors = [];
      for (const q of queries) {
        try {
          const json = await fetchJson(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&publicationDateOrYear=${ctx.from}:${ctx.to}&fields=title,abstract,url,publicationDate,externalIds,venue,authors,publicationTypes&limit=20`, { headers, retries: 2 });
          out.push(...parseSemanticScholar(json, { id: 'semanticscholar', name: 'Semantic Scholar', kind: 'journal' }));
        } catch (e) { errors.push(e.message); }
        await sleep(ctx.env.S2_API_KEY ? 1100 : 3000);
      }
      if (!out.length && errors.length) throw new Error(errors[0]);
      return out;
    },
  },
  {
    id: 'openalex', name: 'OpenAlex', kind: 'journal', group: 'Scholarly indexes', home: 'https://openalex.org',
    fetch: async (ctx) => {
      const auth = ctx.env.OPENALEX_API_KEY ? `&api_key=${encodeURIComponent(ctx.env.OPENALEX_API_KEY)}` : ctx.env.CONTACT_EMAIL ? `&mailto=${encodeURIComponent(ctx.env.CONTACT_EMAIL)}` : '';
      const queries = ['sleep', 'mental health', 'financial wellbeing', 'learning', 'misinformation', 'physical activity', 'nutrition', 'loneliness', 'climate adaptation', 'artificial intelligence society'];
      const out = [];
      const errors = [];
      for (const q of queries) {
        try {
          const json = await fetchJson(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&filter=from_publication_date:${ctx.from},to_publication_date:${ctx.to},has_abstract:true&per_page=15${auth}`);
          out.push(...parseOpenAlex(json, { id: 'openalex', name: 'OpenAlex', kind: 'journal' }));
        } catch (e) { errors.push(e.message); }
        await sleep(300);
      }
      if (!out.length && errors.length) throw new Error(errors[0]);
      return out;
    },
  },
  {
    id: 'pubmed', name: 'PubMed', kind: 'journal', group: 'Medicine and health', home: 'https://pubmed.ncbi.nlm.nih.gov',
    fetch: async (ctx) => {
      const term = `${ncbiRange(ctx.from, ctx.to)} AND hasabstract AND english[la] AND (systematic review[pt] OR meta-analysis[pt] OR randomized controlled trial[pt] OR cohort studies[mh]) AND (${PUBMED_TOPICS.map((t) => `${t}[tiab]`).join(' OR ')})`;
      return parsePubmed(await eutils(ctx, term, 80), { id: 'pubmed', name: 'PubMed', kind: 'journal' });
    },
  },
  {
    id: 'cochrane', name: 'Cochrane Library', kind: 'review', group: 'Medicine and health', home: 'https://www.cochranelibrary.com',
    // Cochrane has no free API; its reviews are indexed in PubMed under the
    // Cochrane Database of Systematic Reviews and link back to the Library.
    fetch: async (ctx) => parsePubmed(await eutils(ctx, `"Cochrane Database Syst Rev"[ta] AND ${ncbiRange(ctx.weekFrom, ctx.to)}`, 40), { id: 'cochrane', name: 'Cochrane Library', kind: 'review' }, { cochrane: true }),
  },
  {
    id: 'medrxiv', name: 'medRxiv', kind: 'preprint', group: 'Preprint servers', home: 'https://www.medrxiv.org',
    fetch: async (ctx) => biorxivPages(ctx, 'medrxiv', 'medRxiv'),
  },
  {
    id: 'biorxiv', name: 'bioRxiv', kind: 'preprint', group: 'Preprint servers', home: 'https://www.biorxiv.org',
    fetch: async (ctx) => biorxivPages(ctx, 'biorxiv', 'bioRxiv'),
  },
  {
    id: 'europepmc', name: 'Europe PMC preprints', kind: 'preprint', group: 'Preprint servers', home: 'https://europepmc.org',
    fetch: async (ctx) => {
      const q = `SRC:PPR AND FIRST_PDATE:[${ctx.from} TO ${ctx.to}] AND HAS_ABSTRACT:y`;
      return parseEuropePmc(await fetchJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&resultType=core&format=json&pageSize=100`, { timeoutMs: 40000 }), { id: 'europepmc', name: 'Europe PMC preprints', kind: 'preprint' });
    },
  },
  {
    id: 'osf', name: 'OSF Preprints (PsyArXiv, SocArXiv, EdArXiv, MetaArXiv)', kind: 'preprint', group: 'Preprint servers', home: 'https://osf.io/preprints',
    fetch: async (ctx) => {
      const out = [];
      const errors = [];
      for (const provider of Object.keys(OSF_PROVIDERS)) {
        try {
          const json = await fetchJson(`https://api.osf.io/v2/preprints/?filter[provider]=${provider}&filter[date_created][gte]=${ctx.from}&page[size]=50&sort=-date_created`);
          out.push(...parseOsf(json, { id: 'osf', name: 'OSF Preprints', kind: 'preprint' }, provider));
        } catch (e) { errors.push(`${provider}: ${e.message}`); }
      }
      if (!out.length && errors.length) throw new Error(errors.join('; '));
      return out;
    },
  },
  {
    id: 'plos', name: 'PLOS journals', kind: 'journal', group: 'Journals', home: 'https://plos.org',
    fetch: async (ctx) => {
      const q = `publication_date:[${ctx.from}T00:00:00Z TO ${ctx.to}T23:59:59Z]`;
      const fq = 'doc_type:full AND article_type:"Research Article"';
      return parsePlos(await fetchJson(`https://api.plos.org/search?q=${encodeURIComponent(q)}&fq=${encodeURIComponent(fq)}&fl=id,title_display,abstract,journal,publication_date,author_display&rows=100&wt=json`), { id: 'plos', name: 'PLOS journals', kind: 'journal' });
    },
  },
  {
    id: 'doaj', name: 'DOAJ (open-access journals)', kind: 'journal', group: 'Scholarly indexes', home: 'https://doaj.org',
    fetch: async (ctx) => {
      const q = '"mental health" OR sleep OR nutrition OR "physical activity" OR "financial literacy" OR loneliness OR wellbeing OR misinformation';
      return recent(parseDoaj(await fetchJson(`https://doaj.org/api/search/articles/${encodeURIComponent(q)}?page=1&pageSize=50&sort=created_date:desc`), { id: 'doaj', name: 'DOAJ (open-access journals)', kind: 'journal' }), ctx.from);
    },
  },
  {
    id: 'chemrxiv', name: 'ChemRxiv', kind: 'preprint', group: 'Preprint servers', home: 'https://chemrxiv.org',
    fetch: async (ctx) => recent(parseChemrxiv(await fetchJson(`https://chemrxiv.org/engage/chemrxiv/public-api/v1/items?limit=50&sort=PUBLISHED_DATE_DESC&searchDateFrom=${ctx.from}T00:00:00.000Z`), { id: 'chemrxiv', name: 'ChemRxiv', kind: 'preprint' }), ctx.from),
  },
  {
    id: 'eric', name: 'ERIC (education research)', kind: 'journal', group: 'Scholarly indexes', home: 'https://eric.ed.gov',
    fetch: async (ctx) => {
      const year = ctx.to.slice(0, 4);
      const topics = '"retrieval practice" OR "study skills" OR "self-regulated learning" OR motivation OR "financial literacy" OR "reading comprehension" OR "student wellbeing" OR procrastination OR feedback';
      const q = `(${topics}) AND publicationdateyear:${year} AND peerreviewed:T`;
      return parseEric(await fetchJson(`https://api.ies.ed.gov/eric/?search=${encodeURIComponent(q)}&format=json&rows=60&fields=id,title,description,author,source,publicationdateyear,peerreviewed,doi`), { id: 'eric', name: 'ERIC (education research)', kind: 'journal' });
    },
  },
  {
    id: 'clinicaltrials', name: 'ClinicalTrials.gov (new results)', kind: 'trial', group: 'Medicine and health', home: 'https://clinicaltrials.gov',
    fetch: async (ctx) => {
      // Behavioural trials (exercise, sleep, therapy, habits) are the ones with everyday takeaways.
      const adv = `AREA[ResultsFirstPostDate]RANGE[${ctx.weekFrom},MAX] AND AREA[InterventionType]BEHAVIORAL`;
      return parseClinicalTrials(await fetchJson(`https://clinicaltrials.gov/api/v2/studies?filter.advanced=${encodeURIComponent(adv)}&pageSize=60&format=json`), { id: 'clinicaltrials', name: 'ClinicalTrials.gov (new results)', kind: 'trial' });
    },
  },
  {
    id: 'nasa-ads', name: 'NASA ADS (astronomy)', kind: 'journal', group: 'Scholarly indexes', home: 'https://ui.adsabs.harvard.edu', requires: 'ADS_API_KEY',
    fetch: async (ctx) => {
      const q = `entdate:[${ctx.from} TO ${ctx.to}] property:refereed collection:astronomy`;
      const json = await fetchJson(`https://api.adsabs.harvard.edu/v1/search/query?q=${encodeURIComponent(q)}&fl=bibcode,title,abstract,doi,pubdate,author,pub&rows=50&sort=${encodeURIComponent('date desc')}`, { headers: { Authorization: `Bearer ${ctx.env.ADS_API_KEY}` } });
      return parseAds(json, { id: 'nasa-ads', name: 'NASA ADS (astronomy)', kind: 'journal' });
    },
  },
  {
    id: 'core', name: 'CORE (open-access papers)', kind: 'journal', group: 'Scholarly indexes', home: 'https://core.ac.uk', requires: 'CORE_API_KEY',
    fetch: async (ctx) => {
      const q = `(sleep OR wellbeing OR "mental health" OR "physical activity" OR nutrition OR "financial literacy" OR loneliness OR misinformation) AND yearPublished>=${ctx.to.slice(0, 4)}`;
      const json = await fetchJson(`https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(q)}&limit=50`, { headers: { Authorization: `Bearer ${ctx.env.CORE_API_KEY}` }, timeoutMs: 40000 });
      return recent(parseCore(json, { id: 'core', name: 'CORE (open-access papers)', kind: 'journal' }), ctx.weekFrom);
    },
  },
  // Journals (tables of contents)
  feed('nature', 'Nature', 'https://www.nature.com/nature.rss', 'journal', { general: true }),
  feed('nature-human-behaviour', 'Nature Human Behaviour', 'https://www.nature.com/nathumbehav.rss', 'journal'),
  feed('nature-medicine', 'Nature Medicine', 'https://www.nature.com/nm.rss', 'journal'),
  feed('science', 'Science (news)', 'https://www.science.org/rss/news_current.xml', 'news'),
  feed('pnas', 'PNAS', 'https://www.pnas.org/action/showFeed?type=etoc&feed=rss&jc=pnas', 'journal', { general: true }),
  feed('lancet', 'The Lancet', 'https://www.thelancet.com/rssfeed/lancet_current.xml', 'journal'),
  feed('nejm', 'New England Journal of Medicine', 'https://www.nejm.org/action/showFeed?jc=nejm&type=etoc&feed=rss', 'journal'),
  feed('bmj', 'The BMJ', 'https://www.bmj.com/rss/recent.xml', 'journal'),
  feed('jama-network-open', 'JAMA Network Open', 'https://jamanetwork.com/rss/site_214/70.xml', 'journal'),
  feed('elife', 'eLife', 'https://elifesciences.org/rss/recent.xml', 'journal'),
  feed('frontiers-psychology', 'Frontiers in Psychology', 'https://www.frontiersin.org/journals/psychology/rss', 'journal'),
  feed('nber', 'NBER working papers', 'https://www.nber.org/rss/new.xml', 'preprint'),
  // Evidence-based explainers and science news
  feed('our-world-in-data', 'Our World in Data', 'https://ourworldindata.org/atom.xml', 'news'),
  feed('who', 'World Health Organization news', 'https://www.who.int/rss-feeds/news-english.xml', 'news'),
  feed('nih', 'NIH news releases', 'https://www.nih.gov/news-releases/feed.xml', 'news'),
  feed('sciencedaily', 'ScienceDaily', 'https://www.sciencedaily.com/rss/top/science.xml', 'news'),
  feed('sciencedaily-health', 'ScienceDaily · Health', 'https://www.sciencedaily.com/rss/top/health.xml', 'news'),
  feed('sciencedaily-mind', 'ScienceDaily · Mind & Brain', 'https://www.sciencedaily.com/rss/mind_brain.xml', 'news'),
  feed('eurekalert-health', 'EurekAlert! · Health', 'https://www.eurekalert.org/rss/health_medicine.xml', 'news'),
  feed('eurekalert-social', 'EurekAlert! · Social & behaviour', 'https://www.eurekalert.org/rss/social_behavior.xml', 'news'),
  feed('medicalxpress', 'Medical Xpress', 'https://medicalxpress.com/rss-feed/', 'news'),
  feed('phys-org', 'Phys.org', 'https://phys.org/rss-feed/', 'news'),
  feed('quanta', 'Quanta Magazine', 'https://www.quantamagazine.org/feed/', 'news'),
  feed('knowable', 'Knowable Magazine', 'https://knowablemagazine.org/rss', 'news'),
  feed('mit-news', 'MIT News · Research', 'https://news.mit.edu/rss/research', 'news'),
  feed('new-scientist', 'New Scientist', 'https://www.newscientist.com/feed/home/', 'news'),
  feed('bbc-science', 'BBC News · Science & Environment', 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', 'news'),
];

async function biorxivPages(ctx, server, name) {
  const out = [];
  for (let cursor = 0; cursor < 300; cursor += 100) {
    const json = await fetchJson(`https://api.biorxiv.org/details/${server}/${ctx.from}/${ctx.to}/${cursor}`, { timeoutMs: 40000 });
    const page = parseBiorxiv(json, { id: server, name, kind: 'preprint' }, server);
    out.push(...page);
    const total = Number(json.messages?.[0]?.total || 0);
    if (page.length < 100 || cursor + 100 >= total) break;
  }
  return out;
}

module.exports = {
  SOURCES, parseArxiv, parseHfDaily, parseSemanticScholar, parseOpenAlex, invertedToText, parsePubmed,
  parseEuropePmc, parseBiorxiv, parsePlos, parseDoaj, parseOsf, parseChemrxiv, parseFeed, parseEric, parseClinicalTrials, parseAds, parseCore, isoDate,
};
