# Repository quality checks

[Contributing](../CONTRIBUTING.md) · [Content checklist](../CONTENT-QUALITY.md)

Python 3.10+ is sufficient for the standard-library checks. Node.js 20+ and npm are used only for Markdown linting. Learners do not need any of these tools.

```sh
python scripts/validate_curriculum.py
python scripts/render_registry.py --check
python -m unittest discover -s tests -v
npx --yes markdownlint-cli2@0.18.1
python scripts/check_external_links.py
```

Edit `data/sources.json`, then run `python scripts/render_registry.py` to update the readable register.

## What the checks cover

- Required metadata fields/types and stable references.
- Twelve domains, four ordered stage criteria per domain, preparation cycles, and source dependencies.
- Scenario/capstone sections, competency rubrics, and solutions wholly inside `<details>`.
- Thirty ordered sessions in each pathway, with matching Markdown days.
- Internal file links and Markdown anchors.
- Source/locale metadata and review-age warnings.
- Markdown formatting and readable tables.
- Public external URLs with three attempts and bounded timeouts.

Automated checks cannot validate medical/legal advice, establish a source's relevance, or assess a learner's actual ability. Use the editorial checklist as well.

## External-link policy

404/410 and other permanent client failures fail the check. Access blocks, rate limits, server failures, and exhausted network retries are reported as **unverified**, not reachable. Use `--strict` to fail on those too, or `--report path.json` to retain a detailed local report. These records do not update source review dates automatically.

The small exception file requires an exact URL, permitted status codes, reason, and expiry. It cannot suppress a 404/410 or turn a blocked source into a reachable one. Review expired exceptions. The workflow runs on relevant pushes and manual requests; it does not create scheduled account activity.

GitHub Actions uses read-only repository permission. `quality.yml` checks structure, tests, rendering, and lint; `external-links.yml` isolates network-dependent checks so their limits remain visible.
