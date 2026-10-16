# Discover: the daily research digest

The [Discover page](index.html) shows new research every day, turned into plain-language **life skills**, **facts about the world** and **headlines**, each linked to the original paper. An **All new papers** tab lists every paper fetched that day, with titles and links only.

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
5. The selected papers are sent to a free OpenRouter model (NVIDIA Nemotron by default), eight per request. Model output is validated against a fixed schema; preprints are never labelled high confidence.
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

1. In GitHub, go to **Settings → Secrets and variables → Actions** and add the repository secret `OPENROUTER_API_KEY`.
2. Optional secrets for higher rate limits: `NCBI_API_KEY`, `S2_API_KEY` and `OPENALEX_API_KEY`. Optional variables: `OPENROUTER_MODEL` (to override the model slug), `CONTACT_EMAIL` (sent to PubMed and OpenAlex for their polite pools) and `SITE_URL`.
3. Run **Actions → Daily research digest → Run workflow** once. Set `days` to 7 for a first backfill.

Never commit the key. OpenRouter keys found in public repositories are revoked automatically. Without a key the run still lists papers, but writes no summaries.

Free OpenRouter models allow about 50 requests a day on an account with no credit. The default of 48 papers needs six requests.

## Run locally

```sh
OPENROUTER_API_KEY=... node scripts/research/run.js --days 2 --max 48
node scripts/research/run.js --no-ai --only arxiv,pubmed   # fetch only, no model calls
node --test tests/research.test.js                          # parsers and pipeline, mocked network
```

The summaries are written by AI from abstracts and can be wrong. They sit outside the learner's evidence record and never affect assessment. This page is general education, not medical, financial or legal advice.
