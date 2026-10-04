# Adaptive product architecture

[Learner start](../START-HERE.md) · [Contribution policy](../CONTRIBUTING.md)

## Extend the existing curriculum

`curriculum/index.json` remains schema version 1 with twelve domains, the original 48 IDs, twelve existing scenarios, five capstones, five pathways and locality packs. Its `adaptive` block points to the extension. Existing fields and paths retain their meaning. Markdown remains the canonical teaching content; the dashboard is a view over it.

| Layer | Canonical file | Responsibility |
| --- | --- | --- |
| Subskills | [subskills.json](../curriculum/subskills.json) | Observable criteria, modes, evidence, prerequisites, routes, errors and review policies |
| Legacy compatibility | `subskills.json` rollups and `index.json` derived_from | Evidence for each old criterion, scoped to that criterion; practical gates remain explicit |
| Assessment bank | [bank.json](../assessments/bank.json) | Learner-only material, essential rubric, version, scope, sources and exposure group |
| Integrated capstones | [capstones.json](../assessments/capstones.json) | Five existing activities, explicit multi-subskill criteria and granular evidence bundles |
| Practical rubrics | [practical-rubrics.json](../assessor/practical-rubrics.json) | Bounded safe observed actions for the existing practical gates |
| Assessor references | [answers](../assessor/answers.json), [benchmarks](../assessor/benchmarks.json) | Explanations and four-level calibration; excluded from initial learner data |
| Learner evidence | [state schema](../schemas/learner-state.schema.json) | Append-only bounded educational observations, with no arbitrary private text |
| Rules engine | [engine.js](../learner/engine.js) | Same deterministic code in browser and Node tests; recommendation, scheduling, rollups and evaluation |
| Static interface | [learner](../learner/index.html) | Browser-local state, temporary answers, accessibility and feedback workflow |
| Source assurance | [sources.json](../data/sources.json) | Human scope/review, selected content fingerprints and existing dependencies |

## Evidence and compatibility

A competency result is derived from its latest attempt and that attempt's latest assessor review. Each criterion requires `met`, `partly-met` or `not-met`; all essential criteria must be met with no recorded errors. Complete work with solving help or prior solution exposure is assisted; a missing essential criterion is not yet. There is no final-outcome selector and no prose grading. First and last successful dates remain available; a later failure does not erase success history. Retention progression counts independent delayed passes and resets after assistance or failure. `next_review` is derived, not an editable second source of truth.

State version 2 separates immutable `records` from append-only `reviews`, structured `observations`, retained `legacy_observations` and feedback `exposures`. Self-reviewed claims are explicitly unverified; assessor review requires the original output or an observed original performance, and cannot alter its help, access, item/version, date or exposure facts. Practical observations require their own rubric and `practical-observed` level. The latest observed result controls a practical gate, including a later failure. No assessor identities, original answers or free-text notes are persisted. Review labels are local declarations, not authenticated credentials.

`evidence.js` handles bounded validation, derivation and migration; `engine.js` retains scheduling, graph, recommendations, rollups and evaluation. The v2 validator reuses existing v1 semantic checks through a temporary projection rather than keeping a second persisted state. `catalog.js` handles content loading and grouped discovery; `ui.js` supplies accessible rubric controls; `assessor.js` owns local review. `app.js` coordinates the learner journey.

Existing domain IDs derive from the relevant subskill evidence. Their scope is the original criterion, not every skill in the domain. Do not infer earlier stages merely from a later stage or claim full-domain competence. The roll-up can return `practical-evidence-required` even when written criteria are demonstrated. `home.applied` requires observed meal preparation and `digital-safety.applied` requires an observed sample restore and actual account-protection review. Imported assessor observations contain no personal data. Other physical techniques remain outside these written routes.

Knowledge, independent and adaptation modes are explicit. Assisted performance is an outcome, not another content-completion stage. Access supports have separate enumerated fields. No hidden score or automatic grade is inferred from prose. The dashboard requires the learner to compare their original response with every essential criterion; assessor review is preferable for consequential claims.

## Exposure and versions

Items sharing answer-bearing material share an `exposure_group`, including foundation and performance routes. Opening feedback records exposure even if the learner closes the task without saving a result. Feedback opened after an original response does not downgrade that same attempt; the shared attempt token is checked against its item/date and cannot be saved twice. Any other recorded exposure removes that group from fresh recommendations. Transfer/retention reject known material, and retention needs an earlier demonstration and a later date. Editing wording or incrementing a version does not reset exposure. Exhaustion is reported honestly.

