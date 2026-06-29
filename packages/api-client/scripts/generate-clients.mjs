#!/usr/bin/env node
// Generates typed clients from running FastAPI OpenAPI specs.
// Run only after services are up: pnpm --filter @midcine/api-client generate

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'src', 'generated');

const SERVICES = [
  { name: 'ingestion', url: process.env.INGESTION_OPENAPI ?? 'http://localhost:8100/openapi.json' },
  { name: 'fhir', url: process.env.FHIR_OPENAPI ?? 'http://localhost:8400/openapi.json' },
  { name: 'llm', url: process.env.LLM_OPENAPI ?? 'http://localhost:8300/openapi.json' },
  {
    name: 'ai-dispatcher',
    url: process.env.DISPATCHER_OPENAPI ?? 'http://localhost:8200/openapi.json',
  },
  {
    name: 'cloud-index',
    url: process.env.CLOUD_INDEX_OPENAPI ?? 'http://localhost:8260/openapi.json',
  },
  { name: 'consent', url: process.env.CONSENT_OPENAPI ?? 'http://localhost:8270/openapi.json' },
];

await mkdir(OUT_DIR, { recursive: true });

for (const svc of SERVICES) {
  try {
    console.log(`[gen] ${svc.name} ← ${svc.url}`);
    const ast = await openapiTS(new URL(svc.url));
    await writeFile(resolve(OUT_DIR, `${svc.name}.d.ts`), astToString(ast));
  } catch (err) {
    console.warn(`[gen] failed for ${svc.name}: ${err.message}`);
  }
}

console.log('[gen] done');
