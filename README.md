# Life Essential Skills

[Open the learner dashboard](learner/index.html) · [The learner product](docs/product.md) · [How evidence works](curriculum/adaptive-learning.md) · [Deploying to Vercel](#deploying-to-vercel)

*Prepare for real life before you have to handle it for real.*

Use **Today → Learn → Practice → Feedback → Reassess**. The dashboard adapts to educational evidence stored locally in your browser. The text curriculum below remains available. To launch the interface, follow the short [dashboard instructions](learner/README.md).

## What you get

- An **Independence Roadmap** showing what you can already do, what needs work, what is blocked and why — with no overall score, because a single number would hide the evidence behind it.
- **Goal-based onboarding**: pick a real situation (moving out, first job, starting university, financial independence, general independence, safer online) and get a roadmap built from what you actually need.
- **Life-transition simulations** that develop in three parts, where part three changes the situation and you have to decide again.
- **Milestones** like "Can reconcile a payslip" that appear only when your own evidence backs them.
- A printable **Independence Profile** — a learning record, not a qualification.

Start from [the learner product guide](docs/product.md).

Outcomes follow structured criterion judgements, help and errors. Progress distinguishes self-review, assessor review and observed practical checks. The [local assessor workflow](assessor/README.md) keeps reviews separate from original attempts; five integrated capstones record results by subskill. See the candid [product review](docs/product-review.md) for remaining limits and the [curriculum review](docs/curriculum-review.md) for a competency-system assessment of the learn–practise–feedback–reassess loop.

**Learn, practise, demonstrate, revisit: practical skills for an independent life.**

Twelve short guides support a competency-based curriculum. Progress means what you can do with realistic situations, not how many pages you read. Everything works in Markdown; no app or paid subscription is required.

## Start with your needs

1. Try the [practical diagnostic](curriculum/diagnostic.md) and choose two priorities.
2. Choose a [30-day pathway](learning-plan/README.md): general, independent living, money/admin, digital safety, or school to work.
3. Read a short guide, practise a subskill, and attempt its [scenario](scenarios/README.md) before opening the explanation.
4. Record the criterion, evidence, help used, and later result in your local [progress tracker](templates/progress-tracker.md).

For a first 20-minute session, use [START-HERE](START-HERE.md). If a situation needs urgent help, use appropriate services before a learning exercise.

## What does mastery look like?

**Foundation → Applied → Independent → Advanced scenario.** Each domain has four observable criteria. Understanding, guided practice, independent demonstration, and later retention are recorded separately. The [mastery framework](curriculum/mastery.md) explains how to assess an attempt; advanced scenario does not mean professional qualification.

Use the [dependency map](curriculum/dependency-map.md) to see supporting skills, recommended next steps, and optional branches. Prior evidence lets you skip work you already demonstrate.

## The twelve guides

| Guide | What you will be able to do | First practical task |
| --- | --- | --- |
| [01 · Emergencies](guides/01-emergencies.md) | Prepare for an emergency and find qualified first-aid training | Make an emergency plan |
| [02 · Money](guides/02-money.md) | Build a budget, understand borrowing, and plan a buffer | Make a one-month budget |
| [03 · Physical health](guides/03-health.md) | Plan manageable food, movement, sleep, and healthcare routines | Choose one repeatable habit |
| [04 · Emotional wellbeing](guides/04-wellbeing.md) | Notice stress, choose a next step, and ask for support | Build a support plan |
| [05 · Relationships](guides/05-relationships.md) | Listen, communicate needs, respect consent, and set boundaries | Practise a clear request |
| [06 · Critical thinking](guides/06-thinking.md) | Check claims and make decisions under uncertainty | Investigate one claim |
| [07 · Digital safety](guides/07-digital-safety.md) | Protect accounts, spot scams, and recover important files | Secure your main email |
| [08 · Everyday independence](guides/08-home.md) | Plan meals, clean safely, and handle basic household tasks | Cook one simple meal |
| [09 · Work and earning](guides/09-work.md) | Show your skills, prepare for interviews, and evaluate opportunities | Write one evidence-based CV example |
| [10 · Learning and time](guides/10-learning-and-time.md) | Learn actively, prioritise, and review your week | Run a 20-minute learning session |
| [11 · Life administration](guides/11-life-admin.md) | Organise documents, read agreements, and track responsibilities | Build an admin checklist |
| [12 · Major decisions and community](guides/12-major-decisions.md) | Compare housing, transport, education, and other choices | Compare two real options |

Each guide preserves **Goal → Learn → Example → Practise → Self-check → Done when → Sources**, then links to its expanded subskills and mastery criteria. The original exercise is a first milestone; it does not automatically establish independent mastery.

## Practise with realistic materials

- [Scenario library](scenarios/README.md): twelve assessments using fictional messages, statements, payslips, contracts, offers, adverts, shopping lists, and scheduling problems.
- [Capstone challenges](capstones/README.md): moving out, first job, unexpected expense, suspicious payment, and busy week.
- [Fresh reassessment cards](curriculum/reassessment.md): test retained ability with changed materials.
- [Assessment record](templates/assessment-record.md): criterion-level evidence and help used.

Solutions are hidden beneath expandable sections. Written judgement and hands-on skill are assessed separately; a plan does not prove that you can cook or perform first aid.

## Tools to use locally

| Need | Worksheet |
| --- | --- |
| Track demonstrations and retention | [Progress tracker](templates/progress-tracker.md) |
| Assess a specific attempt | [Assessment record](templates/assessment-record.md) |
| Plan income, costs, and bill timing | [Budget](templates/budget.md) |
| Prepare household contacts and access needs | [Emergency plan](templates/emergency-plan.md) |
| Compare options and uncertain claims | [Decision journal](templates/decision-journal.md) |
| Plan realistic capacity and later reviews | [Weekly review](templates/weekly-review.md) |
| Make clear enquiries and complaints | [Communication template](templates/communication.md) |
| Verify a local service | [Local resource check](templates/local-resource-check.md) |

## Choose your locality

Start with [localisation](locales/README.md). The [UK pack](locales/uk/README.md) provides shared resources and scope limits; the [Wales pack](locales/uk-wales/README.md) adds healthcare, housing, advice, careers, transport, and local hazards. England-only housing or healthcare guidance must not be substituted for Wales.

Use the maintained [source register](RESOURCES.md) for organisation, purpose, jurisdiction, verification date, and dependent lessons. Generic lessons do not hard-code changing legal rates or entitlements. This is general education; personal medical, financial, legal, and emergency decisions may require qualified help.

## Privacy and accessibility

Copy worksheets into `personal/` locally; that folder is ignored by Git. Keep actual identity documents, account details, passwords, recovery codes, contacts, and health records out of GitHub, including private repositories. Use fictional or redacted evidence. `.gitignore` is a guardrail, not secure storage.

Use spoken, typed, or other accessible responses; adapt tasks to your abilities and equipment. Split sessions as needed. No real payment, treatment change, hazardous repair, or disclosure is required for assessment.

## Deploying to Vercel

The learner app is a **dependency-free static site** — plain HTML, CSS and ES modules with committed generated assets. It needs no build step, no server runtime and no environment variables, because all evidence stays in the learner's browser.

Deploy by importing the repository in Vercel; [`vercel.json`](vercel.json) sets `framework: null`, `buildCommand: null` and `outputDirectory: "."`, so Vercel serves the repository as static files without running a build. The root `index.html` is a landing page linking to `/learner/`.

Two deployment safeguards:

- [`.vercelignore`](.vercelignore) keeps maintainer-only paths (`scripts/`, `tests/`, `.github/`) out of the upload and excludes the aggregate `assessor/answers.json` and `assessor/benchmarks.json`, so a deployed site never serves every reference solution in one request. The browser only ever loads the per-item `assessor/feedback/<id>.json` and `assessor/calibration/<id>.json`, and only after an attempt.
- `scripts/static_smoke.js` verifies every runtime asset resolves over HTTP with the right content type, that `learner/data.js` embeds no solutions, and that `.vercelignore` neither drops a required asset nor leaks the aggregate answer files. It runs in CI.

To preview locally before deploying, serve the repository root over HTTP (`python -m http.server 8000`) and open `/learner/`. Re-run the drift checks after editing content: `python scripts/build_learner.py`, then `python scripts/static_smoke.js`.

## Maintaining the curriculum

[CONTRIBUTING](CONTRIBUTING.md) and the [content checklist](CONTENT-QUALITY.md) cover improvements. [Structured metadata](curriculum/README.md) connects lessons, competencies, scenarios, pathways, locales, and sources for future tools. [Repository checks](scripts/README.md) validate those connections, sections, links, and Markdown; external checks report access blocks honestly.

Original content and code use the [MIT licence](LICENSE); linked publications retain their own rights. See [CHANGELOG](CHANGELOG.md).
