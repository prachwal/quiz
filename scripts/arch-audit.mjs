#!/usr/bin/env node
// Module dependency audit. Assigns every source file to a module through
// scripts/arch-manifest.json, extracts the static import edges and reports the
// edges that the allowed-dependency map forbids, the unassigned files and the
// module cycles. Node built-ins only.
//
// Usage: node scripts/arch-audit.mjs [--json] [--fail-on-violations]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = join(ROOT, 'scripts', 'arch-manifest.json');
const SCAN_DIRS = ['server', 'src', 'api-src', 'scripts', 'tests'];
const CODE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.test-build', 'coverage']);
// Candidate extensions for extensionless relative specifiers, in lookup order.
const RESOLVE_EXT = ['.ts', '.tsx', '.mts', '.cts', '.mjs', '.js', '.jsx', '.cjs'];
// TypeScript ESM style: './x.js' written in source, './x.ts' on disk.
const TS_FOR_JS_EXT = { '.js': ['.ts', '.tsx'], '.jsx': ['.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] };
const TEST_MODULE = 'tests';
const SHARED_PREFIX = 'src/shared/';

const args = new Set(process.argv.slice(2));
const JSON_OUT = args.has('--json');
const FAIL_ON_VIOLATIONS = args.has('--fail-on-violations');
for (const arg of args) {
  if (arg !== '--json' && arg !== '--fail-on-violations') {
    console.error(`arch-audit: unknown argument ${arg}`);
    process.exit(2);
  }
}

const toPosix = (p) => p.split(sep).join('/');

// ---------------------------------------------------------------- manifest

function loadManifest() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const modules = new Set(Object.keys(manifest.allow));
  const problems = [];
  for (const rule of manifest.rules) {
    if (!modules.has(rule.module)) problems.push(`rule for unknown module ${rule.module}`);
    const patterns = Array.isArray(rule.match) ? rule.match : [rule.match];
    if (patterns.length === 0) problems.push(`rule for ${rule.module} has no patterns`);
  }
  for (const [name, list] of Object.entries(manifest.allow)) {
    for (const target of list) {
      if (target !== '*' && !modules.has(target)) problems.push(`${name} allows unknown module ${target}`);
    }
  }
  for (const name of manifest.open ?? []) {
    if (!modules.has(name)) problems.push(`open list has unknown module ${name}`);
  }
  for (const [name, list] of Object.entries(manifest.incoming ?? {})) {
    if (!modules.has(name)) problems.push(`incoming list for unknown module ${name}`);
    for (const importer of list) {
      if (!modules.has(importer)) problems.push(`incoming ${name} from unknown module ${importer}`);
    }
  }
  if (problems.length > 0) {
    console.error(`arch-audit: invalid manifest ${toPosix(relative(ROOT, MANIFEST_PATH))}`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(2);
  }
  return manifest;
}

// Exact path, directory prefix ("dir/") or glob ('*' within a segment, '**' across segments).
function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          source += '(?:.*/)?';
          i += 2;
        } else {
          source += '.*';
          i += 1;
        }
      } else {
        source += '[^/]*';
      }
    } else {
      source += c.replace(/[\\^$.|?+()[\]{}]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

function patternMatches(pattern, path) {
  if (pattern.endsWith('/')) return path.startsWith(pattern);
  if (!pattern.includes('*')) return path === pattern;
  return globToRegExp(pattern).test(path);
}

function buildAssigner(rules) {
  const compiled = rules.map((rule) => ({
    module: rule.module,
    patterns: Array.isArray(rule.match) ? rule.match : [rule.match],
  }));
  return (path) => {
    for (const rule of compiled) {
      if (rule.patterns.some((pattern) => patternMatches(pattern, path))) return rule.module;
    }
    return null;
  };
}

// ---------------------------------------------------------------- files

function collectFiles() {
  const code = [];
  let nonCode = 0;
  const walk = (dirAbs) => {
    for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const abs = join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        if (CODE_EXT.has(extname(entry.name))) code.push(toPosix(relative(ROOT, abs)));
        else nonCode += 1;
      }
    }
  };
  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    if (existsSync(abs)) walk(abs);
  }
  return { code: code.sort(), nonCode };
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// Returns a repo-relative posix path, the string 'asset' for non-code files, or null.
function resolveRelative(fromRel, specifier) {
  const bare = specifier.split('?')[0].split('#')[0];
  const base = resolve(dirname(join(ROOT, fromRel)), bare);
  const candidates = [base];
  const ext = extname(base);
  if (TS_FOR_JS_EXT[ext]) {
    for (const replacement of TS_FOR_JS_EXT[ext]) candidates.push(base.slice(0, -ext.length) + replacement);
  }
  for (const suffix of RESOLVE_EXT) candidates.push(base + suffix);
  for (const suffix of RESOLVE_EXT) candidates.push(join(base, `index${suffix}`));
  for (const candidate of candidates) {
    if (!isFile(candidate)) continue;
    const rel = toPosix(relative(ROOT, candidate));
    return CODE_EXT.has(extname(candidate)) ? rel : 'asset';
  }
  return null;
}

