# Curriculum data and learning structure

[Mastery](mastery.md) · [Dependency map](dependency-map.md) · [Diagnostic](diagnostic.md)

[index.json](index.json) is the lightweight machine-readable curriculum. Markdown remains the learner interface; no special renderer is required.

## Records

- **Domains:** ID, title, guide and subskill paths, difficulty, entry mastery stage, estimated session time, recommended preparation, related/next skills, four competencies, subskills, locality needs, scenarios, sources, and review intervals.
- **Competencies:** stable ID, mastery stage, observable criterion, and evidence required. Domain records introduce Foundation; their competency list defines all four stages.
- **Scenarios/capstones:** paths, assessed competency IDs, source dependencies, time, stage, and preparation.
- **Pathways:** domains, capstone, and thirty explicit session records, including reassessment and reflection.
- **Locales:** Markdown and data paths. Their source lists inherit shared resources through explicit IDs.

[data/sources.json](../data/sources.json) contains source records; `RESOURCES.md` is generated from it. Locality source IDs resolve to those records, so their organisation, purpose, URL, jurisdiction, and verification date remain in one place.

## Editing safely

Keep IDs stable. Update Markdown and corresponding data together, and update dependent source records when adding a reference. Run `python scripts/render_registry.py`, then the [repository checks](../scripts/README.md). The validator checks required fields/types, paths, IDs, source relationships, competency levels, preparation cycles, scenario sections/hidden solutions, and all thirty sessions in each pathway.

Times and review intervals are practical planning suggestions, not claims about how long every learner needs. Locality requirements identify information that must be checked, not a promise that every jurisdiction has a verified pack.

## Adaptive extension

The existing index now points to observable subskills, assessment routes and a lightweight learner view. See the separate [maintainer architecture](../docs/architecture.md), [evaluation framework](../docs/evaluation.md) and [source-change review](../docs/source-review.md). The 48 legacy IDs retain their criterion scope; their evidence derives from subskill records.
