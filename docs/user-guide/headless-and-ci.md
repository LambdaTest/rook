# Headless use and CI

[User guide](README.md) · [Troubleshooting](troubleshooting.md)

Use the [canonical CI recipe](../../skill-installer/skills/references/ci.md)
with your installed CLI. It requires bash, jq, a selected project and agent,
a configured profile, and credentials supplied through CI secrets. Review target writes,
credit spend, and tool grants before enabling it. Headless mode applies when
stdin is not a TTY or a supported CI environment variable is set.

The recipe syncs scenarios and the profile before running. For a local result,
omit sync and use `run --test` with the same checks. Retain project history;
never cache the home credential directory.

## Check outputs and results

`--json` is command-specific. Some releases emit text from `explore`, `generate`,
`sync`, profile commands, `report --rca`, or ordinary `update` despite the flag.
Parser errors and admission refusals on `report`, `status`, or `ask` can leave stdout empty.
Keep stderr and inspect it when there is no JSON diagnostic. See the
[output contract](../../skill-installer/skills/references/headless-contract.md).

A run can exit `0` with failed scenarios. A refusal can exit `1` with
`ok: true, discarded: "refused"`; read `reason`. Declined or halted runs can
exit `0`. Check completion and the returned run ID before reading its report;
do not fall back to the latest report after an error.

The recipe checks report identity and counts. It fails on command errors,
incomplete runs, failed or compromised scenarios, unjudged/not-run scenarios,
and zero executed scenarios. It prints Unable to Verify and unrunnable counts
as gaps without failing on those counts alone. A green job can therefore
still have gaps you need to inspect.
