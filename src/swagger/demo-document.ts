import { OpenAPIObject, PathsObject } from '@nestjs/swagger';

export const DEMO_OPERATIONS = [
  ['get', '/api/health', '01. Health check'],
  ['get', '/api/settings/trading-profile', '02. Trading profile'],
  ['get', '/api/market-data/provider', '03. Market-data source'],
  ['post', '/api/scanner/run', '04. Run screening'],
  ['get', '/api/scanner/runs/{id}', '05. Inspect scan run'],
  ['get', '/api/scanner/runs/{id}/results', '06. Shortlisted results and indicators'],
  ['post', '/api/candidates/from-scan-result/{scanResultId}', '07. Create candidate'],
  ['get', '/api/candidates/{id}', '08. Candidate evidence and risk plan'],
  ['post', '/api/candidates/{id}/news/enrich', '09. News enrichment'],
  ['post', '/api/candidates/{id}/ai/triage', '10. FAST AI evaluation'],
  ['post', '/api/candidates/{id}/finalize', '11. Final qualification'],
  ['post', '/api/candidates/{id}/buy', '12. Record BUY'],
  ['post', '/api/candidates/{id}/skip', '13. Record SKIP (alternative)'],
  ['get', '/api/candidates/{id}/events', '14. Candidate journal'],
  ['get', '/api/trades/{id}', '15. Tracked trade'],
  ['get', '/api/trades/{id}/events', '16. Trade journal'],
] as const;

/** Curates documentation only; the registered application routes stay unchanged. */
export function createDemoDocument(document: OpenAPIObject, mockResponses = false): OpenAPIObject {
  const paths: PathsObject = {};

  for (const [method, path, tag] of DEMO_OPERATIONS) {
    const source = document.paths[path];
    const operation = source?.[method];
    if (!operation) {
      throw new Error(`Demo Swagger operation is missing: ${method.toUpperCase()} ${path}`);
    }

    paths[path] = {
      ...(source.parameters ? { parameters: source.parameters } : {}),
      ...(source.servers ? { servers: source.servers } : {}),
      ...paths[path],
      [method]: {
        ...operation,
        tags: [tag],
        ...(mockResponses
          ? {
              description:
                `${operation.description || ''}\n\n` +
                '**MOCK RESPONSE MODE:** Execute returns a fixed synthetic fixture. ' +
                'No screening, provider call, decision, or journal write is performed. ' +
                'Inputs are ignored and records do not change.',
            }
          : {}),
      },
    };
  }

  return {
    ...document,
    info: {
      ...document.info,
      title: mockResponses
        ? 'AI-Assisted Trading Demo — MOCK RESPONSES'
        : 'AI-Assisted Trading Demo',
      description: mockResponses
        ? 'MOCK RESPONSE MODE: All 16 demo operations return fixed synthetic data on Execute. ' +
          'This is an API interaction demonstration, not evidence of real workflow processing. ' +
          'Health is simulated; no database readiness is checked. ' +
          'Inputs are ignored; BUY/SKIP and journals do not persist changes. ' +
          'Non-demo routes retain normal behavior. Full reference: /api/docs-all.'
        : '',
    },
    paths,
    tags: DEMO_OPERATIONS.map(([, , name]) => ({ name })),
  };
}
