#!/usr/bin/env python3
"""Derive case-specific feedback text for assessor answers.

The shipped assessor/answers.json shares one generic `explanation` across 210 of
239 items and only two distinct `next_steps` strings across 866 entries. That
makes the Feedback stage of the Learn -> Practice -> Feedback -> Reassess loop a
no-op: a learner who is wrong in five different ways across five different cases
receives the same "revisit the guide" instruction five times, which is the exact
failure mode the curriculum claims to be designed against (mastery.md, "Reading
is not demonstration").

This script regenerates, deterministically and from each item's OWN data:
  - `explanation`   -> names the case-specific criterion guidance and the error
                       categories actually reachable for that item.
  - `next_steps`    -> one concrete re-attempt instruction per error tag, using
                       that item's declared `variant_axes` and `focus_errors`.

It deliberately does NOT touch `solution`, `common_mistakes` keys, or `version`,
so every existing validator invariant (answer.version == item.version,
set(common_mistakes) == set(error_tags)) is preserved.

Re-running is idempotent: output depends only on the committed bank + answers.

Usage:  python scripts/build_feedback_text.py [--check]
        --check  exit non-zero if regenerating would change the file (CI drift guard).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANSWERS = ROOT / "assessor" / "answers.json"
BANK = ROOT / "assessments" / "bank.json"

# Human, actionable meaning per canonical error tag. These are the repair
# instructions the learner actually receives. They are concrete ("recheck X")
# rather than the previous generic "revisit the guide".
ERROR_REPAIR = {
    "arithmetic-error": "Redo every figure from the supplied numbers and state each calculation. Show the lowest dated balance, not only the month total.",
    "missed-payment-timing": "Put the statements in date order and identify the earliest day the balance goes negative. Timing decides whether the month works, not the total.",
    "ignores-essential-cost": "List every essential cost first and protect it in the plan. Then show what is reduced and confirm the essentials still hold.",
    "assumes-missing-information": "Name the facts that were not given and state what you would need to confirm them. Do not fill a gap with a guess.",
    "fails-independent-verification": "Verify through a route you reach independently, not one supplied in the message. Name the official route you would use.",
    "unsafe-advice": "State the safety limit and the qualified help you would seek. A safe refusal or escalation is a correct answer here.",
    "reveals-sensitive-information": "Describe the verification step only. Never place a password, code or account detail in a worksheet, message or answer.",
    "overconfident-conclusion": "Match the strength of the conclusion to the evidence. Say what would change your decision rather than asserting a single answer.",
    "wrong-jurisdiction": "Check the nation and the scope of the guidance before relying on it. Do not carry a rule from one nation into another.",
    "misses-access-constraint": "Account for the access need explicitly: transport, step-free access, time of day and how you would request an adjustment.",
    "unrealistic-capacity": "Re-plan against the time and energy actually available, including rest and a contingency. A feasible smaller plan beats a complete unachievable one.",
    "ignores-consent": "Respect consent and refusal. Offer a request the other person can decline; do not proceed on assumed agreement.",
    "unverified-entitlement": "Check what you are actually entitled to against the current official source before relying on it. Do not promise an entitlement.",
    "confuses-relative-absolute": "State the denominator and compute both the absolute and the relative change before drawing a conclusion.",
    "no-fallback": "Give the fallback you would use if the primary route is closed or delayed, and say who you would contact.",
    "memorised-answer": "Apply the criterion to the changed numbers and wording in this case. An answer recalled from a previous item is not evidence.",
}


def case_explanation(item: dict, answer: dict) -> str:
    """Build a per-item explanation anchored on this item's own reference solution.

    Keying off the item's `solution` (169 distinct across 239 items) rather than
    the shared criterion guidance is what makes the learner's second feedback
    paragraph say something about *this* case instead of restating generic
    assessor instruction.
    """
    solution = (answer.get("solution") or "").strip()
    first = solution.split(". ")[0].strip().rstrip(".") if solution else ""
    tags = list(item.get("error_tags") or [])
    repairs = []
    for tag in tags:
        repair = ERROR_REPAIR.get(tag)
        if repair:
            repairs.append(repair.split(".")[0].strip())
    parts = []
    if first:
        parts.append(f"For this case a met response reaches the same conclusion as the reference: {first}.")
    else:
        parts.append("Compare your response with this case's own materials and criterion.")
    if repairs:
        joined = "; ".join(dict.fromkeys(repairs))
        parts.append(f"This item is set up to catch: {joined}.")
    parts.append(
        "A safe justified refusal, or naming a fact you cannot resolve, can meet the "
        "criterion here; a confident invented answer cannot."
    )
    return " ".join(parts)


def case_next_steps(item: dict, tag: str) -> str:
    """One concrete repair-and-retry instruction for this item + this error."""
    repair = ERROR_REPAIR.get(tag)
    axis = next(iter(item.get("variant_axes") or []), None)
    if not repair:
        repair = "Recheck this step against the case and the criterion."
    if axis:
        return f"{repair} Then attempt an unseen variant with a different {axis}."
    return f"{repair} Then attempt a different case with fresh materials."


def build(bank: dict, answers: dict) -> dict:
    """`answers` is the answers sub-dict (id -> answer object), not the whole doc."""
    items = {i["id"]: i for i in bank["items"]}
    out = dict(answers)
    for item_id, answer in out.items():
        item = items.get(item_id)
        if not item:
            continue
        new = dict(answer)
        new["explanation"] = case_explanation(item, answer)
        steps = {tag: case_next_steps(item, tag) for tag in (answer.get("next_steps") or {})}
        if steps:
            new["next_steps"] = steps
        out[item_id] = new
    return out


def main() -> int:
    check = "--check" in sys.argv
    bank = json.loads(BANK.read_text(encoding="utf-8"))
    doc = json.loads(ANSWERS.read_text(encoding="utf-8"))
    answers = doc.get("answers")
    if not isinstance(answers, dict) or not answers:
        print("ERROR: answers.json has no answers object")
        return 1
    rebuilt = build(bank, answers)
    if check:
        if rebuilt != answers:
            print("ERROR: answers.json feedback text is stale; run scripts/build_feedback_text.py")
            return 1
        print("PASS: feedback text is current.")
        return 0
    doc["answers"] = rebuilt
    ANSWERS.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(rebuilt)} answers with case-specific feedback.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())