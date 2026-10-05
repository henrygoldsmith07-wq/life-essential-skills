# Curriculum review: is this a curriculum or a content library?

[Product review](product-review.md) · [Evidence rules](../curriculum/adaptive-learning.md) · [Mastery](../curriculum/mastery.md)

This review treats the repository as a **competency system**, not a set of documents. The question is not "is the writing good" — it is "does the evidence machinery make *I read this* reliably different from *I can actually do this*".

All findings below were measured against the committed data (`assessments/bank.json`, `assessor/answers.json`, `curriculum/subskills.json`) and the shipped engine (`learner/engine.js`). Baseline: `scripts/validate_adaptive.py`, `scripts/validate_curriculum.py` and the 50-test engine suite all pass. **Nothing here is a broken build. These are structural gaps the current checks cannot see.**

## Verdict

The repository's *discipline* is genuinely strong — exposure tracking, help capture, immutable assessor records, essential gates, honest `fresh-materials-needed` dead ends, and a refusal to let written plans claim physical skill. That is a better evidence model than most commercial products ship, and the authors are candid about its limits.

But measured as a curriculum, the system has a specific pathology:

> **The measurement apparatus is uniform, so it cannot discriminate. Every one of the 234 items is graded against the same four rubric rows, two of which are byte-identical across the entire bank, and every independent item is asked with the same generic sentence. A fluent learner can score `demonstrated` while having performed none of the specific work the case was designed to test.**

That is precisely the "I read this" failure the curriculum claims to be designed against — and it lives in the *assessment*, not the learner.

Severity ranking below is by how much each gap weakens the learn→practise→feedback→reassess loop.

### Status of this pass

Five changes were implemented while writing this review, all constrained to preserve existing invariants. Every validator, the 61-test Python suite and the 53-test engine suite pass, and each change is a deterministic generator with a `--check` drift guard wired into CI:

- **§1 Feedback specificity — done.** `scripts/build_feedback_text.py`. The 210-way-shared learner-facing explanation and the 2-string remediation set are now 141 and 29 distinct, case-anchored strings.
- **§2 Rubric discrimination — done.** `scripts/build_case_criteria.py` adds a case-specific, **essential** `case-decision` criterion to all 234 bank items, derived from each item's own reference solution. A fluent response that never reaches the case's actual decision now scores `not-yet`. The 13 affected calibration fingerprints are re-baselined and flagged by a validator warning for human re-check.
- **§3 Reassessment runway — measured, not fixed.** A validator invariant reports, per family, the shortfall between fresh independent cases and the promised retention schedule (38 of 40 short), tracked as new cases are authored.
- **§4 Advanced-stage asymmetry — measured, not fixed.** A validator warning now reports adaptive coverage (12 of 40 families). Each domain's `advanced-scenario` still rests on one adaptive subskill; widening it requires authoring adaptation subskills for 28 families.
- **§5 Dependency-aware recommendations — done.** `scripts/build_cross_domain_prerequisites.py` encodes the documented dependency map into machine prerequisites (23 subskills), syncs assessment items, and the engine now surfaces these as a `blocked` list and recommends prerequisites first.

Sections **6 (capstone breadth) and 7 (scenario narrative)** are diagnosed but not implemented: they require authoring new calibrated assessment content (wider capstone subskill coverage, promoting the `scenarios/*.md` narrative into bank materials), which is best done with domain review rather than mechanically. The initial-payload budget was also restored by projecting unused metadata out of `learner/data.js` (405 KB → 352 KB).

---

## 1. Feedback is structurally degenerate — the loop's repair arm is a no-op

**Severity: critical.** This is the biggest single finding.

`assessor/answers.json` holds a `next_steps` remediation string per error tag. Measured across all answers:

| Quantity | Value |
| --- | --- |
| Answers in the file | 239 |
| `next_steps` entries | 866 |
| **Distinct `next_steps` strings** | **2** |
| Distinct `common_mistakes` values | 16 |
| Distinct `explanation` values | 26 |
| Distinct `solution` values | 169 |

