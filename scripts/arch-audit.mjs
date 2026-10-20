#!/usr/bin/env node
// Module dependency audit, CLI. The analysis lives in scripts/arch-core.mjs; this
// file only parses the flags and prints the result. Assigns every source file to a
// module through scripts/arch-manifest.json, extracts the static import edges and
// reports the edges that the allowed-dependency map forbids, the unassigned files
// and the module cycles.
//
// Usage: node scripts/arch-audit.mjs [--json] [--fail-on-violations] [--print-allowlist]
//   --print-allowlist  prints scripts/arch-allowlist.json content for the current violations
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWLIST_COMMENT, MANIFEST_FILE, ManifestError, allowlistFor, auditRepo, publicResult } from './arch-core.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = new Set(process.argv.slice(2));
const JSON_OUT = args.has('--json');
const FAIL_ON_VIOLATIONS = args.has('--fail-on-violations');
const PRINT_ALLOWLIST = args.has('--print-allowlist');
for (const arg of args) {
  if (!['--json', '--fail-on-violations', '--print-allowlist'].includes(arg)) {
    console.error(`arch-audit: unknown argument ${arg}`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------- output

function renderText(result) {
  const lines = [];
  lines.push(`arch-audit (manifest v${result.manifest.version}, ${result.manifest.rules} rules)`);
  lines.push('');
  lines.push('## Modules (files)');
  for (const m of result.modules) lines.push(`${m.name.padEnd(18)} ${String(m.files).padStart(4)}`);
  lines.push('');
  lines.push('## Module edges (cross-module imports)');
  for (const e of result.moduleEdges) {
    const mark = e.violating > 0 ? `VIOLATING ${e.violating}` : 'ok';
    lines.push(`${e.from} -> ${e.to}`.padEnd(42) + ` ${String(e.imports).padStart(4)}  ${mark}`);
  }
  lines.push('');
  lines.push('## Violations');
  if (result.violations.length === 0) lines.push('none');
  for (const group of result.violations) {
    lines.push(`[${group.from} -> ${group.to}] ${group.count} import(s), ${group.typeOnly} type-only`);
    for (const item of group.items) {
      const tag = item.typeOnly ? ' (type-only)' : '';
      lines.push(`  ${item.file}:${item.line}  ${group.from} -> ${group.to}  ${item.specifier}  [${item.reason}]${tag}`);
    }
  }
  lines.push('');
  lines.push('## Unassigned files');
  if (result.unassigned.length === 0) lines.push('none');
  for (const file of result.unassigned) lines.push(file);
  lines.push('');
  lines.push('## Cycles (between modules)');
  if (result.cycles.length === 0) lines.push('none');
  result.cycles.forEach((cycle, i) => {
    lines.push(`cycle ${i + 1}: ${cycle.modules.join(', ')}`);
    for (const e of cycle.edges) lines.push(`  ${e.from} -> ${e.to} (${e.imports})`);
  });
  lines.push('');
  lines.push('## Unresolved relative imports');
  if (result.unresolved.length === 0) lines.push('none');
  for (const u of result.unresolved) lines.push(`${u.file}:${u.line}  ${u.specifier}`);
  lines.push('');
  lines.push('## Dynamic (non-literal) import/require');
  if (result.dynamic.length === 0) lines.push('none');
  for (const d of result.dynamic) lines.push(`${d.file}:${d.line}  ${d.text}(...)`);
  lines.push('');
  lines.push('## Summary');
  for (const [key, value] of Object.entries(result.summary)) lines.push(`${key}: ${value}`);
  return lines.join('\n');
}

let result;
try {
  result = auditRepo(ROOT);
} catch (error) {
  if (!(error instanceof ManifestError)) throw error;
  console.error(`arch-audit: invalid manifest ${MANIFEST_FILE}`);
  for (const problem of error.problems) console.error(`  - ${problem}`);
  process.exit(2);
}

if (PRINT_ALLOWLIST) {
  process.stdout.write(`${JSON.stringify({ $comment: ALLOWLIST_COMMENT, entries: allowlistFor(result) }, null, 2)}\n`);
} else if (JSON_OUT) {
  process.stdout.write(`${JSON.stringify(publicResult(result), null, 2)}\n`);
} else {
  process.stdout.write(`${renderText(result)}\n`);
}
if (FAIL_ON_VIOLATIONS && result.summary.violatingImports > 0) process.exit(1);
