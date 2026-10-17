// Post-summary enrichment, all free and key-less:
// - Unpaywall: a legal free full-text link for each DOI ("Free to read").
//   Unpaywall requires a contact email, so it runs only when CONTACT_EMAIL is set.
// - Wikipedia: a one-line definition for each card's key terms, kept in a
//   feed-level glossary so a term shared by many cards is fetched once.
// Failures are silent: a card without a link or definition is still useful.
'use strict';

const { fetchJson, cleanText, safeUrl, normDoi } = require('./lib');

async function pool(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try { await fn(items[i]); } catch { /* best effort */ }
    }
  }));
}

function parseUnpaywall(json) {
  if (!json || !json.is_oa) return '';
  const loc = json.best_oa_location || {};
  return safeUrl(loc.url_for_pdf || loc.url || loc.url_for_landing_page || '');
}

async function addFreeLinks(items, env, log = () => {}) {
  const email = env.CONTACT_EMAIL;
  if (!email) return 0;
  let found = 0;
  await pool(items.filter((i) => normDoi(i.doi) && !(i.links && i.links.free)), 8, async (item) => {
    const json = await fetchJson(`https://api.unpaywall.org/v2/${encodeURIComponent(normDoi(item.doi))}?email=${encodeURIComponent(email)}`, { timeoutMs: 15000, retries: 0 });
    const url = parseUnpaywall(json);
    if (url && url !== item.url) {
      item.links = { ...(item.links || {}), free: url };
      found++;
    }
  });
  log(`  Unpaywall: ${found} free full-text links`);
  return found;
}

const termKey = (t) => cleanText(t).toLowerCase();

function parseWikiSummary(json) {
  if (!json || json.type !== 'standard' || !json.extract) return null;
  const url = safeUrl(json.content_urls && json.content_urls.desktop && json.content_urls.desktop.page);
  if (!url) return null;
  const text = cleanText(json.extract);
  const firstSentence = (text.match(/^.{20,260}?[.!?](\s|$)/) || [text.slice(0, 220)])[0].trim();
  return { text: firstSentence, url };
}

// Returns the glossary for every key term on the given items, reusing
// definitions from the previous run where possible.
async function buildGlossary(items, previous = {}, log = () => {}) {
  // Key by lower case to de-duplicate, but look up the term as written:
  // Wikipedia titles are case-sensitive after the first letter ("DNA methylation").
  const wanted = new Map();
  for (const i of items) for (const t of (i.ai && i.ai.key_terms) || []) if (termKey(t) && !wanted.has(termKey(t))) wanted.set(termKey(t), cleanText(t));
  const glossary = {};
  const missing = [];
  for (const k of wanted.keys()) {
    if (previous[k] !== undefined) glossary[k] = previous[k];
    else missing.push(k);
  }
  let fetched = 0;
  await pool(missing.slice(0, 400), 4, async (k) => {
    const title = encodeURIComponent(wanted.get(k).replace(/\s+/g, '_'));
    let entry = null;
    try {
      entry = parseWikiSummary(await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}?redirect=true`, { timeoutMs: 10000, retries: 0 }));
    } catch { entry = null; }
    glossary[k] = entry; // null = looked up, nothing suitable (not retried every day)
    if (entry) fetched++;
  });
  log(`  Wikipedia: ${fetched} new definitions, ${Object.values(glossary).filter(Boolean).length} terms defined`);
  return glossary;
}

module.exports = { addFreeLinks, buildGlossary, parseUnpaywall, parseWikiSummary, termKey };
