# Changelog

## Unreleased

- Add Vercel static deployment support: `vercel.json` (no build, `outputDirectory: "."`), a root `index.html` landing page, and `.vercelignore` that keeps maintainer-only paths out of the upload and excludes the aggregate answer/benchmark files so a deployed site never serves every reference solution at once.
- Add `scripts/static_smoke.js`: verifies every runtime asset resolves over HTTP with the right content type, that `learner/data.js` embeds no solutions, and that `.vercelignore` neither drops a required asset nor leaks the aggregate answer files. Runs in CI.
- Review the curriculum as a competency system rather than a content library; findings and priorities in `docs/curriculum-review.md`.
- Add a case-specific, essential `case-decision` criterion to all 234 bank items (new generator `scripts/build_case_criteria.py`, with a `--check` drift guard). A response that meets every shared rubric row but never reaches the case's specific decision now scores `not-yet` — the concrete change that separates "I read this" from "I can do this". Matching calibration fingerprints for the 13 re-baselined benchmark items are refreshed and flagged by a validator warning for human re-check.
- Make learner feedback case-specific: regenerate `explanation` and `next_steps` per item from its own reference solution and error tags. Distinct learner-facing explanations 26 → 141; distinct remediation strings 2 → 29 across 866 entries (`scripts/build_feedback_text.py`, idempotent with a `--check` guard).
- Encode the documented cross-domain dependency map into machine prerequisites (new generator `scripts/build_cross_domain_prerequisites.py`). 23 subskills gain the cross-domain foundations the dependency map already described; assessment-item prerequisites are synced. The engine now surfaces these as a `blocked` list and recommends prerequisites first.
- Add a reassessment-runway validator invariant: report, per family, whether fresh independent cases can cover the promised review schedule. Emitted as an honest warning (38 of 40 families currently short) so the target is tracked as cases are authored.
- Add an adaptive-coverage validator warning: only 12 of 40 families currently have an adaptation (Advanced) route; the four-stage promise and the inventory gap are now measured rather than assumed.
- Keep the initial learner payload under its size budget by projecting documentation-only competency metadata (`related_competencies`, `assessment_routes`, `practical_scope`, `criterion`, `evidence`) out of `learner/data.js` (405 KB → 352 KB; provably unused by the engine/app).
- Run `validate_adaptive.py` and the new drift checks (feedback, case-criteria, cross-domain prerequisites) explicitly in CI.
- Add engine regression tests locking in the case-decision gate and cross-domain prerequisite blocking.

## 0.4.0 · 2026-10-04

- Derive outcomes from explicit criterion judgements, essential gates, errors, help and prior answers; remove the final-outcome selector.
- Add bounded evidence version 2, checked migration, separate assessor reviews and structured safe practical observations.
- Integrate all five existing capstones with granular subskill evidence and competency-specific errors.
- Expand calibration across twelve domains and capstones, with version and material/rubric fingerprints.
- Record feedback exposure even when a task is abandoned; preserve locality, unseen transfer and delayed-review guarantees.
- Improve Today, grouped Practice and evidence-strength Progress; split generated content into lazy domain assets.
- Extend descriptive evaluation with review strength, criterion/error changes, practice and observed evidence.
- Add locked browser and accessibility tests to normal CI, update maintainer/learner guidance, and publish a candid product review.

## 0.2.0 — 2026-10-03

- Preserve twelve short guides and add domain subskills with 48 observable competencies.
- Add twelve fictional transfer assessments with hidden explanations and advanced variations.
- Add five multi-skill capstones with per-competency rubrics.
- Introduce diagnostic-led pathways, dependency map, and delayed reassessment.
- Distinguish reading, practice, independent demonstration, and later retention in evidence records.
- Add shared UK and Wales localisation, structured source registry, and curriculum metadata.
- Add content validation, Markdown linting, external-link checks, contributor templates, and licensing.

## 0.1.0 — 2026-10-03

- Introduce twelve guides, a 30-day foundation plan, five worksheets, and source references.

## 0.3.0 · 2026-10-03

- Added observable subskill criteria, legacy criterion roll-ups and separate practical evidence gates.
- Added a structured unseen item bank, five curated priority families, assessor solutions and four-level calibration.
- Added one shared deterministic browser/Node engine for recommendations, errors, exposure groups, retention scheduling and evaluation.
- Added strict local educational evidence, fictional profiles and a mobile-friendly dashboard with no analytics or sensitive response storage.
- Added typed jurisdiction/source uses, Wales assessment fixes, selected content fingerprints and human-review signals.
- Extended schemas, validators, generated-asset checks, regression tests and both existing CI workflows. Preserved existing guides, stage IDs, pathways and text assessments.
