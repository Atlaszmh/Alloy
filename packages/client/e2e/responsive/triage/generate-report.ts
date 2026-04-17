import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readReport, reportPath } from '../probes/report';
import type { Finding } from '../probes/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRIAGE_PATH = path.resolve(
  __dirname,
  '..', '..', '..',
  'test-results',
  'responsive-triage.md',
);

function groupBy<K extends string | number>(
  rows: Finding[],
  key: (f: Finding) => K,
): Map<K, Finding[]> {
  const map = new Map<K, Finding[]>();
  for (const f of rows) {
    const k = key(f);
    const arr = map.get(k) ?? [];
    arr.push(f);
    map.set(k, arr);
  }
  return map;
}

function buildMatrix(findings: Finding[]): string {
  const screens = Array.from(new Set(findings.map((f) => f.screen))).sort();
  const viewports = Array.from(new Set(findings.map((f) => f.viewport))).sort();
  if (screens.length === 0 || viewports.length === 0) {
    return '_(no findings recorded)_';
  }
  const counts = new Map<string, number>();
  for (const f of findings) {
    if (f.severity !== 'fail') continue;
    const k = `${f.screen}|${f.viewport}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const header = `| Screen \\ Viewport | ${viewports.join(' | ')} |`;
  const sep = `| --- | ${viewports.map(() => '---').join(' | ')} |`;
  const rows = screens.map((s) => {
    const cells = viewports.map((v) => {
      const c = counts.get(`${s}|${v}`) ?? 0;
      return c === 0 ? '·' : String(c);
    });
    return `| **${s}** | ${cells.join(' | ')} |`;
  });
  return [header, sep, ...rows].join('\n');
}

function buildTopFindings(findings: Finding[]): string {
  const fails = findings.filter((f) => f.severity === 'fail');
  if (fails.length === 0) return '_(no fail-severity findings)_';
  const byProbe = groupBy(fails, (f) => f.probe);
  const sortedProbes = Array.from(byProbe.entries()).sort((a, b) => b[1].length - a[1].length);
  const sections = sortedProbes.map(([probe, items]) => {
    const lines = items
      .slice(0, 10)
      .map((f) => `- **${f.screen}** @ ${f.viewport}: ${f.detail}`);
    const more = items.length > 10 ? `\n  - _(${items.length - 10} more)_` : '';
    return `### ${probe} (${items.length})\n${lines.join('\n')}${more}`;
  });
  return sections.join('\n\n');
}

export function generateTriage(): string {
  // Surface a clear error when the report file is missing — readReport() swallows
  // file-not-found and returns [], which would otherwise produce a misleading
  // "0 findings" green report when nobody has run the matrix yet.
  const reportFile = reportPath();
  if (!fs.existsSync(reportFile)) {
    throw new Error(
      `responsive-report.json not found at ${reportFile}. Run "pnpm test:responsive" first.`,
    );
  }
  const findings = readReport();
  const fails = findings.filter((f) => f.severity === 'fail').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  const md = [
    `# Responsive Triage Report`,
    ``,
    `**Total findings:** ${findings.length} (${fails} fail, ${warns} warn)`,
    ``,
    `## Severity Matrix (fail counts)`,
    ``,
    buildMatrix(findings),
    ``,
    `## Top Findings by Probe`,
    ``,
    buildTopFindings(findings),
    ``,
  ].join('\n');
  fs.mkdirSync(path.dirname(TRIAGE_PATH), { recursive: true });
  fs.writeFileSync(TRIAGE_PATH, md, 'utf8');
  return TRIAGE_PATH;
}

// Portable CLI detection: pathToFileURL handles Windows backslashes correctly,
// unlike a manual `file://` + argv[1] concat.
const entry = process.argv[1];
const isCli = entry ? import.meta.url === pathToFileURL(entry).href : false;
if (isCli) {
  const outPath = generateTriage();
  console.log(`Triage report written to: ${outPath}`);
}
