# Product review · 2026-10-04

[Learner start](../START-HERE.md) · [Evidence model](architecture.md) · [Evaluation](evaluation.md)

## What changed and why it matters

The learner no longer selects a success outcome. Every criterion requires a met, partly met or not met judgement with specific review guidance. Essential omissions and errors prevent independent claims; solving help and previously known material remain assisted even after assessor confirmation. Access support remains separate.

Self-reviewed success is explicitly an unverified claim. An assessor can review an original performance privately, record a separate judgement, indicate direct observation, and export bounded evidence. Practical checks have their own safe observable actions. A later practical failure affects the current gate while preserving the earlier pass. This improves interpretation of evidence without pretending to automatically grade private written answers.

All five existing capstones now assess mapped subskills and save separate results and errors. Broad domain activities are preserved without awarding capabilities the task cannot demonstrate. The changed situation informs the rubric; it does not automatically grant an adaptive competency or physical competence.

Today explains one next action, its reason, time and what follows. Practice starts with useful grouped tasks and provides needs-work, due, fresh, guided, capstone and browse-all views. Progress identifies evidence strength, dates, unresolved errors, observed checks and next steps. The initial generated asset falls from roughly 869 KB to 374 KB; tasks and guides load by domain, with answers separate until an attempt. Runtime hosting remains static.

## Issues found and resolved during review

- Feedback opened then abandoned previously left no exposure history. Exposure now persists independently of saving a result; known materials cannot become unseen transfer or retention.
- Assessor confirmation could otherwise obscure original help or exposure. Reviews are separate records and those immutable facts still limit the result.
- Old binary practical flags did not contain an observed rubric. Migration preserves them but requires a fresh structured observation to satisfy the gate.
- A cancelled Wales-only task still has jurisdiction-specific history. Feedback exposures now participate in locality validation.
- Open reviews could otherwise survive importing another profile. Successful imports close all open task and review work before switching evidence.
- Practice-only evidence was missing from evaluation. It now remains visible with explicit missing diagnostic/transfer/retention phases.
- Calibration previously survived changed materials. Reference fingerprints now cover task, materials, version and rubric; changes require human review.
- Initial heading focus scrolled past navigation. Initial load keeps the header visible; navigation and task changes still move focus appropriately.

## Verification and its limits

Regression and mutation tests cover schemas, graph, scopes, source roles, safety gates, derived outcomes, immutable reviews, capstone bundles, migration, known material, retention and evaluation. Browser CI covers the learner and assessor journeys, bounded imports, no-response persistence, mobile reflow, keyboard use and automated accessibility. Generated assets, source registry, internal links and Markdown are checked separately. See the repository's Actions results for the exact revision's execution status.

## Remaining weaknesses

- **Local declarations can be dishonest or edited.** This product does not authenticate assessors, sign evidence files, securely hide static references or prevent all self-review gaming. Consequential decisions require independently supervised assessment and external verification. Adding a confidence score would not fix this.
- **Original outputs are intentionally absent.** An assessor must have the unchanged original output privately or have directly observed it. If neither is available, the product cannot reconstruct or verify the answer; a new attempt is needed.
- **Calibration is representative.** Eighteen references span all twelve domains and the five capstones, not every family or all 239 experiences. Inter-assessor agreement and item difficulty have not been empirically established. Editorial examples are not psychometric validation.
- **Fresh material is finite.** A known capstone or exhausted item family needs newly authored, validated materials for transfer or retention; repeats remain useful assisted practice. A version increment cannot make the same answer fresh.
- **National coverage is uneven.** UK unspecified and Wales are supported; other nations need complete source-reviewed learner packs. A shared budgeting principle does not establish local legal or health guidance.
- **Accessibility needs user testing.** Chromium/Chrome checks and axe do not substitute for screen-reader, switch-control, voice-control or Safari/Firefox testing with representative learners. Longer multi-skill rubrics should be reviewed with learners for fatigue and clarity.
- **Storage is browser-local and bounded.** Browser clearing, quota limits and profile changes can lose access to evidence unless the learner keeps local backups. A full cross-version assessment archive/migration policy is still needed before revising item versions in production.
- **Learning effectiveness is unproven.** Descriptive diagnostic, unseen-transfer and delayed-check evidence supports a pilot; it does not establish that this curriculum caused improvement. Human source review and substantive legal/health/financial checks remain essential even when links work.

The next product evaluation should use a small consent-based pilot with matched tasks, calibrated independent assessors, access adjustments, delayed follow-up and minimal educational data. Its findings should guide quality improvements before expanding the question bank.

## Update · 16 Nov 2026

Read-only review of current `main` (commit `68a45b1`). The evidence model and assessment rules above are unchanged; the product around them has grown. This section records the new surfaces and their risks. It does not replace the original review or its limitations.

### New surfaces

- **Discover** (`/research/`): a daily digest built from 39 public APIs and feeds. Each selected paper gets one AI agent that writes a labelled life skill, fact, headline, caveat, terms and a check-yourself question. Results are committed as static JSON and Vercel redeploys on the push. Summaries sit outside the learner's evidence record.
- **Learner additions**: named profiles for shared browsers, passphrase-encrypted evidence backup, budget/planner/decision practice tools, a chronological evidence log, the Independence Roadmap, capability milestones, goal-based onboarding, life-transition simulations, a printable profile, more actionable feedback and an installable offline-first shell.
- Onboarding, AI assistance and practice tools remain evidence-free: none can derive an outcome or turn assisted work into independent evidence.

### Weaknesses to track

- AI-written summaries are labelled, schema-checked and tied to a model and source, but a fluent summary can still be wrong. Preprints are never labelled high confidence; `moderate` remains an editorial judgement, not psychometric validation.
- The digest workflow needs `contents: write` and redeploys daily. Provider keys, free-tier limits and upstream source health are external dependencies. A failed source is reported as unavailable. A run that reaches almost no sources or summarises almost nothing now fails the data-only health checks, and a run that stops altogether is caught by the daily `research-freshness.yml` job (a stopped digest produces no commit, so the push-triggered quality job would never notice). The freshness gate tolerates two missed days and is opt-in so ordinary pushes stay clock-independent.
- Evidence is browser-local. An encrypted export helps a learner keep it, but there is no server-side recovery; clearing storage loses access without a kept backup.
- Both curriculum validators currently warn on thirteen benchmarked items whose rubric includes the case-decision gate (the earlier count of nine was stale). These are human confirmation prompts, not failures; the assessor references and fingerprints need a reviewed decision. `docs/calibration-review-queue.md` lists all thirteen as pending, and `scripts/check_calibration_queue.py` fails CI if the warning set drifts, but neither makes the assessor decision — it is still outstanding.

### Verification added

`scripts/verify_research.js` now checks the committed digest and the rendered page, and runs in CI on every push. It covers schema and run statistics, source health, AI attribution, the preprint confidence rule, link safety, archive retention, the AI-written and preprint labels, all six views, no HTML injection of feed text, no network posts, browser-local saves and resolvable guide links. It also checks that the run reached most sources, summarised most selected items and that the generation timestamp falls on the digest day. With `RESEARCH_CHECK_FRESHNESS=1` it additionally fails when the committed digest is more than two days old; the daily `research-freshness.yml` job sets that flag so a stopped digest raises an alert. This review ran it against the live digest along with the Node engine/evidence, full engine and research pipeline tests, the Python validators and the build checks; all passed. Browser/Playwright journeys, external links, Markdown lint and live provider behaviour were not run in this review.
