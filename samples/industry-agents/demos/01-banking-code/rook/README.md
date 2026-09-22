# Native Rook scenarios — Northstar Bank / Developer

The reviewed suite in scenarios/ contains **18 authored native Rook scenarios**: 5 functional, 4 non_functional and 9 adversarial. IDs SC-101 through SC-118 follow the PRD category order. These files are ready for the installed native scenario loader; they are not execution verdicts.

Rook discovered this agent and its features from the PRD plus domain implementation. 12 raw Rook-generated drafts are preserved in generated-drafts/. Some contain invalid fixture assumptions, overly strict call prohibitions or incomplete verification requirements. They are review examples, not the ready suite. Controller 502 errors and per-phase limits prevented complete autonomous generation.

The authored suite preserves the exact acceptance examples, separates denied tool calls from successful writes, uses correlated receipt evidence, retains three-repeat non-functional cases and prior customer turns, and assigns each fault to its own profile. provenance.json records origins, feature mappings and SHA-256 hashes.

The internal native CALL assertion limitation remains reproducible in the raw drafts and earlier actual banking report. The reviewed business criteria inspect captured tool/ledger evidence. They do not claim native proxy verification.

See [native workflow](../../../docs/native-scenarios.md) for installation, profiles, full coverage checks and run commands.
