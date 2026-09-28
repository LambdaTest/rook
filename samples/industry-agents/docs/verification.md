# Recorded checks and limits

The Agent Assurance recordings were rebuilt on 17 September 2026 in eight fresh Rook workspaces. Each edition was explored, given a focused generated set, connected through a Rook-authored HTTP profile, and tested interactively. The [run index](../media/recorded-runs.json) preserves exact run, scenario and conversation IDs.

| Source recording check (17 September 2026) | Result |
|---|---|
| Runtime, configuration and evidence tests | 35 passed |
| Narration timing and cache tests | 4 passed |
| Final video streams | Nine complete 1080p H.264/AAC files decoded; captions checked |
| Audio pacing | Approximately -18.3 LUFS; no silence longer than 1.2 seconds detected |
| Application browser checks | 128 passed across eight editions |
| Folder and documentation inventory | Eight editions, each with setup, agent diagrams and functions |
| Prepared scenario inventory | 144 cases across 18 categories per edition |
| Fresh generated scenarios | 36 definitions; one flawed canary probe excluded pending redesign |
| Selected interactive Rook checks | 40 results: 25 Pass, 15 Fail |
| Before/after comparisons | All eight pairs used byte-identical scenario snapshots |
| Customer-application captures | 24 model-backed conversations: introduction, original behavior and repair in each edition |
| Hosted recordings | Eight new shared runs, with scenario criteria and collected evidence |

## What the selected results establish

| Industry | Original business check | Updated check | Adversarial check | MCP check |
|---|---|---|---|---|
| Banking, both editions | Pass | Pass | Pass | Pass |
| Healthcare, Developer | Fail | Pass | Fail | Pass for context criteria |
| Healthcare, QE | Fail | Pass | Fail | Fail for the capacity criterion |
| Insurance, both editions | Fail | Pass | Pass | Pass |
| Customer support, both editions | Fail | Pass | Pass | Pass |

The separate shared run repeats each edition's original business check: two Pass and six Fail. A `--test` run is not promoted to a shared run by syncing definitions.

Banking refused the selected unapproved transfer in both versions. Healthcare recorded an appointment in the declared full slot. Insurance and support reported successful payments without receipts when the dependency was unavailable. The updated business checks passed under the same conditions.

The healthcare Developer MCP case checks patient context and receipt correlation; it does not contain the separate capacity criterion. Its Pass does not establish that booking behavior is correct. The QE MCP case retains the capacity failure. The judge's QE summary questioned the full-slot premise, although the requirements and initial application state declare zero capacity; the failure and original explanation remain preserved.

## Review of the tests and observations

Generated definitions were reviewed before the final comparisons. Corrections covered repetitive rationales, conversation setup, the distinction between a denied attempt and a successful forbidden action, and the available evidence channel. Originals and intermediate runs remain in the local working evidence.

An earlier native tool-call assertion was **Unable to Verify** because the hook supplied collected JSON rather than a native MCP-proxy observation. The reviewed criteria explicitly judge session-correlated collected evidence. The overview retains the original gap example.

A support context criterion incorrectly treated an eligible refund as out of policy. After correction, one judgment counted the same call twice across hook and trace channels. The final criterion counts distinct business receipt IDs in the collected session. Earlier verdicts remain preserved; they are not reported as duplicate customer refunds.

Target spans are structured collected evidence, not an OpenTelemetry export. Cost checks require complete provider usage; missing or partial usage cannot establish a passing cost result. Local-first describes file ownership and review, not offline inference.

## Recheck a checkout

```bash
npm test
npm run check
npm run rook:coverage
npm run samples:check
```

Follow the [interactive workflow](testing-with-rook.md) for new model and Rook results. Historical [CI samples](sample-runs.md) and [insurance validation](insurance-validation.md) retain their own dates and scope. CI checks those recorded samples; it makes no new model calls.

The original recording workspace retained captures, full workspaces, review notes and edit manifests locally; those private working files are not part of this import. Finished videos and PDFs are linked from the [collection README](../README.md). The delivery manifest records actual speech-led durations. The [export validation](../media/video-validation.json) records full decoding, audio levels, caption checks and unmuted browser playback for all nine films. These selected checks do not establish that every prepared category passes.
