# Discover: the daily research digest

The [Discover page](index.html) shows new research every day, turned into plain-language **life skills**, **facts about the world** and **headlines**, each linked to the original paper. It opens with today's picks and run statistics. You can filter by topic and search, and expand any card to see what the study found, its caveat, terms to look up, a "check yourself" question and which AI model wrote it. Life-skill cards link to the matching curriculum guide. A **Quiz** tab runs through the day's questions one at a time. Items can be saved in the browser and shared, and the view is kept in the URL. An **All papers** tab lists every paper fetched that day, with titles and links only.

## How it works

1. A scheduled GitHub Actions workflow (`.github/workflows/research-digest.yml`) runs every morning at 05:17 UTC.
2. `scripts/research/run.js` queries more than 40 free public APIs and feeds in parallel (see `scripts/research/sources.js`):
   - **Preprint servers:** arXiv (every paper links to its alphaXiv discussion), Hugging Face Daily Papers, medRxiv, bioRxiv, Europe PMC preprints (Research Square, SSRN, Preprints.org and others), OSF Preprints (PsyArXiv, SocArXiv, EdArXiv, MetaArXiv), ChemRxiv, NBER working papers.
   - **Scholarly indexes:** Semantic Scholar, OpenAlex, DOAJ.
   - **Medicine and health:** PubMed (systematic reviews, meta-analyses, trials and cohorts), and Cochrane Library reviews via PubMed.
   - **Journals:** Nature, Nature Human Behaviour, Nature Medicine, PNAS, The Lancet, NEJM, The BMJ, JAMA Network Open, eLife, PLOS, Frontiers in Psychology.
   - **Evidence-based explainers and science news:** Our World in Data, WHO, NIH, Science, ScienceDaily, EurekAlert!, Medical Xpress, Phys.org, Quanta, Knowable, MIT News, New Scientist, BBC Science.
3. Results are de-duplicated by DOI, arXiv id and title, so a paper covered by several sources appears once, with its other sources listed. Papers summarised in the last 90 days are skipped.
4. Papers are scored for everyday relevance (health, wellbeing, learning, decisions, money, work, relationships, digital safety and the wider world) and strength of evidence. They are then picked round-robin across sources so that no single server dominates.
5. Each selected paper gets its own AI agent: one focused model call with the full abstract. Every provider with a key runs a pool of agents at the same time, all pulling from one shared queue of papers:

   | Provider | Model family (best listed match is picked) | Agents at once | Requests per minute | Daily budget |
   | --- | --- | --- | --- | --- |
   | NVIDIA (`NVIDIA_API_KEY`) | Nemotron Super | 16 | 35 | 5000 |
   | Groq (`GROQ_API_KEY`) | Qwen 27B (Qwen 3.8 preferred) | 6 | 25 | 1000 |
   | OpenRouter (`OPENROUTER_API_KEY`) | free Nemotron Super | 6 | 18 | 48 |

   With all three keys, that is 28 agents running at once. Each provider has its own rate limiter and daily budget. When a provider answers "rate limited" its agents wait and retry. A paper that fails on one provider goes back on the queue for another. A daily-quota, bad-key or no-credit error retires that provider and the others finish its papers. Each agent returns a life skill, a fact, a headline, terms to look up and a "check yourself" question. Model output is validated against a fixed schema, and preprints are never labelled high confidence.
6. The workflow commits `research/data/`, and Vercel redeploys on that push.

Elicit has no free public API. Its corpus (Semantic Scholar and OpenAlex) is pulled directly instead. A source that fails on a given day is shown as unavailable on the page, and the run continues without it.

## Data files

| File | Contents |
| --- | --- |
| `data/feed.json` | Summaries from the last 30 days, source health, and run statistics |
| `data/papers.json` | Every paper fetched in the latest run, with titles and links only |
| `data/archive/YYYY-MM-DD.json` | That day's summaries, kept permanently |
| `data/archive/index.json` | List of archived days |

## Setup

1. In GitHub, go to **Settings → Secrets and variables → Actions** and add any or all of these repository secrets: `NVIDIA_API_KEY`, `GROQ_API_KEY` and `OPENROUTER_API_KEY`.
2. Optional variables, per provider: `NVIDIA_MODEL`, `GROQ_MODEL` and `OPENROUTER_MODEL` to pin a model id, and `<ID>_CONCURRENCY`, `<ID>_RPM` and `<ID>_DAILY_REQUESTS` (for example `GROQ_RPM`) to match your account's limits. Optional secrets for higher source rate limits: `NCBI_API_KEY`, `S2_API_KEY` and `OPENALEX_API_KEY`. Also optional: `CONTACT_EMAIL` (sent to PubMed and OpenAlex for their polite pools) and `SITE_URL`.
3. Run **Actions → Daily research digest → Run workflow** once. Set `days` to 7 for a first backfill.

Never commit a key: providers revoke keys found in public repositories. Without any key, the run still lists papers but writes no summaries.

One agent per paper means one request per paper. By default the run summarises 120 papers a day when an NVIDIA or Groq key is set, and 40 with OpenRouter alone, whose no-credit free tier allows only 50 requests a day. Free-tier limits change, and Groq also caps tokens per minute, so if the log shows repeated rate-limit waits, lower that provider's `_RPM` or `_CONCURRENCY`.

## Run locally

```sh
NVIDIA_API_KEY=... GROQ_API_KEY=... node scripts/research/run.js --days 2
node scripts/research/run.js --no-ai --only arxiv,pubmed   # fetch only, no model calls
node --test tests/research.test.js                          # parsers and pipeline, mocked network
```

The summaries are written by AI from abstracts and can be wrong. They sit outside the learner's evidence record and never affect assessment. This page is general education, not medical, financial or legal advice.
