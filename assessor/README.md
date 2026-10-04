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

Use only fictional evidence in shared examples. Do not put learner responses, contact details or assessor names into the local state. Version 2 records `evidence_level` and `reviewer_type`, with separate review history. Version 1's `reviewed_by` is accepted only through checked migration.

## Review in the dashboard

Open **Assessor** in the [dashboard](../learner/index.html#assessor). Use the current local profile, or download a backup before importing another file. Choose a specific attempt, review its unchanged original response privately, compare each criterion as met/partly met/not met, and record errors. Confirm that the original output is available or that you observed the original performance directly. Save a separate assessor review and download the updated evidence file. Original attempt facts cannot be changed by this action; solving help still prevents an independent result.

Calibration references for the selected attempt are available after opening that existing record. They illustrate rubric judgements, not a preferred life choice. References cover representative cases in all domains and each capstone; uncovered items use the complete rubric and must not be treated as calibrated by association. The material/task/rubric fingerprint fails validation when a reference needs review.

## Observe safe practical performance

Choose meal preparation, harmless sample restore or demonstration-account protection, read the permitted setting and safety limits, and directly observe the actions in [practical rubrics](practical-rubrics.json). Use an appropriate trained observer for the activity, stop unsafe actions, and record help and access adjustments separately. Use fictional placeholders and safe sample materials only; no secret, real payment, personal account or hazardous intervention is needed. Mark each observed criterion explicitly and save. A later failure changes the current gate while preserving the earlier observation. Observing someone write a plan is not practical observation.

This local workflow records a review declaration; it cannot authenticate a reviewer, make an editable file tamper-proof, or certify professional competence. Do not claim those assurances from a label alone.
