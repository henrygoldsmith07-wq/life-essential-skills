# Detect source changes and review meaning

[Source register](../RESOURCES.md) · [Architecture](architecture.md)

The existing external-link checker still reports reachable, broken or unverified links. The content monitor adds a separate signal: accessible, inaccessible, changed or stale. These labels are not certificates of accuracy. A source can be accessible and changed, or inaccessible and stale; the report keeps those dimensions separately.

## Selected fingerprints

`change_tracking` in the source registry records the review date, human-review requirement and an optional title/main-text fingerprint. The parser removes scripts and common navigation regions, prefers main/article text and normalises whitespace. Empty pages and common access challenges are inaccessible even when HTTP status is 200. Large pages and unsupported types remain manual-review cases.

The monitor checks sources with reviewed baselines by default. Additional important sources can be selected explicitly. Baseline absence is a review requirement, never proof of unchanged content. A text change is a manual-review signal; harmless publisher edits may trigger it, and some meaningful linked-page changes will not. Legal, clinical, financial, safety and nation-specific guidance always need a human reading the relevant actual guidance before reliance.

```sh
python scripts/check_source_changes.py --report source-change-report.json
python scripts/check_source_changes.py --ids wales-housing wales-medicine --report source-change-report.json
```

Review changed material, scope, effective dates and dependent lessons/assessments. Update content if needed, check arithmetic and source authority, then run validators and tests. If a source is inaccessible, verify it manually through the publisher or a suitable replacement rather than pretending it was read.

Only after substantive review may a maintainer attest and replace selected baselines:

```sh
python scripts/check_source_changes.py --ids wales-housing --report source-change-report.json --accept-reviewed
python scripts/render_registry.py
python scripts/build_learner.py
```

The accepting command requires explicit IDs and refuses to update any baseline if a selected page is inaccessible. CI never accepts baselines or changes review dates. The network workflow emits warnings for review signals; hard 404/410 failures still fail the existing link check. Incompatible authority scope fails fast quality CI even if the URL is reachable.
