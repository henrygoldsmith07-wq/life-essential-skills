#!/usr/bin/env python3
"""Insert the cross-domain foundation prerequisites a fixture now needs.

After `scripts/build_cross_domain_prerequisites.py` encodes the documented
dependency map, several fictional learner profiles no longer demonstrate the
prerequisites their target competency requires. This adds the minimal
demonstrated-foundation records so each fixture keeps exercising its original
intent (the engine gate is correct; the fixture must show the prerequisite).

It is idempotent: a prerequisite already demonstrated in the fixture is skipped.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = ROOT / "examples" / "learners"

# fixture -> prerequisite competency ids to ensure are demonstrated
NEEDS = {
    "wales-housing.json": [
        "critical-thinking.verification.foundation",
        "money.budget.foundation",
        "home.meals.foundation",
        "life-admin.contracts.foundation",
    ],
    "cash-flow-gap.json": [
        "critical-thinking.verification.foundation",
        "digital-safety.accounts.foundation",
    ],
}

# foundation demonstration item for each prerequisite competency
ITEM_FOR = {
    "critical-thinking.verification.foundation": "CRITICAL-THINKING-VERIFICATION-F01",
    "digital-safety.accounts.foundation": "DIGITAL-SAFETY-ACCOUNTS-F01",
    "money.budget.foundation": "MONEY-BUDGET-F01",
    "home.meals.foundation": "HOME-MEALS-F01",
    "life-admin.contracts.foundation": "LIFE-ADMIN-CONTRACTS-F01",
}


def foundation_record(comp_id: str, seq: int, date: str = "2026-09-22"):
    item = ITEM_FOR[comp_id]
    return {
        "id": f"fictional-{item}-2026-09-22",
        "competency_id": comp_id,
        "item_id": item,
        "assessment_version": 1,
        "date": date,
        "phase": "diagnostic",
        "outcome": "demonstrated",
        "help_used": False,
        "access_supports": [],
        "error_tags": [],
        "solution_seen": False,
        "attempt_id": f"legacy-fictional-{item}-2026-09-22",
        "criteria_judgements": [
            {"criterion_id": cid, "judgement": "met"}
            for cid in ["criterion", "constraints", "safety", "reasoning", "case-decision"]
        ],
        "evidence_level": "assessor-reviewed",
        "reviewer_type": "assessor",
    }


def main() -> int:
    for name, needs in NEEDS.items():
        path = EXAMPLES / name
        doc = json.loads(path.read_text(encoding="utf-8"))
        have = {r.get("competency_id") for r in doc.get("records", [])}
        add = [c for c in needs if c not in have]
        if not add:
            continue
        # Insert prerequisites at the front, preserving order.
        new_records = [foundation_record(c, i) for i, c in enumerate(add)]
        doc["records"] = new_records + doc["records"]
        path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{name}: added {len(add)} prerequisite record(s): {', '.join(add)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())