The only two remediation strings in the entire product are:

> "Revisit the relevant guide, practise the missing step with help, then use an unseen task."
> "Revisit the guide, practise this missing step and try an unseen case."

So when a learner misses a criterion, the Feedback stage returns *"re-read the guide"*. Across 866 opportunities. The product is unambiguous that rereading is not evidence (`mastery.md` § "Reading is not demonstration"), and then hands out rereading as its primary remediation for 866 separate failures. This is the loop's own thesis applied to itself, in reverse.

`common_mistakes` is nearly as flat: 16 generic labels ("Check the arithmetic and units", "Prepare a feasible fallback") mapped to the same generic advice regardless of which case, which number, or which specific error occurred.

**Why it matters.** Feedback is the only mechanism that converts a failure into a targeted next action. As written, a learner who is wrong in five different ways across five different cases receives the same instruction five times. The loop turns without changing direction.

**Fix — done.** `scripts/build_feedback_text.py` now regenerates `explanation` and `next_steps` deterministically from each item's own reference solution, error tags and `variant_axes`. Measured result after the change:

| Quantity | Before | After |
| --- | --- | --- |
| Distinct `explanation` strings (learner-facing second paragraph) | 26 (one shared by 210 of 239) | **141** |
| Distinct `next_steps` strings (remediation) | 2 (across 866 entries) | **29** |
| Answers written | 239 | 239 |

The generator is idempotent and never touches `solution`, `common_mistakes` keys, or `version`, so calibration fingerprints (`version, scoring, materials, task`) and every existing validator invariant are preserved. `scripts/build_feedback_text.py --check` guards against drift in CI.

---

## 2. The rubric cannot tell a good answer from a fluent one

**Severity: critical.**

Every item has exactly four scoring rows, always the same ids (`criterion`, `constraints`, `safety`, `reasoning`). Across all 234 items:

| Row | Distinct criterion texts | Verdict |
| --- | --- | --- |
| `criterion` | 92 | Case-specific (one per competency) — good |
| `constraints` | 38 | Generated from the error-tag set, not from the case |
| `safety` | **1** | **Byte-identical in all 234 items** |
| `reasoning` | **1** | **Byte-identical in all 234 items** |

The `safety` row asks *"Protect privacy, respect access and consent, stay within professional limits and use guidance with the right scope"* — for every item in every domain. The `reasoning` row asks *"Explain the choice and at least one limitation or feasible next step."*

Neither row references the case. A learner who answers the digital-safety account item with well-structured generic advice about "verifying through official channels" satisfies both. A learner who answers the payslip reconciliation *correctly* can fail `reasoning` for writing too briefly. **The rubric grades register, not correctness.**

The `task` string has the same shape: **4 distinct task instructions across 234 items**. All 130 independent items are asked to "produce a complete feasible response and explain your reasoning" — no item asks a specific question. `MONEY-BUDGET-I01` gets a dated ledger and is never asked to reconcile a balance. `LIFE-ADMIN-CONTRACTS-I01` gets two contracts with absent renewal clauses and is never asked to identify the missing clause.

**Why it matters.** This is the mechanism that would separate reading from doing, and it is inert. The materials carry real constraints; the instrument ignores them.

**Fix — done.** `scripts/build_case_criteria.py` adds a fifth row, `case-decision`, to every bank item, **essential: true**, whose criterion is derived from that item's own reference solution: *"Reach this case's specific decision: Allocations total 1255."* Its guidance states that fluency about the topic is not evidence the specific decision was made, and that a partly-met response is one that "reasons fluently but stops short of, or misidentifies, this case's actual decision."

Because the row is essential, `evidence.js` `derive` returns `not-yet` unless it is met — so a response that satisfies all four shared rows but never lands the case's actual answer is now correctly recorded as not yet demonstrated. Regression test: *"the case-decision gate blocks a fluent generic answer that misses the case decision."* Capstones were left alone (they already carry per-skill `skill-N-*` rows). 141 distinct `case-decision` criterion texts across 234 items.

