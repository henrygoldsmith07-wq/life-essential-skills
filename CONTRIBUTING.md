# Contributing

Help make observable life skills easier to learn, demonstrate, and retain.

1. Identify a concrete gap, unclear criterion, calculation error, accessibility need, or outdated resource.
2. Suggest a focused improvement using an issue or pull-request template.
3. Keep guides short; add subskills to domain pages and transfer tasks to scenarios.
4. Update corresponding competency, pathway, locality, and source metadata.
5. Review [CONTENT-QUALITY](CONTENT-QUALITY.md) and run the [repository checks](scripts/README.md).

Use fictional examples. Do not include personal contacts, financial records, passwords, identity documents, or someone else's private information. Do not submit copied articles or paid-course content.

## Guide format

- Observable goal
- Short lesson
- Realistic example
- Practical exercise
- Self-check and suggested answers
- Completion criterion
- Supporting references when factual guidance needs them

When guidance depends on location, state its jurisdiction and point readers to local official information. If a source is withdrawn, replace it or explain its historical status rather than presenting it as current guidance.

## Sources and structured data

Use original official authorities, recognised professional/advice organisations, high-quality research, or strong educational sources as appropriate. Record title, organisation, URL, topic, jurisdiction, source type, last checked date, and lesson dependencies in `data/sources.json`. Regenerate the readable register with `python scripts/render_registry.py`.

Only update a review date after an actual check. Access blocks are unverified, not proof that a source is current. Do not copy changing rates or entitlement rules into generic lessons. New locality packs must identify scope and source IDs and be listed in the curriculum index.

## Assessments and licensing

Each scenario needs context, materials, task, advanced variation, criterion-linked rubric, hidden explanation, and relevant sources. Check calculations independently. A written plan cannot certify hands-on technique; a remembered answer cannot establish transfer. Record guidance used and delayed reassessment separately.

Keep competency IDs stable and never make urgent help dependent on curriculum prerequisites. Use plain language, accessible adaptations, and non-partisan civic information. Original contributions use the [MIT licence](LICENSE); linked publications retain their own rights.

## Adaptive product maintenance

Use the [architecture guide](docs/architecture.md) for canonical files, schemas and build commands. Review new variants for genuine changes in constraints and uncertainty. Preserve legacy IDs, source scope, safety gates, exposure history and access equity. Keep assessor solutions out of initial learner data and learner-facing navigation. Run the [evaluation cycle](docs/evaluation.md) with fictional evidence and the [source review process](docs/source-review.md) when guidance changes.
