# The learner product

*Prepare for real life before you have to handle it for real.*

This document explains the product surfaces a learner actually touches, and the boundaries that keep them honest. It is deliberately short: implementation detail belongs in the architecture guide, not here.

## The Independence Roadmap

The roadmap answers four questions at a glance:

- **What can I already do?** Capabilities shown independently, and capabilities still shown after a later fresh check.
- **What am I weak at?** Capabilities needing practice, and those completed only with help.
- **What should I learn next?** One recommended next step, chosen by the engine, with the reason attached.
- **Why is that skill useful?** Every domain links to its guide.

There is **no overall "life score"**. A single number would imply the twelve domains are commensurable, which they are not, and it would hide the evidence behind it. Instead each of the 92 capabilities carries its own state:

| State | Meaning |
| --- | --- |
| Can do this | Shown independently, in material you had not seen |
| Can still do this | Also passed a later fresh check |
| Done — check later | Shown independently; a later check is scheduled |
| Done with help | Completed, but with solving help or familiar material |
| Needs practice | An essential criterion was not met |
| Understood | Knowledge check met. Written knowledge is not performance |
| Not started | No evidence recorded yet |

### Milestones

Milestones ("Can manage a monthly budget", "Can verify a suspicious request") are capability claims, not badges. Each names the competencies that must be demonstrated, and appears as earned **only** when the engine already says so. They cannot be awarded by reading, by a goal, or by time served.

### Blocking

Where one skill is genuinely sequenced behind another, the roadmap says so and names the prerequisite. This is honesty, not discouragement: knowing *why* a strong skill is waiting is more useful than being offered something impossible.

## Goal-based onboarding

A new learner picks a real situation — moving out, a first job, starting university or college, becoming financially independent, general independence, or becoming safer online — and answers one or two short questions.

The questions never award evidence. They set a pathway and a set of focus competencies, which is an evidence-free state change validated by the existing rules. After that, the engine's own recommendation logic does the work. Locality selection stays prominent and prominent throughout, because several tasks depend on nation-specific rules and services.

## Life-transition simulations

The five simulations turn the capstones into evolving situations rather than worksheets.

| Simulation | Situation |
| --- | --- |
| Moving out in six weeks | Compare two homes, read the paperwork, then a change of income and transport forces you to decide again |
| Your first job | Check an offer, reconcile a payslip, then two problems compete for attention and you must choose which to raise first |
| An unexpected £300 | Size the shock, compare the real cost of the options, then the plan you chose is hit by a cut in hours before the payment is due |
| A suspicious payment request | Notice the pressure, verify through a route the requester did not choose, then protect next time |
| The week that overloaded | See the real shape of the week, revise by testing yourself, then hours are cut and the deadline moves |

Each works in three parts, and **each part changes the situation** — a fact you relied on stops being true and a new constraint appears. This is checked in the data, not just intended: `scripts/verify_content.js` fails if a final stage reports an outcome rather than introducing a changed circumstance, or fails to pose a real decision.

**Evidence is unaffected.** A simulation is a presentation layer over the existing capstone assessment. It stores evidence per subskill exactly as before, and it cannot change how an outcome is derived.

## Fresh scenarios

Most families do not yet have enough genuinely distinct cases to complete the four-interval retention schedule. Rather than weaken the exposure rules, the repository now defines a **variation architecture** (`curriculum/variation.json`).

A variant must change at least one meaningful dimension:

> context · constraints · trade-offs · missing information · ambiguity · irrelevant information · timing · error trap · decision type · difficulty

**Changing the numbers alone is explicitly not sufficient.** A case that differs only by arithmetic can be passed without re-applying the decision, which would overstate real transfer. `scripts/validate_variation.py` enforces this and reports which families rely on weak variation.

Every generated candidate must carry the metadata contract in that file — base item, changed axes, a variant digest, jurisdictions, expected error tags and a calibration status — and only `calibrated` material may enter the bank.

## Feedback

Feedback is built to answer seven questions: what you got right, what was missing, why it mattered, which competency is affected, what to practise, what fresh situation to try next, and when to expect reassessment.

It names the actual case, criterion and decision rather than repeating "revisit the guide", and it offers the next practice as an action inside the feedback itself.

## The evidence model

Unchanged, and treated as the product's foundation rather than an implementation detail.

- Outcomes are **derived** from criterion judgements, help and errors — never selected.
- Essential criteria must all be met.
- Help and prior solution exposure cap what an attempt can prove.
- Familiar material cannot become fresh transfer.
- Access adjustments change the route to evidence, never the standard.
- Written answers cannot claim a physical skill.
- Assessor review is recorded separately from self-review.

In the interface these are expressed in plain language: *practise with help*, *do it yourself*, *adapt*, *a later check*. The learner meets the terminology only when they need it.

## AI boundaries

AI may help generate candidate situations, alternative examples, personalised explanations and practice coaching. It may never:

1. grade, judge a criterion, or derive an outcome — only `evidence.js` does that;
2. turn an assisted performance into independent evidence;
3. persist an AI artefact into the learner's evidence state.

Every AI-produced artefact is marked as an AI-assisted draft, counts as solving help, and is never persisted. The whole product works with no AI adapter installed; `learner/ai-boundary.js` ships the interface and the guards, and no provider.

## Your Independence Profile

A human-readable progress report you can print or save as PDF. It shows demonstrated capabilities, developing areas, milestones, retention status, observed practical evidence and what to do next. A milestone is only reported as "under way" once you have actually engaged with something it depends on — an untouched milestone is shown as not started, because calling all 23 of them in progress would flatter you rather than inform you.

It is explicitly **a learning record, not a qualification**. Most of it is self-reviewed, which is a local judgement rather than independent verification. It contains no written responses, no account details and no identifiers.

## Privacy

Local-first and unchanged. No mandatory login, no analytics, no backend. Your written response is temporary and never stored. Only bounded educational evidence is kept, in this browser. Download a backup if you want one.

The state and interfaces are structured so encrypted sync or accounts could be added later without rewriting the competency engine.