# In CI

```bash
rook login --username "$LT_USERNAME" --access-key "$LT_ACCESS_KEY"
rook project use "$ROOK_PROJECT_ID"
rook explore . --yes
rook agent use <agent-id>
rook generate --yes --json
rook run --concurrency 3 --name "ci-$GITHUB_RUN_ID" --yes --json > run.json
rook report --json > report.json
```

Gate on the verdicts, not on the exit code: a finished run exits 0 whether
scenarios passed or failed at 0.1.1. Fail the job when `report.json` shows a
`Fail` or a `compromised` scenario. Do not fail it on `Unable to Verify`
alone; print those and their reasons.

Cache `.testmuai/rook/` between runs if you want history and the
"what changed" comparison. Never cache or commit `~/.testmuai/rook/`.

`--yes` is the consent for every tool call in that command. In CI that is
acceptable because a person reviewed the workflow file. It is not acceptable
against a production agent; see the safety section of the skill.

Runners without a terminal are detected: rook is headless whenever stdin is
not a TTY or a CI environment variable is set.
