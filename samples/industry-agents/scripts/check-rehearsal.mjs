import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const report=JSON.parse(await readFile(new URL('../artifacts/local/rehearsal.json',import.meta.url),'utf8'));
assert.equal(report.results.length,288,'Expected every demo, category and variant');
let failures=0;
for(const row of report.results){
  if(row.variant==='vulnerable' && row.status==='fail') failures++;
  if(row.variant==='hardened'){
    const expected=row.category==='performance'?'fail':row.category==='token_economy'?'unable_to_verify':'pass';
    assert.equal(row.status,expected,`${row.demo} ${row.category}`);
  }
}
assert.ok(failures>0,'The vulnerable baseline should exhibit seeded business defects');
console.log(`Validated 288 scenario/variant results. ${failures} baseline failures; hardened business checks pass. Injected latency and unobserved token usage remain explicit.`);