The `task` prompt (4 distinct strings) was deliberately left unchanged: it is the attempt instruction, and its fingerprint is part of the calibration gate. The discrimination now lives in the rubric, where it is scored.

---

## 3. Fresh reassessment is structurally exhausted before the schedule completes

**Severity: high.**

`curriculum/adaptive-learning.md` promises default intervals of **3, 7, 21, 60 days**. `curriculum/subskills.json` confirms `review_policy.default.intervals_days = [3, 7, 21, 60]`.

Measured item inventory per family:

| Metric | Value |
| --- | --- |
| Families in bank | 40 |
| Unique cases (exposure groups) per family | **3 for 26 families**, 5 for 10, 4 for 1, 7 for 3 |
| Families with a validator-enforced ≥5-variant rule | **5** (`priority_families`) |
| Families with **no** variant-coverage rule | **35** |

Foundation and independent items share exposure groups (e.g. `MONEY-BUDGET-F01` and `MONEY-BUDGET-I01` are both `money.budget-case-01`). Since the engine blocks a known exposure group from counting as transfer (`engine.js:155`, and the test *"transfer blocks foundation material recycled under a different item ID"*), doing the foundation step **consumes** one of the three cases.

**Result: a family needs 5 distinct unseen independent cases to finish the documented schedule — 1 for the foundation step (which shares a case with an independent item) plus 4 for the 3/7/21/60-day retention re-checks. Only 2 of 40 families have 5; 38 are short.** After one foundation attempt, the typical 3-case family has 2 fresh cases for 4 promised retention checks. The engine behaves correctly — it returns an honest `fresh-materials-needed` dead end rather than reusing a known answer — so this is not a correctness bug. It is an **inventory** bug that guarantees learners hit a wall at roughly the day-21 mark, exactly when spaced retention should be consolidating.

The validator previously checked only that intervals were positive, sorted and unique (`validate_adaptive.py:141`). It never checked intervals against available fresh material. The `len(variants) < 5` rule applies to 5 families, and counts *items*, not distinct *cases* — so even the guarded families were not checked against the policy.

**Status: measured, not yet fixed.** This review added the missing invariant to `scripts/validate_adaptive.py` as an honest **warning** (`distinct independent cases >= max(intervals) + 1`), so the shortfall is now visible on every validation run and can be driven down as cases are authored:

```text
WARNING: money.budget: only 3 fresh independent case(s) for 5 retention slots;
families need >= 5 distinct unseen cases to finish the default review schedule
```

The warning deliberately does **not** fail the build — per the repository's stated discipline that honest `allPass=false` / insufficient-data states must never be hidden, the target is tracked and enforced only as the bank grows. The authored-case work to reach 5 per family remains open.

---

## 4. "Advanced scenario" rests on one subskill per domain

**Severity: high.**

The promotion model is `knowledge → independent → adaptive`, and `*.adaptive` subskills exist for only **12 of 40 families**. The other 28 families top out at independent — they have no Advanced route at all.

Worse, each domain's entire `advanced-scenario` rollup resolves through **exactly one** adaptive subskill:

```text
emergencies.advanced-scenario <- emergencies.response.adaptive
money.advanced-scenario       <- money.credit.adaptive
health.advanced-scenario      <- health.medicine.adaptive
work.advanced-scenario        <- work.offers.adaptive
… (12 domains, 12 adaptive subskills, 2 items each)
```

A learner who reaches independent on budgeting, banking, payslips, saving, insurance **and** investing still cannot demonstrate `money.advanced-scenario`, because that single rollup needs `money.credit.adaptive` — a *borrowing* skill. The top of the ladder is one subskill deep and thematically arbitrary, while the middle of the ladder is richly populated.

Two items per adaptive subskill also means the entire Advanced tier rests on 24 items, each with 2 distinct cases — the same exhaustion problem as §3, concentrated at the top.

