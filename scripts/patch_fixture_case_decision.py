#!/usr/bin/env python3
"""Insert a `case-decision` judgement into fictional learner fixtures.

`scripts/build_case_criteria.py` adds an essential `case-decision` row to every
bank item, so any stored attempt or assessor review must now judge that row too
(`learner/evidence.js` `validJudgements` requires one judgement per criterion).

To keep each fixture's *derived outcome* identical to before, the new judgement
mirrors that record's existing essential `criterion` judgement:
  met     -> case-decision: met
  partly  -> case-decision: partly-met
  not-met -> case-decision: not-met

This preserves the fictional narrative (a demonstrated attempt still demonstrates;
a not-yet attempt still fails) while satisfying the widened rubric.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = ROOT / "examples" / "learners"
LEGACY = ROOT / "examples" / "legacy"
NEW_ID = "case-decision"


def patch_judgements(rows):
    """Return rows with a NEW_ID judgement mirroring the 'criterion' row."""
    rows = list(rows or [])
    if any(r.get("criterion_id") == NEW_ID for r in rows):
        return rows
    source = next((r for r in rows if r.get("criterion_id") == "criterion"), None)
    if source is None:
        return rows  # nothing to mirror (e.g. observation); leave unchanged
    mapping = {"met": "met", "partly-met": "partly-met", "not-met": "not-met"}
    judgement = mapping.get(source.get("judgement"), "not-met")
    rows.append({"criterion_id": NEW_ID, "judgement": judgement})
    return rows


def main() -> int:
    changed = []
    for path in sorted(EXAMPLES.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        touched = False
        for record in doc.get("records", []):
            before = record.get("criteria_judgements")
            after = patch_judgements(before)
            if after != before:
                record["criteria_judgements"] = after
                touched = True
        for review in doc.get("reviews", []):
            before = review.get("criteria_judgements")
            after = patch_judgements(before)
            if after != before:
                review["criteria_judgements"] = after
                touched = True
        if touched:
            path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            changed.append(path.name)

    # Legacy schema-1 fixtures store unstructured criteria_met instead of
    # criteria_judgements. Migration correctly REFUSES a demonstrated record that
    # does not list every essential criterion, so a legacy record representing a
    # valid demonstration must carry the new essential id too.
    for path in sorted(LEGACY.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        touched = False
        for record in doc.get("records", []):
            met = record.get("criteria_met")
            if isinstance(met, list) and NEW_ID not in met:
                met.append(NEW_ID)
                touched = True
        if touched:
            path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            changed.append("legacy/" + path.name)

    print("Updated fixtures: " + (", ".join(changed) if changed else "none"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())