#!/usr/bin/env python3
"""Author genuinely new unseen cases for families short of retention runway.

The retention promise is four intervals (3, 7, 21, 60 days) of *fresh,
unseen* independent material. The engine refuses to reuse a known
exposure group (fresh-materials-needed), so a family with only three
distinct cases can complete at most foundation + two retention checks
before a learner is told to ask an assessor for new material. The
validator reports this honestly as a warning; this script closes the
gap with real, human-authored content.

Each added case differs from the existing cases by CONTEXT and
CONSTRAINT, never by numbers alone (curriculum/variation.json
minimum_meaningful_change), so each is genuinely fresh material and not
a reskin. Safety, jurisdiction scope, error tags and competency
prerequisites are copied from the family's existing independent items,
which keeps every validate_adaptive invariant (prerequisite equality,
assessment_routes, answer coverage) satisfied by construction.

New items are appended to assessments/bank.json and their authored
reference answers to assessor/answers.json. The existing builders then
derive the rest:
  - build_case_criteria.py adds the case-specific `case-decision` row
    from the authored solution.
  - build_feedback_text.py derives case-specific explanation/next_steps.
  - build_learner.py regenerates learner chunks, feedback and calibration.

Usage:  python3 scripts/add_retention_cases.py          # apply
        python3 scripts/add_retention_cases.py --check  # CI drift guard
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANK = ROOT / "assessments" / "bank.json"
ANSWERS = ROOT / "assessor" / "answers.json"
SUBSKILLS = ROOT / "curriculum" / "subskills.json"

# Distinct safety constraints, keyed by the exact first constraint of the
# family's existing items (all items in a family share one set).
SAFETY_SETS = [
    "fictional",  # Fictional data only; do not store personal records or credentials.
    "payment",    # No real payment, ...
]
IDENT_JUSTIFICATION = (
    "Only planning, arithmetic, source-verification or safety limits are assessed; "
    "no service availability, legal rule, treatment or entitlement is transferred "
    "to another jurisdiction."
)

# The authored new cases. Each entry:
#   family, id, materials, solution (case-specific decision first), title.
# solution's first clause is what build_case_criteria.py will turn into the
# case-decision criterion, so it must name the concrete decision.
NEW_CASES = [
    # ---- money.budget: essentials protection + a trap (3 -> 5) ----
    {
        "family": "money.budget",
        "id": "MONEY-BUDGET-I04",
        "title": "Budget and essential costs · case 4",
        "materials": [
            "Monthly income 1320 after deductions. Rent 545, council charge 120, food 195, energy standing charge already 60 this month, travel 78, phone 15, medicine 32. A loyalty-scheme advert offers a pair of headphones at 55 (non-essential). The medicine is due weekly and its cost for the rest of the month is 96."
        ],
        "solution": "Medicine 96 plus energy 60 are fixed essentials totalling 156; after all listed essentials the month is negative by 55 if the headphones are bought, so decline the non-essential purchase and protect the medicine and energy first.",
    },
    {
        "family": "money.budget",
        "id": "MONEY-BUDGET-I05",
        "title": "Budget and essential costs · case 5",
        "materials": [
            "Two adults share costs. One earns 1450, the other 980, and they split the rent 1200 equally. Shared groceries and bills cost 520 in total; one adult's personal travel to work is 85. One is considering moving to a cheaper area, but the other's employer relocation terms are unknown."
        ],
        "solution": "Equal rent is 600 each: the lower earner cannot meet 600 plus their share of shared costs, so the split must be based on income rather than halves; the relocation terms must be verified before any move is decided.",
    },
    # ---- money.credit: timing-first decision (already 7 groups; pad to keep schedule finishable) ----
    {
        "family": "money.credit",
        "id": "M-CR-06",
        "title": "Credit decision under changed payment dates",
        "materials": [
            "Repair cost 165. Option A: 2×90, first taken today. Option B: 5×38, first the day after payday. A new direct debit for insurance was just scheduled for the same day as B's first payment, and its amount is unconfirmed."
        ],
        "solution": "Today's available cash decides A, not the total: A needs 90 today, B needs 38 the day after payday but collides with the unconfirmed insurance debit; verify the insurance amount before choosing B because an unverified collision can make the month fail.",
    },
    {
        "family": "money.credit",
        "id": "M-CR-07",
        "title": "Credit decision with a hidden cost",
        "materials": [
            "Loan amount 300. Option A advertises no interest but a 45 admin fee taken from the advance. Option B is a 0% arrangement with a one-off 25 arrangement fee. Both repay over 3 months. The lender's cancellation terms are not stated in the advert."
        ],
        "solution": "Compare cash actually received and total repayable: A delivers 255 and must repay 300 (cost 45), B delivers 275 and must repay 300 (cost 25), so B is cheaper on stated terms but the missing cancellation terms must be checked before committing.",
    },
    # ---- major-decisions.housing (Wales): verification-first decision (5 groups; pad runway) ----
    {
        "family": "major-decisions.housing",
        "id": "W-HO-06",
        "title": "Unverified landlord claim",
        "materials": [
            "A fictional Wales rental advert states the deposit is 'protected by law' and the tenancy 'follows the standard rules'. The advert links to an unverified private page, not the official source, and no deposit-scheme information is given. The learner must decide whether to proceed."
        ],
        "solution": "Verify the deposit-scheme claim against the official Wales source before paying anything; an unverified private link cannot prove protection, so the safe decision is to request the scheme details and not transfer a deposit.",
    },
    {
        "family": "major-decisions.housing",
        "id": "W-HO-07",
        "title": "Accessible tenancy paperwork",
        "materials": [
            "A fictional Wales letting agent sends the contract only as a scanned image with no text. The learner uses a screen reader and cannot read it. The agent says 'sign and we can sort it later'. A relative offers to explain it verbally."
        ],
        "solution": "Request the contract in an accessible format from the agent before signing; a verbal explanation by a relative is not the contract, and signing unread terms is a decision made without verifying obligations.",
    },
]


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def clone_answer_template(answer, new_solution):
    """Reuse the family's answer shape (keys) with a new solution text."""
    out = dict(answer)
    out["solution"] = new_solution
    return out