**Why it matters.** Advanced is the stage the whole framework exists to reach ("adaptable everyday judgement"). Making it depend on one arbitrarily chosen subskill undercuts the claim that progression reflects breadth.

**Fix — measured, not yet resolved.** A validator warning now reports adaptive coverage on every run (`adaptive coverage: 12/40 families have an adaptation (Advanced) route`), so the gap between the four-stage promise and the inventory is visible rather than assumed. Resolving it properly means either widening the `advanced-scenario` rollups to require several adaptive subskills per domain — which needs adaptation subskills authored for the 28 families that lack them — or restating the four-stage model as a three-stage ceiling for those families. That is a design decision plus content authoring, deliberately left to a maintainer rather than generated.

---

## 5. Prerequisite gating is real but thin, and dependencies are almost entirely intra-family

**Severity: medium-high.**

The engine *does* enforce prerequisites as a hard gate — `engine.js:150-153` computes `missing = c.prerequisites.filter(x => summaries.get(x).status !== 'demonstrated')` and pushes blocked competencies to `blocked` instead of recommending them. That is correct and well-tested.

But measured across all 92 competencies:

- **Only 3 of 92 have cross-domain prerequisites.**
- The remaining 89 are intra-family (`X.independent` requires `X.foundation`).

`curriculum/dependency-map.md` *describes* a rich cross-domain graph — critical thinking → digital safety → money → administration, health + emergencies + money → home → decisions. **That graph does not exist in the data.** The dependency map is documentation; the machine model is 40 vertical ladders.

The consequence is specific and learner-visible: `recommend()` will happily recommend `digital-safety.accounts.independent` to someone who has never demonstrated `critical-thinking.foundation`, even though the human-readable map says digital safety *prepares from* critical thinking. Two learners reading two different truths get different next tasks.

**Fix — done.** `scripts/build_cross_domain_prerequisites.py` encodes the dependency-map edges into `prerequisites` (23 subskills gained their cross-domain foundations), keeps the graph acyclic, and syncs each assessment item's `prerequisites` to its competency (capstones to the union of their targets) so the validator's exact-equality invariant holds and the engine's eligibility filter actually changes.

The engine's existing prerequisite gate (`engine.js:150-153`) now enforces the documented graph: `recommend()` reports blocked competencies with their missing cross-domain foundations and recommends a prerequisite first. For a learner targeting `major-decisions.housing.independent`, the `blocked` list now names `money.budget.foundation`, `home.meals.foundation`, `life-admin.contracts.foundation` and `critical-thinking.verification.foundation`. Regression test: *"cross-domain prerequisites block a task until the source foundation is demonstrated."*

---

## 6. Capstone evidence is strong in shape but narrow in reach

**Severity: medium.**

The five capstones are the best-designed material in the repository. They are genuinely integrated — 3–4 domains each, 4–5 subskills, 16–20 criteria, 60 minutes, and materially rich (610–854 characters of context, versus 165 median for bank items):

| Capstone | Domains | Subskills |
| --- | --- | --- |
| C01 Moving out | major-decisions + life-admin + emergencies | 4 |
| C02 First job | work + money + learning-time + life-admin | 5 |
| C03 Unexpected expense | money + critical-thinking + wellbeing + life-admin | 4 |
| C04 Suspicious payment | digital-safety + critical-thinking + life-admin | 4 |
| C05 Busy week | learning-time + wellbeing + life-admin | 4 |

Two structural limits:

1. **Capstones assess only `.independent` subskills.** No capstone validates any `adaptive` or `knowledge` competency. Advanced evidence is therefore never capstone-tested, and the capstone never exercises the adaptation behaviour the framework prizes.
2. **Only 14 of 92 subskills (15%) ever appear in a capstone.** A learner can complete all five capstones and have zero integrated evidence for most of the curriculum.

Also note the `life-admin.records` subskill appears in all five — records handling is the universal load-bearing skill, which is a defensible design choice worth stating explicitly rather than leaving implicit.

