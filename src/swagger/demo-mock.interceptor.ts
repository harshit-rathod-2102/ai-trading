import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { DEMO_OPERATIONS } from './demo-document';
import { DEMO_MOCK_RESPONSES } from './demo-mock.fixtures';

const routes = DEMO_OPERATIONS.map(([method, path]) => ({
  method: method.toUpperCase(),
  key: `${method.toUpperCase()} ${path}`,
  path: new RegExp(`^${path.replace(/\{[^}]+\}/g, '[^/]+')}/?$`),
}));

/** Enabled explicitly at bootstrap; short-circuits only the 16 curated routes. */
export class DemoMockInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ method: string; originalUrl: string }>();
    const path = request.originalUrl.split('?')[0];
    const route = routes.find(
      (item) => item.method === request.method.toUpperCase() && item.path.test(path),
    );
    if (!route) return next.handle();

    const response = http.getResponse<{
      status: (status: number) => unknown;
      setHeader: (name: string, value: string) => unknown;
    }>();
    response.status(200);
    response.setHeader('X-Demo-Mock', 'true');
    response.setHeader('X-Demo-Notice', 'Fixed synthetic response; no operation performed');
    response.setHeader('Cache-Control', 'no-store');
    return of(structuredClone(DEMO_MOCK_RESPONSES[route.key]));
  }
}
