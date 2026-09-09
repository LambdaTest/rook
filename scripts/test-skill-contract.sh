#!/usr/bin/env bash
# Exercise the exact documented CI recipe against synthetic responses, never a
# real rook invocation. The fake executable rejects unexpected command shapes.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v jq >/dev/null || { echo 'FATAL: jq is required' >&2; exit 2; }
python3 - "$REPO_ROOT" <<'PY'
import json, os, pathlib, re, subprocess, sys, tempfile
root = pathlib.Path(sys.argv[1])
blocks = re.findall(r'```bash\n(.*?)\n```', (root / 'skill-installer/skills/references/ci.md').read_text(), re.S)
assert len(blocks) == 1, 'keep one complete executable CI recipe'
recipe = blocks[0]
cases = json.loads((root / 'scripts/fixtures/skill-results.json').read_text())['cases']
fake = '''#!/usr/bin/env python3
import json, os, pathlib, sys
case = json.loads(pathlib.Path(os.environ['SKILL_CASE']).read_text())
a = sys.argv[1:]
with open('calls.jsonl', 'a') as f: f.write(json.dumps(a) + '\\n')
if a == ['--version']:
 print('0.1.1')
elif a and a[0] in ['login', 'project', 'agent', 'explore', 'generate']:
 print('synthetic setup')
elif a == ['sync', '--yes']:
 pathlib.Path('synced').touch()
elif a and a[0] == 'run':
 if not pathlib.Path('synced').exists():
  print('fixture: scenarios were not synced', file=sys.stderr); sys.exit(1)
 if not case.get('empty'): print(json.dumps(case['run']))
 sys.exit(case['exit_code'])
elif a == ['report', case['run'].get('run_id'), '--json']:
 report = dict(case['run']['report'])
 report['run_id'] = case.get('nested_report_id', report['run_id'])
 print(json.dumps({'run_id':case.get('report_id', case['run']['run_id']), 'dir':'fixture-evidence/R-fixture', 'report':report}))
else:
 print('unexpected fixture command: ' + repr(a), file=sys.stderr); sys.exit(90)
'''
failed = []
for case in cases:
 with tempfile.TemporaryDirectory(prefix='rook-skill-contract-') as tmp:
  wd = pathlib.Path(tmp); bindir = wd / 'bin'; bindir.mkdir()
  exe = bindir / 'rook'; exe.write_text(fake); exe.chmod(0o755)
  at = wd / 'case.json'; at.write_text(json.dumps(case))
  env = dict(os.environ, PATH=str(bindir)+os.pathsep+os.environ['PATH'],
             SKILL_CASE=str(at), LT_USERNAME='fixture', LT_ACCESS_KEY='fixture',
             ROOK_PROJECT_ID='fixture', ROOK_AGENT_ID='fixture-agent', GITHUB_RUN_ID='fixture')
  result = subprocess.run(['bash', '-c', recipe], cwd=wd, env=env, text=True, capture_output=True)
  output = result.stdout + result.stderr
  calls = [json.loads(x) for x in (wd/'calls.jsonl').read_text().splitlines()]
  problems = []
  if not any(a[0] == "run" for a in calls): problems.append("recipe failed before exercising the run contract")
  if (result.returncode == 0) != case['passes']: problems.append(f'exit {result.returncode}, expected pass={case["passes"]}')
  for needle in case.get('expect', []):
   if needle not in output: problems.append(f'missing output: {needle}')
  if case.get('no_report') and any(a[0]=='report' for a in calls): problems.append('reported a run that did not complete')
  if problems:
   failed.append(case['name']); print('FAIL:', case['name'], '; '.join(problems)); print(output)
  else: print('PASS:', case['name'])
print(f'{len(cases)-len(failed)}/{len(cases)} offline CI contract cases passed')
sys.exit(bool(failed))
PY