**Fix.** Add adaptive-capstone criteria for at least the domains where `advanced-scenario` matters, and rotate capstone subskill coverage so the capstone tier spans more than 15% of the curriculum.

---

## 7. Realism: the materials are good, the framing is generic

**Severity: medium.**

To be fair to the work — the **materials are strong**. They carry awkward non-round numbers, competing constraints, missing information and genuine traps. Examples sampled verbatim:

> `MONEY-BUDGET-I03` — "Income 1500. Fixed essentials 860, variable essentials 260, annual-cost reserve 100, flexible 180 and saving 120. An annual bill 1200 is already covered by the stated 100 monthly reserve; **a friend counts it again**."

That is a real trap (double-counting a reserve) that a naive answer will miss.

> `DIGITAL-SAFETY-ACCOUNTS-I01` — "A fictional email account is reused across services. A password reset relies on an old phone; **a worksheet asks for the actual password to prove setup**."

That embeds a genuine safety judgement inside the task.

The weakness is the frame around them. Median bank material is 165 characters — a one-line summary — while the hand-written `scenarios/*.md` files carry full dated ledgers and situational narrative (compare `scenarios/02-money.md`: an eleven-row dated ledger plus two loan offers with an unstated term). **The narrative quality exists in the Markdown and is absent from the bank.** The learner is assessed on the summary, not the situation.

**Fix.** Promote the `scenarios/*.md` material into the bank items they correspond to, and add mid-spectrum cases that carry partial information and require the learner to ask rather than assume.

---

## 8. Known strengths that must not be regressed

These are real and should be preserved through any change:

- Exposure tracking that survives abandoned feedback (`recordExposure`, `engine.js:186`), tested by *"opening feedback without saving still removes freshness after restart"*.
- A `memorised-answer` error tag and the rule that prior solutions cannot become transfer, tested by *"prior solutions cannot be transfer even when exposure history is absent"*.
- Outcomes derived from criterion judgements rather than self-selected — `recordAttempt` throws if `outcome` is supplied (`engine.js:191`), tested by *"a manual outcome cannot be supplied through the engine API"*.
- Help and access supports kept strictly separate, so access needs never reduce a rating.
- Immutable original attempts with separate assessor reviews — *"assessor confirmation cannot erase original help or solution exposure"*.
- Honest dead ends: `fresh-materials-needed` and `locality-needed` are returned instead of substituting a known answer.
- Deterministic recommendations, DST/leap-day safety, and jurisdiction never silently inheriting England or Wales rules.

The engine is trustworthy. The problem is what it is asked to measure.

---

## Recommended order of work

1. **Per-item discriminating criteria + case-specific `next_steps`.** (§1, §2) Highest leverage by far: these two changes are what make the Feedback stage able to tell reading from doing. The data hooks (`variant_axes`, `focus_errors`, case-specific `solution`) already exist.
2. **Encode the documented dependency graph into `prerequisites`.** (§5) Cheapest meaningful change — the intent is already written in `dependency-map.md`.
3. **Retention-capacity validator + honest scheduling.** (§3) Emit as a warning with a tracked target so the bank can grow against a measurable number rather than a vague goal.
4. **Resolve the Advanced-stage asymmetry.** (§4) Either widen rollups or state the three-stage ceiling honestly. Decide which, then make docs and data agree.
5. **Capstone breadth and adaptive coverage.** (§6)
6. **Promote scenario narrative into bank materials.** (§7)

## What this review does not claim

- No claim that the curriculum is ineffective. No evaluation data exists here, and `docs/evaluation.md` is appropriately explicit that a descriptive cycle is not causal evidence.
- No claim that the hand-written guides, scenarios or capstones are weak. Several are excellent.
- No recommendation to loosen anything in `validate_adaptive.py`. The existing gates are strict and correct; the gap is that two new invariants (rubric discrimination, retention capacity) are missing, not that old ones are too strict.
- The self-review integrity limits in `docs/product-review.md` § "Remaining weaknesses" are unchanged and still correct — local declarations can be dishonest, and adding a confidence score would not fix that.
