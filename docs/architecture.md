# Adaptive product architecture

[Learner start](../START-HERE.md) · [Contribution policy](../CONTRIBUTING.md)

## Extend the existing curriculum

`curriculum/index.json` remains schema version 1 with twelve domains, the original 48 IDs, twelve existing scenarios, five capstones, five pathways and locality packs. Its `adaptive` block points to the extension. Existing fields and paths retain their meaning. Markdown remains the canonical teaching content; the dashboard is a view over it.

| Layer | Canonical file | Responsibility |
| --- | --- | --- |
| Subskills | [subskills.json](../curriculum/subskills.json) | Observable criteria, modes, evidence, prerequisites, routes, errors and review policies |
| Legacy compatibility | `subskills.json` rollups and `index.json` derived_from | Evidence for each old criterion, scoped to that criterion; practical gates remain explicit |
| Assessment bank | [bank.json](../assessments/bank.json) | Learner-only material, essential rubric, version, scope, sources and exposure group |
| Assessor references | [answers](../assessor/answers.json), [benchmarks](../assessor/benchmarks.json) | Explanations and four-level calibration; excluded from initial learner data |
| Learner evidence | [state schema](../schemas/learner-state.schema.json) | Append-only bounded educational observations, with no arbitrary private text |
| Rules engine | [engine.js](../learner/engine.js) | Same deterministic code in browser and Node tests; recommendation, scheduling, rollups and evaluation |
| Static interface | [learner](../learner/index.html) | Browser-local state, temporary answers, accessibility and feedback workflow |
| Source assurance | [sources.json](../data/sources.json) | Human scope/review, selected content fingerprints and existing dependencies |

## Evidence and compatibility

A competency result is derived from its latest criterion attempt. First and last successful dates remain available; a later failure does not erase success history. Retention progression counts independent delayed passes and resets after assistance or failure. `next_review` is derived, not an editable second source of truth. `attempts`, help, retention status and errors are similarly derived.

Existing domain IDs derive from the relevant subskill evidence. Their scope is the original criterion, not every skill in the domain. Do not infer earlier stages merely from a later stage or claim full-domain competence. The roll-up can return `practical-evidence-required` even when written criteria are demonstrated. `home.applied` requires observed meal preparation and `digital-safety.applied` requires an observed sample restore and actual account-protection review. Imported assessor observations contain no personal data. Other physical techniques remain outside these written routes.

Knowledge, independent and adaptation modes are explicit. Assisted performance is an outcome, not another content-completion stage. Access supports have separate enumerated fields. No hidden score or automatic grade is inferred from prose. The dashboard requires the learner to compare their original response with every essential criterion; assessor review is preferable for consequential claims.

## Exposure and versions

Items sharing answer-bearing material share an `exposure_group`, including foundation and performance routes. Any recorded exposure removes that group from fresh recommendations. Transfer/retention records reject an already seen group, and retention additionally requires an earlier independent demonstration and a later date. Editing wording or incrementing a version does not reset exposure. Exhaustion is reported honestly rather than silently using the old answer.

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
node --test tests/engine.test.js
node --check learner/app.js
npx --yes markdownlint-cli2@0.18.1
```

No runtime dependency or framework build is required. Python validates the graph, sources, assessments, schemas, navigation and generated assets; Node runs the exact browser engine. `schema_checks.py` supports only the JSON Schema assertion keywords used in the checked-in schemas and refuses unknown assertion keywords. Use a full JSON Schema implementation if adding other keywords. Mutation tests protect failure paths; network checks remain separate from fast quality CI.

Serve the repository root with `python -m http.server 8000 --bind 127.0.0.1`, then open `http://127.0.0.1:8000/learner/`. Keep bindings local for a personal preview. Static hosting must include the generated per-item feedback paths. The dashboard does not send state or answers to a service. Direct `file://` opening cannot reliably fetch feedback; use HTTP.

Optional browser QA uses [tests/browser-flow.js](../tests/browser-flow.js) in a fresh isolated browser profile at a 390×844 viewport. With the page already open, pipe the script into `agent-browser eval --stdin`. It checks initial answer isolation, readable teaching content, attempted-response gating, single-item feedback fetch, frozen response, saved criteria, access support, no prose persistence, progress, locality/pathway changes and invalid import preservation. Browser dependencies are not needed for normal quality CI.
