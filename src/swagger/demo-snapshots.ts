import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface DemoSnapshot {
  request: {
    path: string;
    parameters?: Record<string, string>;
    body?: Record<string, unknown>;
  };
  source: string;
  kind: 'captured-response' | 'persisted-evidence';
  recordedAt?: string | null;
  statusCode?: number;
  body: unknown;
}

export interface DemoSnapshots {
  capturedAt: string;
  operations: Record<string, DemoSnapshot>;
}

export function loadDemoSnapshots(): DemoSnapshots | undefined {
  const path = resolve(process.cwd(), 'docs/demo-snapshots.local.json');
  if (!existsSync(path)) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as DemoSnapshots;
    if (!value.capturedAt || !value.operations || typeof value.operations !== 'object') {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}
