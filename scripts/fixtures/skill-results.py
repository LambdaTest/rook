"""Synthetic Rook 0.1.1 responses; no real agent data or model calls."""
from copy import deepcopy

BASE_RUN = {'ok': True,
 'run_id': 'R-fixture',
 'halted': False,
 'credits': 4.25,
 'report': {'run_id': 'R-fixture',
            'agent_id': 'fixture-agent',
            'generated': '2026-09-09T00:00:00Z',
            'totals': {'planned': 2,
                       'executed': 2,
                       'passed': 2,
                       'failed': 0,
                       'unverifiable': 0,
                       'unjudged': 0,
                       'not_run': 0,
                       'unrunnable': 0,
                       'decided': 2,
                       'pass_rate': 1,
                       'carried_forward': 0},
            'metrics': {'credits': 3},
            'clusters': [],
            'credits': 1.25}}

cases = []


def case(name, **options):
    item = dict(name=name, run=deepcopy(BASE_RUN), exit_code=0, passes=False)
    item.update(options)
    cases.append(item)
    return item["run"]

case('pass_without_optional_summary', passes=True, expect=['Pass: 2', 'Total credits: 4.25', 'Evidence: fixture-evidence/R-fixture/'])

run = case('failed_scenario')
run['report']['totals']['passed'] = 1
run['report']['totals']['failed'] = 1
run['report']['totals']['pass_rate'] = 0.5
run['report']['clusters'] = [{'id': 'CL-01',
  'kind': 'failed',
  'why': 'criterion failed',
  'scenarios': [{'scenario_id': 'SC-002',
                 'title': 'fixture failure',
                 'summary': 'expected refund rejected; got accepted'}]}]

run = case('unable_to_verify', passes=True, expect=['Unable to Verify: 1', 'not observable: no trace'])
run['report']['totals']['passed'] = 1
run['report']['totals']['unverifiable'] = 1
run['report']['totals']['decided'] = 1
run['report']['clusters'] = [{'id': 'CL-01',
  'kind': 'unverifiable',
  'why': 'not observable: no trace',
  'scenarios': [{'scenario_id': 'SC-002',
                 'title': 'fixture gap',
                 'summary': 'no trace'}]}]

run = case('compromised_with_no_failed_count')
run['report']['clusters'] = [{'id': 'CL-01',
  'kind': 'compromised',
  'why': 'attack landed',
  'scenarios': [{'scenario_id': 'SC-002', 'compromised': True}]}]

case('refused_with_ok_true', exit_code=1, no_report=True, expect=['profile ahead of upstream'], run={'ok': True, 'discarded': 'refused', 'halted': False, 'credits': 0, 'reason': 'profile ahead of upstream'})

case('declined', no_report=True, run={'ok': True, 'discarded': 'declined', 'halted': False, 'credits': 1.25, 'reason': 'declined'})

run = case('interrupted_with_report', no_report=True)
run['halted'] = True
run['reason'] = 'budget exhausted'

run = case('missing_run_id', no_report=True)
del run['run_id']

case('stale_report', report_id='R-old')

case('wrong_nested_report', nested_report_id='R-old')

run = case('malformed_totals')
del run['report']['totals']['failed']

case('empty_stdout', exit_code=1, no_report=True, empty=True)

run = case('fractional_counts')
run['report']['totals']['planned'] = 2.5
run['report']['totals']['executed'] = 2.5
run['report']['totals']['passed'] = 2.5

run = case('inconsistent_planned')
run['report']['totals']['planned'] = 3

run = case('inconsistent_executed')
run['report']['totals']['passed'] = 0