// ---------------------------------------------------------------- parsing

// Blanks out comments (newlines kept, so line numbers survive). With keepStrings the
// string and template literal bodies stay (module specifiers live there); without it
// they are blanked too, so that text inside strings cannot look like code.
// Single and double quoted strings end at the line break, which limits the damage
// when a regex literal confuses the scanner.
function stripComments(src, keepStrings) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (c === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) {
        out += '  ';
        i += 2;
      }
    } else if (c === '"' || c === "'") {
      out += c;
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < n) {
          out += keepStrings ? src[i] + src[i + 1] : '  ';
          i += 2;
        } else {
          out += keepStrings ? src[i] : ' ';
          i++;
        }
      }
      if (i < n && src[i] === c) {
        out += c;
        i++;
      }
    } else if (c === '`') {
      out += c;
      i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\' && i + 1 < n) {
          out += keepStrings ? src[i] + src[i + 1] : '  ';
          i += 2;
        } else {
          out += keepStrings ? src[i] : src[i] === '\n' ? '\n' : ' ';
          i++;
        }
      }
      if (i < n) {
        out += '`';
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

// The clause between `import`/`export` and `from` must look like a real import/export
// list, otherwise the lazy match ran into other statements (statements without semicolons).
const IMPORT_CLAUSE = /^(?:[\w$]+\s*(?:,\s*)?)?(?:\*\s*as\s+[\w$]+|\{[\s\S]*\})?$/;
const EXPORT_CLAUSE = /^(?:\*(?:\s*as\s+[\w$]+)?|\{[\s\S]*\})$/;
const STATIC_IMPORT = /\bimport\s+(type\s+)?([^;'"`]*?)\s*\bfrom\s*(['"])([^'"\n]+)\3/g;
const STATIC_EXPORT = /\bexport\s+(type\s+)?([^;'"`]*?)\s*\bfrom\s*(['"])([^'"\n]+)\3/g;
const SIDE_EFFECT_IMPORT = /\bimport\s*(['"])([^'"\n]+)\1/g;
const LITERAL_CALL = /(?<![\w$.])(import|require)\s*\(\s*(['"])([^'"\n]+)\2\s*\)/g;
const DYNAMIC_CALL = /(?<![\w$.])(import|require)\s*\((?!\s*['"][^'"\n]+['"]\s*\))/g;

function isTypeOnlyNamedList(clause) {
  if (!clause.startsWith('{')) return false;
  const items = clause.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean);
  return items.length > 0 && items.every((item) => item.startsWith('type '));
}

function extractSpecifiers(fromRel, src) {
  const code = stripComments(src, true);
  const codeNoStrings = stripComments(src, false);
  const lineOf = lineIndex(code);
  const found = [];
  for (const match of code.matchAll(STATIC_IMPORT)) {
    const clause = match[2].trim();
    if (clause.length === 0 || !IMPORT_CLAUSE.test(clause)) continue;
    found.push({
      line: lineOf(match.index),
      specifier: match[4],
      kind: 'import',
      typeOnly: Boolean(match[1]) || isTypeOnlyNamedList(clause.replace(/^[\w$]+\s*,\s*/, '')),
    });
  }
  for (const match of code.matchAll(STATIC_EXPORT)) {
    const clause = match[2].trim();
    if (!EXPORT_CLAUSE.test(clause)) continue;
    found.push({
      line: lineOf(match.index),
      specifier: match[4],
      kind: 'export',
      typeOnly: Boolean(match[1]) || isTypeOnlyNamedList(clause),
    });
  }
  for (const match of code.matchAll(SIDE_EFFECT_IMPORT)) {
    found.push({ line: lineOf(match.index), specifier: match[2], kind: 'import', typeOnly: false });
  }
  for (const match of code.matchAll(LITERAL_CALL)) {
    found.push({ line: lineOf(match.index), specifier: match[3], kind: match[1] === 'import' ? 'dynamic' : 'require', typeOnly: false });
  }
  const dynamic = [];
  if (!fromRel.startsWith('tests/') && !fromRel.endsWith('.test.ts') && !fromRel.endsWith('.test.tsx')) {
    for (const match of codeNoStrings.matchAll(DYNAMIC_CALL)) {
      dynamic.push({ file: fromRel, line: lineOf(match.index), text: match[1] });
    }
  }
  return { edges: found.sort((a, b) => a.line - b.line || (a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0)), dynamic };
}

// ---------------------------------------------------------------- graph

function tierOf(rel) {
  return rel.startsWith('src/') ? 'web' : 'node';
}

function tarjan(nodes, adjacency) {
  let counter = 0;
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  const visit = (v) => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of adjacency.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), index.get(w)));
      }
    }
    if (low.get(v) === index.get(v)) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      components.push(component.sort());
    }
  };
  for (const v of nodes) if (!index.has(v)) visit(v);
  return components.filter((component) => component.length > 1).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// ---------------------------------------------------------------- audit

