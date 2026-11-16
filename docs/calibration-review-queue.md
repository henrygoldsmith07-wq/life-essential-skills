# Case-decision calibration review queue

When `scripts/build_case_criteria.py` added the case-specific `case-decision` gate to the bank, the benchmarked items below had their rubric widened and re-baselined. The fingerprints now match, but an assessor still needs to confirm that the stored calibration references and sample responses remain valid against the wider rubric. **This is a human decision and has not been made yet** — a passing build does not mean these are reviewed.

Both `validate_curriculum.py` and `validate_adaptive.py` emit a warning per item. `scripts/check_calibration_queue.py` keeps the warning set honest: it fails in CI if a new item gains the gate without being added here, or if an item no longer warns but is still listed. Adding an item to this table is the acknowledgement that its review is now owned; change **Decision** to `Confirmed` only once an assessor has actually checked the references.

| Item | Why it needs review | Decision |
| --- | --- | --- |
| CRITICAL-THINKING-STATISTICS-I02 | Benchmarked item whose rubric now carries the case-decision gate | Pending |
| D-SC-04 | Benchmarked item whose rubric now carries the case-decision gate | Pending |
| EMERGENCIES-RESPONSE-I02 | Benchmarked item whose rubric now carries the case-decision gate | Pending |
| HEALTH-MEDICINE-I02 | Benchmarked item whose rubric now carries the case-decision gate | Pending |
| HOME-MEALS-I02 | Benchmarked item whose rubric now carries the case-decision gate | Pending |
| L-TM-03 | Benchmarked item whose rubric now carries the case-decision gate | Pending |
| LIFE-ADMIN-CONTRACTS-I02 | Benchmarked item whose rubric now carries the case-decision gate | Pending |
| M-CF-01 | Benchmarked item whose rubric now carries the case-decision gate | Pending |
| M-CR-03 | Benchmarked item whose rubric now carries the case-decision gate | Pending |
| RELATIONSHIPS-BOUNDARIES-I02 | Benchmarked item whose rubric now carries the case-decision gate | Pending |
| W-HO-03 | Benchmarked item whose rubric now carries the case-decision gate | Pending |
| WELLBEING-CAPACITY-I02 | Benchmarked item whose rubric now carries the case-decision gate | Pending |
| WORK-EVIDENCE-I02 | Benchmarked item whose rubric now carries the case-decision gate | Pending |
