# Contributing

Thanks for taking the time. This repository is where `rook` is **released**,
documented and supported — the source lives elsewhere and is not currently
public. So the most valuable contributions here are reports, not pull requests.

## What helps most

**Bug reports.** [Open one](https://github.com/LambdaTest/rook/issues/new/choose).
The details that make a report actionable, roughly in order:

- The command you ran and what you expected instead.
- `rook --version`, your OS and architecture, and `node --version`.
- What kind of agent you pointed it at — HTTP, a command, or MCP — without
  pasting anything confidential.
- The scenario id and run id, if the problem happened during a run. They appear
  in the output and name the directory under `.testmuai/rook/`.

**Verdicts you disagree with.** These are the most useful reports we get, and
the least likely to be filed. If `rook` marked something a failure and you can
show it was not — or passed something that was — say so and include the
criterion and the evidence it quoted. Grading is where the product either earns
its keep or does not.

**Anything reported as unverifiable that you believe was checkable.** `rook`
reports what it could not observe rather than guessing, but the boundary moves
as it gets better at looking. Tell us what it missed and how you would have
checked it.

**Documentation.** Corrections to anything published in this repository are
welcome as pull requests.

**The coding-agent skill.** `skill-installer/skills/SKILL.md` and its
`references/` are the single source of truth for how an AI coding agent
drives `rook`; `.claude/skills/rook/` and `.agents/skills/rook/` are
generated mirrors. Edit the canonical copy, run
`scripts/sync-skill-mirrors.sh`, and keep `scripts/test-skill-mirrors.sh`
and `SKILL_FLAGS_SELFTEST=1 scripts/test-skill-flags.sh` green. Run
`scripts/test-skill-contract.sh` (bash, Python 3 and jq) for the offline CI
recipe checks; it uses synthetic responses and never calls a target agent.
Keep the skill accurate for its pinned CLI version; verify commands and output
shapes before documenting them.

## What to leave out

Please do not paste transcripts, credentials, customer data, or the contents of
your `~/.testmuai/rook/` directory into an issue. If a reproduction genuinely
needs private material, say so in the issue and we will find another route.

Security issues do not belong in the tracker at all — see
[SECURITY.md](SECURITY.md).

## Code of conduct

Participation is covered by our [Code of Conduct](CODE_OF_CONDUCT.md).