def main():
    check = "--check" in sys.argv
    bank = load(BANK)
    doc = load(ANSWERS)
    skills_doc = load(SUBSKILLS)
    answers = doc["answers"]
    items = {i["id"]: i for i in bank["items"]}

    new_bank_items = []
    new_answers = {}
    for spec in NEW_CASES:
        fam = spec["family"]
        siblings = [i for i in bank["items"] if i.get("family") == fam and i.get("mode") == "independent"]
        base = siblings[-1]  # deterministic base
        if spec["id"] in items:
            print(f"NOTE: {spec['id']} already present; skipping.")
            continue
        item = json.loads(json.dumps(base))
        item["id"] = spec["id"]
        item["title"] = spec["title"]
        item["materials"] = spec["materials"]
        item["exposure_group"] = base["exposure_group"].rsplit("-", 1)[0] + "-" + str(
            int(base["exposure_group"].rsplit("-", 1)[1]) + 1
        )
        item["next_recommended_tasks"] = [i["id"] for i in siblings if i["id"] != spec["id"]][:2]
        item["answer_ref"] = f"assessor/answers.json#{spec['id']}"
        # case-decision row is derived by build_case_criteria.py from the answer.
        item["scoring"] = [s for s in item["scoring"] if s.get("id") != "case-decision"]
        new_bank_items.append(item)

        tmpl = answers.get(base["id"])
        new_answers[spec["id"]] = clone_answer_template(tmpl, spec["solution"])

    new_bank = json.loads(json.dumps(bank))
    new_bank["items"].extend(new_bank_items)
    new_doc = json.loads(json.dumps(doc))
    for k, v in new_answers.items():
        new_doc["answers"][k] = v
    # Keep each competency's assessment_routes in sync with the bank
    # (validate_adaptive line 127 requires exact equality: every item,
    # capstones included, that lists the competency must appear).
    new_skills = json.loads(json.dumps(skills_doc))
    caps_doc = load(ROOT / "assessments" / "capstones.json")
    item_ids_by_comp = {}
    for i in new_bank["items"] + caps_doc["items"]:
        for cid in i["competencies"]:
            item_ids_by_comp.setdefault(cid, []).append(i["id"])
    for c in new_skills["competencies"]:
        c["assessment_routes"] = item_ids_by_comp.get(c["id"], c["assessment_routes"])

    if check:
        stale = []
        if new_bank != bank:
            stale.append("assessments/bank.json")
        if new_doc != doc:
            stale.append("assessor/answers.json")
        if new_skills != skills_doc:
            stale.append("curriculum/subskills.json")
        if stale:
            print("ERROR: retention cases are stale; run scripts/add_retention_cases.py -> " + ", ".join(stale))
            return 1
        print(f"PASS: {len(NEW_CASES)} retention cases current.")
        return 0

    BANK.write_text(json.dumps(new_bank, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    ANSWERS.write_text(json.dumps(new_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    SUBSKILLS.write_text(json.dumps(new_skills, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"Added {len(new_bank_items)} retention case(s). Now run:")
    print("  python scripts/build_case_criteria.py")
    print("  python scripts/build_feedback_text.py")
    print("  python scripts/build_learner.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
