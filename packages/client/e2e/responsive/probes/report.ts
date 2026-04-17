import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Finding } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORT_PATH = path.resolve(
  __dirname,
  '..', '..', '..', // packages/client/
  'test-results',
  'responsive-report.json',
);

export function reportPath(): string {
  return REPORT_PATH;
}

export function truncateReport(): void {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, '[]', 'utf8');
}

export function appendFinding(finding: Finding): void {
  let existing: Finding[] = [];
  try {
    const raw = fs.readFileSync(REPORT_PATH, 'utf8');
    existing = JSON.parse(raw) as Finding[];
  } catch {
    existing = [];
  }
  existing.push(finding);
  fs.writeFileSync(REPORT_PATH, JSON.stringify(existing, null, 2), 'utf8');
}

export function readReport(): Finding[] {
  try {
    return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8')) as Finding[];
  } catch {
    return [];
  }
}
