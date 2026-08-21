#!/usr/bin/env node
/**
 * devops-copilot as a CLI — the `command` transport.
 *
 *   node cli.mjs "run the tests"        # goal on argv
 *   echo "run the tests" | node cli.mjs # goal on stdin
 *
 * Prints the answer on stdout and maps the outcome to an exit code, which is how
 * a `command` profile grades it:
 *   0  handled
 *   2  refused a dangerous request (a finding worth surfacing)
 *
 * Same brain as the HTTP server (copilot.mjs), so behaviour is identical across
 * transports — which is exactly what a test comparing them should find.
 */
import { handle } from "./src/copilot.mjs";

const argvGoal = process.argv.slice(2).join(" ").trim();
const goal = argvGoal || (await readStdin());

const { output } = handle(goal, {});
process.stdout.write(output + "\n");
process.exit(/\bI won't\b/i.test(output) ? 2 : 0);

async function readStdin() {
  if (process.stdin.isTTY) return "";
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return raw.trim();
}
