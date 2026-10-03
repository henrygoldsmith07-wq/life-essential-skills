# Assessor reference area

[Evidence rules](../curriculum/adaptive-learning.md) · [Maintainer architecture](../docs/architecture.md)

This area contains answers and calibration examples. Keep it closed while a learner produces an independent response. Static repository files are openly inspectable by anyone with repository access: hiding feedback in the interface is an assessment workflow, not exam security. Use supervised or newly authored materials if secure assessment is required.

## Assess the original response

1. Obtain the learner's original fictional output before feedback or solving prompts.
2. Check every essential criterion in [the item bank](../assessments/bank.json), including constraints and safety. Do not reward an invented answer when facts are missing.
3. Record **not-yet** if an essential criterion is absent. Record the relevant error categories.
4. Record **assisted** if the criterion was met using solving help or an answer seen before production. Record help accurately, even when the finished output is correct.
5. Record **demonstrated** only when the full original output meets the criterion without solving help. Accessible communication formats and extra time do not count as solving assistance.
6. Record practical observations separately. A written plan cannot establish cooking or restore performance. First aid requires an appropriate qualified training pathway; this product never awards CPR competence.

## Calibration

[benchmarks.json](benchmarks.json) has four item-specific levels with a response and an explanation: not-yet, assisted, independent and advanced. Selected examples cover cash-flow timing, actual credit proceeds, post-click account recovery, travel/access uncertainty and cross-border housing. The advanced example shows adaptation beyond the independent rubric; it does not automatically award an adaptive competency.

Two assessors can independently classify the same fictional response, compare decisions criterion by criterion, and resolve differences using observable evidence. Document whether a difference concerns arithmetic, a missing constraint, help or jurisdiction. Do not use personal confidence or an average overall score to settle disagreement.

[answers.json](answers.json) is the canonical reference bank. Its [per-item feedback](feedback/M-CF-01.json) is generated for the dashboard and fetched only after an attempt is complete. Version changes require rechecking both the reference and its benchmarks. Old learner records are not silently migrated to a new assessment version.

## New materials and safety

Author a fresh item when an exposure group has already been seen. Change constraints, missing facts, timing and trade-offs, not just a person's name. Record its ID, version, exposure group, jurisdiction, source role and essential rubric. Never create a real hazard, payment, treatment change or secret disclosure as an assessment requirement.

Use only fictional evidence in shared examples. Do not put learner responses, contact details or assessor names into the local state schema. `reviewed_by` records only `self` or `assessor`, and practical observations require the latter.
