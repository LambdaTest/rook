// Verify recorded native evidence without invoking a target or changing verdicts.
import {readFile,readdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';

const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await readFile(join(root,'full-category-runs.json')));
const catalog=JSON.parse(await readFile(join(root,'catalog.json')));
assert.equal(manifest.kind,'recorded-rook-full-category-runs');
const expected=Object.entries(catalog.taxonomy).flatMap(([cl,cats])=>cats.map(cat=>`${cl}/${cat}`)).sort();
const totals={scenarios:0,attempts:0,Pass:0,Fail:0,'Unable to Verify':0};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const readYaml=async path=>yaml.load(await readFile(path,'utf8'));
const faultByProfile={'demo-normal':'none','demo-dependency-error':'dependency_error','demo-slow-tool':'slow_tool','demo-poisoned-context':'poisoned_context'};
assert.deepEqual([...new Set(manifest.runs.map(r=>r.demo))].sort(),catalog.demos.map(d=>d.id).sort());
for(const demo of catalog.demos){
  const runs=manifest.runs.filter(r=>r.demo===demo.id);
  assert.equal(runs.length,4,`${demo.id}: profile groups`);
  const coverage=[];const ids=[];
  for(const run of runs){
    const directory=resolve(root,run.directory);
    assert(!relative(root,directory).startsWith('..'),'Run path escapes package');
    assert.equal(directory.split('/').at(-1),run.runId);
    for(const [file,hash] of Object.entries(run.files)){
      const path=resolve(directory,file);assert(!relative(directory,path).startsWith('..'));
      assert.equal(digest(await readFile(path)),hash,`${demo.id}/${run.runId}/${file}`);
    }
    const report=await readYaml(join(directory,'report.yaml'));
    const plan=await readYaml(join(directory,'run.yaml'));
    const profile=await readYaml(join(directory,'profile.yaml'));
    assert.equal(report.run_id,run.runId);assert.deepEqual(report.totals,run.totals);
    assert.equal(profile.capabilities.usage,true);assert.equal(profile.hook_env.DEMO_FAULT,faultByProfile[run.profile]);
    assert.deepEqual(plan.included.map(s=>s.scenario_id).sort(),run.scenarios.map(s=>s.id).sort());
    assert.equal(report.totals.executed,run.scenarios.length);assert.equal(report.totals.planned,run.scenarios.length);
    assert.equal(report.totals.not_run,0);assert.equal(report.totals.unjudged,0);assert.equal(report.totals.unrunnable,0);
    const counts={Pass:0,Fail:0,'Unable to Verify':0};
    for(const item of run.scenarios){
      const dir=join(directory,'scenarios',item.id);
      const snapshot=await readYaml(join(dir,'snapshot.yaml'));
      const verdict=await readYaml(join(dir,'verdict.yaml'));
      const response=JSON.parse(await readFile(join(dir,'response.json')));
      assert.equal(snapshot.local_id,item.id);assert.equal(snapshot.class,item.class);assert.equal(snapshot.category,item.category);
      assert.equal(snapshot.repeat??1,item.repeat);assert.equal(response.attempt,item.repeat);
      assert.equal(verdict.scenario_id,item.id);assert.equal(verdict.run_id,run.runId);assert.equal(verdict.status,item.status);
      assert(item.status in counts,'Unknown verdict');assert(verdict.criteria.length>0);
      const sessions=new Set();
      const files=(await readdir(join(dir,'hook-state'))).filter(f=>/^evidence-[0-9a-f-]+\.json$/.test(f));
      for(const file of files){
        const evidence=JSON.parse(await readFile(join(dir,'hook-state',file)));
        assert.equal(evidence.engine,'model');assert.equal(evidence.variant,'hardened');
        assert.equal(evidence.fault,faultByProfile[run.profile]);assert.equal(evidence.closed,true);
        assert(evidence.traces.length>0,'No observed target turn');sessions.add(evidence.sessionId);
      }
      assert.equal(sessions.size,item.repeat,`${demo.id}/${item.id}: attempts`);
      counts[item.status]++;totals[item.status]++;totals.scenarios++;totals.attempts+=sessions.size;
      ids.push(item.id);coverage.push(`${item.class}/${item.category}`);
    }
    for(const [status,field] of [['Pass','passed'],['Fail','failed'],['Unable to Verify','unverifiable']])assert.equal(counts[status],report.totals[field]);
  }
  assert.deepEqual(coverage.sort(),expected,`${demo.id}: full class/category coverage`);
  assert.equal(new Set(ids).size,18,`${demo.id}: unique scenarios`);
}
console.log(JSON.stringify({kind:'recorded-evidence-integrity-check',demos:catalog.demos.length,runs:manifest.runs.length,...totals},null,2));
console.log('Verified dated evidence. This command performs no new Rook evaluation and does not require all verdicts to pass.');
