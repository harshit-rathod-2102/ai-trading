import { OpenAPIObject, OperationObject, PathsObject } from '@nestjs/swagger';
import { DemoSnapshot, DemoSnapshots } from './demo-snapshots';

const DEMO_OPERATIONS = [
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
export function createDemoDocument(
  document: OpenAPIObject,
  snapshots?: DemoSnapshots,
): OpenAPIObject {
  const paths: PathsObject = {};

  for (const [method, path, tag] of DEMO_OPERATIONS) {
    const source = document.paths[path];
    const operation = source?.[method];
    if (!operation) {
      throw new Error(`Demo Swagger operation is missing: ${method.toUpperCase()} ${path}`);
    }

    const example = snapshots?.operations[`${method.toUpperCase()} ${path}`];
    const live = path === '/api/health' || path === '/api/settings/trading-profile';
    paths[path] = {
      ...(source.parameters ? { parameters: source.parameters } : {}),
      ...(source.servers ? { servers: source.servers } : {}),
      ...paths[path],
      [method]: {
        ...operation,
        tags: [tag],
        ...(live
          ? {
              description: `${operation.description || ''}\n\nExecute this GET live during the demo.`,
            }
          : savedExample(operation, example)),
      },
    };
  }

  return {
    ...document,
    info: {
      ...document.info,
      title: 'AI-Assisted Trading Demo',
      description:
        'Execute only sections 01 (health) and 02 (trading profile). For all other sections, ' +
        'open the operation and show its request preview and saved response/evidence below. ' +
        (snapshots
          ? `Read-only capture: ${snapshots.capturedAt}. Record timestamps remain visible; ` +
            'these are saved examples, not live executions. '
          : 'No local capture loaded. Run npm run demo:capture before recording. ') +
        'POST examples show persisted stage evidence, not newly executed HTTP responses. ' +
        'BUY records a manual entry; it does not place an order. Full reference: /api/docs-all.',
    },
    paths,
    tags: DEMO_OPERATIONS.map(([, , name]) => ({ name })),
  };
}

function savedExample(
  operation: OperationObject,
  example: DemoSnapshot | undefined,
): Partial<OperationObject> {
  if (!example) {
    return {
      description:
        `${operation.description || ''}\n\n` +
        '**Preview only. No saved evidence available for this operation.** ' +
        'Run `npm run demo:capture` before recording. No request is executed by opening this API.',
    };
  }
  const request = {
    path: example.request.path,
    ...(example.request.parameters ? { parameters: example.request.parameters } : {}),
    ...(example.request.body ? { body: example.request.body } : {}),
  };
  return {
    description:
      `${operation.description || ''}\n\n` +
      `**Request preview**\n\n\`\`\`json\n${JSON.stringify(request, null, 2)}\n\`\`\``,
    parameters: operation.parameters?.map((parameter) =>
      '$ref' in parameter
        ? parameter
        : {
            ...parameter,
            ...(example.request.parameters?.[parameter.name] !== undefined
              ? { example: example.request.parameters[parameter.name] }
              : {}),
          },
    ),
    ...(operation.requestBody && !('$ref' in operation.requestBody) && example.request.body
      ? {
          requestBody: {
            ...operation.requestBody,
            content: {
              ...operation.requestBody.content,
              'application/json': {
                ...operation.requestBody.content['application/json'],
                example: example.request.body,
              },
            },
          },
        }
      : {}),
    responses: {
      [example.statusCode ?? 'default']: {
        description: 'Saved example',
        content: {
          'application/json': {
            example: example.body,
          },
        },
      },
    },
  };
}
