# Changelog

## Unreleased

### Product surfaces

- Add the **Independence Roadmap**: a capability map across all twelve domains showing what is demonstrated, developing, needing work, blocked (with the blocking prerequisite named), and due for a retention check, plus one recommended next step. Each of the 92 capabilities carries its own explainable state. There is deliberately **no overall "life score"** — a single number would imply the domains are commensurable and would hide the evidence behind it.
- Add **capability milestones** ("Can manage a monthly budget", "Can verify a suspicious request") that appear as earned only when the engine already reports every required competency as demonstrated. They cannot be awarded by reading, by choosing a goal, or by time served.
- Add **goal-based onboarding**: six real situations (moving out, first job, starting university or college, becoming financially independent, general independence, becoming safer online), each with a short diagnostic. Onboarding only sets a pathway and focus competencies — an evidence-free state change validated by the existing rules. Locality selection stays prominent.
- Upgrade the five capstones into **life-transition simulations** (`curriculum/simulations.json`): three-part situations that progressively reveal information and then change the constraints under the learner's decision. Evidence is still stored per subskill exactly as before; the simulation is a presentation layer and cannot change how an outcome is derived.
- Add a human-readable **My Independence Profile** — printable progress report covering demonstrated capabilities, developing areas, milestones, retention status, observed practical evidence and next steps. Explicitly a learning record, not a qualification, and free of private data.
- Make learner feedback substantially more actionable: per-competency breakdown of what was right and what was missing, why the skill matters, a direct "your next practice" action, and when to expect reassessment.

### Assessment quality and scalability

- Add a **fresh-scenario generation architecture** (`curriculum/variation.json`) defining the variation dimensions a generator must change — context, constraints, trade-offs, missing information, ambiguity, irrelevant information, timing, error trap, decision type, difficulty — plus the metadata contract that makes generated material validatable and calibratable later. **Changing numbers alone is explicitly insufficient**: a case differing only by arithmetic can be passed without re-applying the decision.
- Add `scripts/validate_variation.py` to enforce the meaningful-change rule and report families relying on weak variation. All 40 families currently declare at least one meaningful axis.
- Add `scripts/build_adaptive_coverage.py` to report how many families lack an Advanced route. It is **report-only by default and CI-safe**; `--apply` is opt-in and deliberately has a human gate, because every new adaptive item needs an authored answer and calibration before it may award evidence. The gap is tracked, not papered over with uncalibrated content.
- Express the four evidence stages in plain language in the interface (practise with help / do it yourself / adapt / a later check) so learners meet the assessment terminology only when they need it.

### Verification added

- `scripts/verify_roadmap.js`, `scripts/verify_views.js` and `scripts/verify_styles.js` run in CI. Between them they assert that the roadmap never contradicts the engine, that the product views render from real data, that the AI boundary cannot be bypassed, that every class a view emits is actually styled, and that no raw error-tag id reaches the learner.

### Boundaries and integrity

- Add `learner/ai-boundary.js`: the interface and guards for optional AI assistance (scenario generation, alternative examples, personalised explanations, practice coaching). AI may never grade, derive an outcome, or turn an assisted performance into independent evidence; every AI artefact is labelled a draft, counts as solving help and is never persisted into learner evidence. The product ships with no provider and works fully without one.
- The deterministic evidence model is unchanged. `evidence.js` remains the only thing that can derive an outcome; onboarding cannot create evidence; a simulation cannot alter how evidence is recorded. The engine and evidence test suites pass unmodified.

### Fixed (found by reviewing the above)

- **"Can still do this" could outlive its evidence.** A capability kept the retained label even after the learner had done newer fresh transfer, so the latest attempt was no longer a retention check. The label now requires the most recent attempt to actually be a retention check, and can only under-claim, never over-claim.
- **Raw error-tag ids reached the learner.** The roadmap and the feedback panel showed ids such as `assumes-missing-information` verbatim. Both now resolve the curriculum's learner-facing wording, with a readable fallback so a machine id can never be shown.
- **Onboarding discarded the goal's declared order.** Diagnostic answers were inserted ahead of the goal's own backbone, reordering a "first job" plan around unrelated competencies. The backbone now keeps its declared order and the diagnostic refines it.
- **Missing styles for two emitted classes** (`.ms--todo`, affecting most milestones, and `.domain__loading`), found by a new automated check rather than by reading the stylesheet.
- Dead code removed: a repeated `capState` evaluation (four per capability, 92 times per render), an unused map and an unused variable, an identity `map`, and a view dependency on a window global rather than the date already passed in.

### Performance

- Render the roadmap's capability lists lazily on domain expansion, cutting first-paint markup from ~81 KB to ~22 KB (a 73% reduction) so the capability map stays usable on ordinary phones.

## Unreleased (earlier)

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
