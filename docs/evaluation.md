# Evaluate whether learning changes performance

[Fictional cycle](../examples/learners/evaluation-cycle.json) · [Evidence rules](../curriculum/adaptive-learning.md)

## A small evaluation cycle

1. Use a diagnostic task and record which essential criteria are present, solving help and errors.
2. Provide relevant learning and guided practice. Do not count reading as an outcome.
3. Assess the same observable ability with an unseen exposure group and comparable criteria.
4. Reassess later with another unseen group. Record the delay and any help.
5. Compare criterion evidence, help dependence and error categories across phases.

The shared engine's `evaluate` function includes every competency with attempts or supported practical evidence, including practice-only histories. It reports diagnostic, first unseen transfer, latest delayed check, latest performance, practice records, review level/type, help, prior solution exposure, item/version and date. Original outcomes remain alongside the current reviewed result; assessor reviews are separate history. Supported practical evidence is attached only to its relevant competency.

The export includes criterion judgements, criteria gained/lost where criterion IDs are comparable, and errors removed/introduced for pre/post and post/delayed pairs. Incomparable or missing criterion comparisons remain null, not zero gain. Matching IDs do not establish identical difficulty. Missing phases remain null; they never become zero performance. The dashboard downloads this descriptive version-2 report; the [fictional output](../examples/evaluation-output.json) comes from the same engine.

Do not combine unrelated criteria into an overall life score. A matched criterion ID supports comparison but does not prove equal task difficulty; the assessor must check material complexity and the actual rubric. Advanced/adaptive cases can be harder than an earlier knowledge check, so avoid interpreting their raw counts as the same measure.

## Fictional result

In the cash-flow example, the diagnostic misses payment timing, guided practice uses help, an unseen post-learning task meets all four essential criteria independently, and a later unseen check meets them again. The timing error disappears from the post record. This is useful descriptive evidence of transfer and retention, not proof that the curriculum caused improvement.

For a curriculum experiment, agree the target competencies, variant assignment, rubric, help policy, delayed interval and missing-data handling before starting. Counterbalance item order where practical and independently calibrate assessors. Compare like criteria and report participants who did not complete a later task rather than assuming they forgot. A small descriptive pilot cannot establish causality, and self-review is weaker evidence than an independent assessment.

Collect only educational records needed for the question. No names, demographics, financial account data, health records or contact details are required. Share fictional aggregate examples; keep any real learner evidence private and local. Separate accessibility support from solving assistance so the evaluation does not penalise access needs.
