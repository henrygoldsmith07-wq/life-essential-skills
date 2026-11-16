# Repository quality checks

[Contributing](../CONTRIBUTING.md) · [Content checklist](../CONTENT-QUALITY.md)

Python 3.10+ is sufficient for the standard-library checks. Node.js 20+ and npm are used only for Markdown linting. Learners do not need any of these tools.

```sh
python scripts/validate_curriculum.py
python scripts/render_registry.py --check
python -m unittest discover -s tests -v
npx --yes markdownlint-cli2@0.18.1
python scripts/check_external_links.py
```

Edit `data/sources.json`, then run `python scripts/render_registry.py` to update the readable register.

## What the checks cover

- Required metadata fields/types and stable references.
- Twelve domains, four ordered stage criteria per domain, preparation cycles, and source dependencies.
- Scenario/capstone sections, competency rubrics, and solutions wholly inside `<details>`.
- Thirty ordered sessions in each pathway, with matching Markdown days.
- Internal file links and Markdown anchors.
- Source/locale metadata and review-age warnings.
- Markdown formatting and readable tables.
- Public external URLs with three attempts and bounded timeouts.

Automated checks cannot validate medical/legal advice, establish a source's relevance, or assess a learner's actual ability. Use the editorial checklist as well.

## External-link policy

404/410 and other permanent client failures fail the check. Access blocks, rate limits, server failures, and exhausted network retries are reported as **unverified**, not reachable. Use `--strict` to fail on those too, or `--report path.json` to retain a detailed local report. These records do not update source review dates automatically.

The small exception file requires an exact URL, permitted status codes, reason, and expiry. It cannot suppress a 404/410 or turn a blocked source into a reachable one. Review expired exceptions. The workflow runs on relevant pushes and manual requests; it does not create scheduled account activity.

GitHub Actions uses read-only repository permission. `quality.yml` checks structure, tests, rendering, and lint; `external-links.yml` isolates network-dependent checks so their limits remain visible.

## Adaptive checks

`validate_adaptive.py` extends the existing validator with subskill graphs, legacy roll-ups, schemas, source scope, benchmarks and learner navigation. `build_learner.py` renders teaching Markdown and public item metadata without answers; `--check` rejects drift. The browser and Node tests use the same `learner/engine.js`. `check_source_changes.py` flags main-text changes and stale reviews without automatically accepting guidance. See [architecture](../docs/architecture.md) and [human source review](../docs/source-review.md).

`check_calibration_queue.py` keeps the case-decision warnings honest. `docs/calibration-review-queue.md` lists the benchmarked items whose rubric gained the case-decision gate and whose assessor references still need a human check; this script derives the same set from `validate_adaptive.py` and fails if an item is added, removed or duplicated without updating the queue. It does not mark anything reviewed — the decisions in the queue remain pending until an assessor makes them.

Version-2 evidence tests additionally cover structured outcomes, separate assessor reviews, practical observation gates, checked migration, abandoned-feedback exposure and granular capstones. Run `node --test tests/engine.test.js tests/evidence.test.js tests/crypto-backup.test.js tests/profiles.test.js tests/tools.test.js` (all five browser-side suites; CI runs the same command). The normal quality workflow also runs the locked Playwright/axe suite: `npm ci`, `npx playwright install chromium`, `npm run test:e2e`. These packages are development-only; the static learner app has no runtime package dependencies.

## Discover checks

`verify_research.js` applies the same product-level treatment to Discover. It checks the committed digest (schema, run statistics, source health, AI attribution, the preprint confidence rule, link safety, archive retention and that the run reached most sources, summarised most selected items and stamped the digest day) and the page that renders it (AI-written and preprint labelling, all six views, no HTML injection of feed text, no network posts, browser-local saves and resolvable guide links). The pipeline unit test mocks the network; this check uses the real committed files. Run `node scripts/verify_research.js` after changing `research/`, its data or the digest workflow; CI runs it on every push.

`verify_research_ui.js` executes the real `research.js` in a small DOM stub with the committed digest and papers list. It checks that the page renders stats, cards, picks and source health, that all six views work, that saving stays in browser storage, that the quiz advances, that search reaches the shareable URL hash, and that hostile feed text cannot become HTML or a `javascript:` link. Source-text checks alone cannot catch a render that throws or a view that silently shows nothing; CI runs this harness too.

A stopped digest commits nothing, so the push-triggered check never sees it. `research-freshness.yml` runs daily at 06:45 UTC with `RESEARCH_CHECK_FRESHNESS=1`, which adds an opt-in gate: the committed digest must be at most two days old. This keeps ordinary pushes clock-independent. Set `RESEARCH_NOW=YYYY-MM-DD` to test the gate around a chosen date without waiting a day.