Capstones use one shared attempt token with a record per mapped subskill. Each scoring row names its competency; errors are recorded by competency. Capstones cannot award unmapped skills or entire domains. They enter recommendations only when the full prerequisite set and locality fit. A learner can use a capstone as a diagnostic before those prerequisites, without awarding prerequisite evidence. Their original context, materials and variation are checked against canonical Markdown to prevent drift. Only abilities the complete task can elicit are mapped; broad text rubric rows remain available without being automatic subskill awards.

Calibration covers representative assessments in all twelve domains and all five capstones. References are tied to version and a SHA-256 fingerprint of materials, task and scoring. Changes require explicit human calibration review; regenerating learner assets does not silently accept a new benchmark. Numeric calculations and defensible alternative choices need editorial review, not just schema validity.

The bank has five curated independent variants in each priority family, plus lower-volume fresh cases and adaptation routes across every domain. Variant axes are editorial declarations, not automated proof of assessment quality: maintainers must review substantive variation, realism, ambiguity and arithmetic.

## Jurisdiction rules

Typed scopes include global, UK, Great Britain, England, Wales, Scotland, Northern Ireland and United States for retained background sources. Extend the scope model and tests together for additional jurisdictions. Great Britain excludes Northern Ireland; UK unspecified cannot assume a nation. Nation-specific learner packs currently cover Wales only.

Each source use declares `authority`, `general-principle` or `local-alternative`. Authority must cover the task's operative scope. General-principle use needs a substantial explicit justification and cannot establish a local service/rule. Local alternatives remain tied to their declared source scope. Regulated housing and healthcare items require compatible authority with no general-principle exception. Local healthcare/medicine and wellbeing support routes currently require Wales; general health routines use WHO's global guidance. Scenario S12 and capstone C01 now explicitly use Wales; England housing references were removed from existing assessment lists. Generic lessons retain useful original background references with explicit roles.

## Build, validate and test

```sh
python scripts/render_registry.py
python scripts/build_learner.py
python scripts/validate_curriculum.py
python scripts/render_registry.py --check
python scripts/build_learner.py --check
python -m unittest discover -s tests -v
node --test tests/engine.test.js tests/evidence.test.js
node --check learner/app.js
npx --yes markdownlint-cli2@0.18.1
```

No runtime dependency or framework build is required. Python validates the graph, sources, assessments, schemas, navigation and generated assets; Node runs the exact browser engine. `schema_checks.py` supports only the JSON Schema assertion keywords used in the checked-in schemas and refuses unknown assertion keywords. Use a full JSON Schema implementation if adding other keywords. Mutation tests protect failure paths; network checks remain separate from fast quality CI.

Serve the repository root with `python -m http.server 8000 --bind 127.0.0.1`, then open `http://127.0.0.1:8000/learner/`. Keep bindings local for a personal preview. Static hosting must include the generated per-item feedback paths. The dashboard does not send state or answers to a service. Direct `file://` opening cannot reliably fetch feedback; use HTTP.

The generated initial core contains graph/rules, task headers and minimal criterion IDs, not task materials, guides or solutions. `learner/chunks/` loads guides and task content by domain; feedback and selected assessor calibration load separately. Publish the entire repository's static assets. `build_learner.py --check` detects drift and obsolete assets; an initial-core size budget prevents accidental eager content growth.

Browser tests now run in a separate normal CI job using locked development-only Playwright and axe dependencies. Run `npm ci`, `npx playwright install chromium`, then `npm run test:e2e`. Tests start a localhost Python server automatically. Set `PYTHON_BIN` for a non-default Python executable; `PLAYWRIGHT_CHANNEL=chrome` can use an installed Chrome for local QA. The CI job uses installed Chromium. Runtime hosting still requires no Node installation, framework or backend. See [accessibility QA](accessibility.md) and [product review](product-review.md). The small [manual smoke check](../tests/browser-flow.js) remains useful in an isolated `agent-browser` session.

Version 1 imports are strictly validated against the preserved old format before migration. Checked criteria become explicit judgements; missing essentials are not yet even if an old assisted label said otherwise. Known materials are conservatively marked exposed from history. Dates, help, access and reviewer declarations are retained; old binary observation flags remain in `legacy_observations` and cannot satisfy the new observed rubric. Back up an old file before migration. V2 imports reject unknown fields and incorrect derived outcomes; newer or changed assessment versions require an explicit future migration, never silent relabelling.
