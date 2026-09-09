# Authentication and access

[Guide index](README.md) · Next: [Profiles](profiles.md)

Rook 0.1.1 requires network access and a TestMu AI account. Account access,
tool permissions, and the target's own credentials serve different purposes.

## Sign in and select a project

For a browser sign-in:

```bash
rook login
rook auth status
```

For headless sign-in, supply these variables through your environment or CI
secret store; keep command tracing off:

```bash
rook login --username "$LT_USERNAME" --access-key "$LT_ACCESS_KEY"
```

Choose an existing project or create one, then select the intended local agent:

```bash
rook project use <project-id>
rook agent use <agent-id>
```

Use `rook project create <name>` if you need a new project. Run `rook doctor`
to inspect setup and reachability. `rook auth status` exits `1` when signed out
or expired, but an unreachable service can exit `0`; read its diagnostic.
`rook logout` revokes the stored token and clears credentials.

## Tool permissions

Headless Rook refuses tool permission requests without effective authorization.
Prefer a narrow rule such as `--allow 'bash(npm test)'`; repeat `--allow` for
additional call shapes or scope a rule to a phase, such as
`--allow 'bash(git *)@explore'`. Choose rules for the actual target and task.

`--yes` supplies broad approval for one command and does not write settings.
Existing deny policy still applies. Existing policy or session grants may
authorize calls without either flag; read tools need no grant. Omitting flags
does not establish that a command is read-only.

Review the target's `agent.yaml` and its declared writes before the first
profile or run call. Rook 0.1.1 does not pause for a per-target write-tool
confirmation in headless mode. Authorize those actions and credit spend in
your coding-agent session or CI setup, and use a staging target.

## Credits

`explore`, `generate`, `profile add`, `profile fix`, `run`, `ask`, and
`report --rca` spend Rook model credits. `profile test` uses no Rook model
credits but makes one real target call. A free command may still use the
network or change state; the target may have its own costs.

```bash
rook plan --json
```

Check the balance before a long task. `credits: null` means Rook could not
fetch it. It does not mean zero. Track an agreed budget across commands and
keep batches small: **0.1.1 has no aggregate task-credit-limit flag**.

Record reported spend when available. `profile add` may omit a credit total;
absence of a total does not make it free. A balance change can include other
account activity and is not a per-command receipt. Retain both measurements
if they disagree. Request additional paid explanation with `--rca` only after
approving that spend.

## Credential storage

Your project `.testmuai/rook/` holds agents, scenarios, profiles, runs, and
evidence. `~/.testmuai/rook/` holds credentials, settings, permission grants,
and session transcripts; do not commit or cache that home directory.

Keep target secrets outside profiles and scenarios. Use `${VAR}` references
and [profile environment values](profiles.md#environment-values). Review
project evidence for sensitive target data before sharing it.
