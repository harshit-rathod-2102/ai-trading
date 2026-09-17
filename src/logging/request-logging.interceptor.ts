import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { IncomingMessage } from 'node:http';
import { Observable, catchError, throwError } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { structuredError } from './logging.utils';

type RequestWithId = IncomingMessage & { id?: string; originalUrl: string };

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(RequestLoggingInterceptor.name)
    private readonly logger: PinoLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<RequestWithId>();
    return next.handle().pipe(
      catchError((error: unknown) => {
        const statusCode = error instanceof HttpException ? error.getStatus() : 500;
        if (!(error instanceof HttpException)) {
          this.logger.error({
            event: 'http.exception.unexpected',
            module: 'http',
            operation: `${request.method ?? 'UNKNOWN'} ${request.originalUrl.split('?')[0]}`,
            statusCode,
            ...structuredError(error),
          }, 'Unexpected HTTP exception');
        }
        return throwError(() => error);
      }),
    );
  }
}