function audit() {
  const manifest = loadManifest();
  const assign = buildAssigner(manifest.rules);
  const allowed = (from, to) => {
    const list = manifest.allow[from];
    return list.includes('*') || list.includes(to);
  };
  const open = new Set(manifest.open ?? []);
  const incoming = manifest.incoming ?? {};

  const { code: files, nonCode } = collectFiles();
  const moduleOf = new Map(files.map((file) => [file, assign(file)]));
  const unassigned = files.filter((file) => moduleOf.get(file) === null);

  const edges = [];
  const unresolved = [];
  const dynamic = [];
  let externalCount = 0;
  let assetCount = 0;
  let outsideScope = 0;

  for (const file of files) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const extracted = extractSpecifiers(file, src);
    dynamic.push(...extracted.dynamic);
    for (const edge of extracted.edges) {
      const spec = edge.specifier;
      if (!spec.startsWith('.') && !spec.startsWith('/')) {
        externalCount++;
        continue;
      }
      const target = resolveRelative(file, spec);
      if (target === null) {
        unresolved.push({ file, line: edge.line, specifier: spec });
        continue;
      }
      if (target === 'asset') {
        assetCount++;
        continue;
      }
      const toModule = moduleOf.has(target) ? moduleOf.get(target) : null;
      if (!moduleOf.has(target)) outsideScope++;
      edges.push({ file, line: edge.line, specifier: spec, kind: edge.kind, typeOnly: edge.typeOnly, target, from: moduleOf.get(file), to: toModule });
    }
  }

  // Violation of one edge, or null. Tests are never a source; unassigned ends are not judged.
  const reasonFor = (edge) => {
    if (edge.from === null || edge.to === null) return null;
    if (edge.from === TEST_MODULE) return null;
    if (tierOf(edge.file) === 'web' && tierOf(edge.target) === 'node') return 'tier';
    if (tierOf(edge.file) === 'node' && tierOf(edge.target) === 'web' && !edge.target.startsWith(SHARED_PREFIX)) return 'tier';
    if (edge.from === edge.to) return null;
    if (edge.to === TEST_MODULE) return 'not-allowed';
    if (incoming[edge.to] && !incoming[edge.to].includes(edge.from)) return 'incoming';
    if (open.has(edge.to)) return null;
    return allowed(edge.from, edge.to) ? null : 'not-allowed';
  };

  const pairs = new Map();
  for (const edge of edges) {
    if (edge.from === null || edge.to === null || edge.from === edge.to) continue;
    const key = `${edge.from} -> ${edge.to}`;
    const pair = pairs.get(key) ?? { from: edge.from, to: edge.to, imports: 0, violating: 0 };
    pair.imports++;
    edge.reason = reasonFor(edge);
    if (edge.reason) pair.violating++;
    pairs.set(key, pair);
  }
  for (const edge of edges) if (edge.reason === undefined) edge.reason = reasonFor(edge);

  const violatingEdges = edges.filter((edge) => edge.reason);
  const violationGroups = new Map();
  for (const edge of violatingEdges) {
    const key = `${edge.from} -> ${edge.to}`;
    const group = violationGroups.get(key) ?? { from: edge.from, to: edge.to, items: [] };
    group.items.push({ file: edge.file, line: edge.line, specifier: edge.specifier, typeOnly: edge.typeOnly, reason: edge.reason });
    violationGroups.set(key, group);
  }
  const violations = [...violationGroups.values()]
    .map((group) => ({
      from: group.from,
      to: group.to,
      count: group.items.length,
      typeOnly: group.items.filter((item) => item.typeOnly).length,
      items: group.items.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line)),
    }))
    .sort((a, b) => (a.from === b.from ? (a.to < b.to ? -1 : 1) : a.from < b.from ? -1 : 1));

  const modules = [...new Set(Object.keys(manifest.allow))].sort().map((name) => ({
    name,
    files: files.filter((file) => moduleOf.get(file) === name).length,
  }));

  // Cycles across modules; tests are left out, they never make production cycles.
  const adjacency = new Map();
  for (const pair of pairs.values()) {
    if (pair.from === TEST_MODULE || pair.to === TEST_MODULE) continue;
    const list = adjacency.get(pair.from) ?? [];
    list.push(pair.to);
    adjacency.set(pair.from, list);
  }
  const nodes = modules.map((m) => m.name);
  const cycles = tarjan(nodes, adjacency).map((component) => ({
    modules: component,
    edges: [...pairs.values()]
      .filter((pair) => component.includes(pair.from) && component.includes(pair.to) && pair.from !== TEST_MODULE)
      .sort((a, b) => (a.from === b.from ? (a.to < b.to ? -1 : 1) : a.from < b.from ? -1 : 1))
      .map((pair) => ({ from: pair.from, to: pair.to, imports: pair.imports })),
  }));

  const crossModuleEdges = [...pairs.values()].sort((a, b) => (a.from === b.from ? (a.to < b.to ? -1 : 1) : a.from < b.from ? -1 : 1));
  const summary = {
    filesScanned: files.length,
    filesAssigned: files.length - unassigned.length,
    filesUnassigned: unassigned.length,
    nonCodeFilesSkipped: nonCode,
    importEdges: edges.length,
    crossModuleEdgePairs: crossModuleEdges.length,
    violatingImports: violatingEdges.length,
    violatingImportsTypeOnly: violatingEdges.filter((edge) => edge.typeOnly).length,
    violatingModulePairs: violations.length,
    cycles: cycles.length,
    unresolvedRelative: unresolved.length,
    dynamicSpecifiers: dynamic.length,
    externalPackageImports: externalCount,
    assetImportsIgnored: assetCount,
    importsOutsideScope: outsideScope,
    testEdges: edges.filter((edge) => edge.from === TEST_MODULE).length,
  };

  return {
    manifest: { version: manifest.version, rules: manifest.rules.length },
    summary,
    modules,
    moduleEdges: crossModuleEdges.map((pair) => ({ from: pair.from, to: pair.to, imports: pair.imports, violating: pair.violating })),
    violations,
    unassigned,
    cycles,
    unresolved: unresolved.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line)),
    dynamic: dynamic.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line)),
  };
}

// ---------------------------------------------------------------- output

function renderText(result) {
  const lines = [];
  const s = result.summary;
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
  for (const [key, value] of Object.entries(s)) lines.push(`${key}: ${value}`);
  return lines.join('\n');
}

const result = audit();
if (JSON_OUT) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`${renderText(result)}\n`);
}
if (FAIL_ON_VIOLATIONS && result.summary.violatingImports > 0) process.exit(1);
