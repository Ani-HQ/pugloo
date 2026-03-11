# Changelog

All notable changes to this project are documented in this file.

## 0.1.5 - 2026-03-11

- Fixed local `.test` domains hanging by normalizing `{ port }` mappings into upstream proxy targets.
- Stabilized macOS port forwarding by loading PF rules into a dedicated anchor instead of replacing the main ruleset.
- Improved CLI behavior for `start`, `map`, and `up` by ensuring port forwarding setup is attempted consistently.
- Added regression tests for proxy route normalization.
