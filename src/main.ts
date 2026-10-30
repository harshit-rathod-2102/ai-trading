import { Logger as NestLogger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { createDemoDocument } from './swagger/demo-document';
import { loadDemoSnapshots } from './swagger/demo-snapshots';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  const configService = app.get(ConfigService);
  app.useLogger(app.get(Logger));

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (configService.getOrThrow<boolean>('swagger.enabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Swing Trading System API')
      .setDescription('Backend API for the personal AI-assisted swing trading system.')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs-all', app, document, {
      jsonDocumentUrl: 'api/docs-all-json',
      customSiteTitle: 'Swing Trading System — Full API',
      swaggerOptions: { persistAuthorization: true },
    });
    SwaggerModule.setup('api/docs', app, createDemoDocument(document), {
      patchDocumentOnRequest: () => createDemoDocument(document, loadDemoSnapshots()),
      jsonDocumentUrl: 'api/docs-json',
      customSiteTitle: 'AI-Assisted Trading Demo',
      customCss:
        '.opblock .try-out { display: none; } ' +
        '[id$="-HealthController_check"] .try-out, ' +
        '[id$="-TradingProfileController_getActiveProfile"] .try-out { display: block; }',
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        docExpansion: 'list',
        defaultModelsExpandDepth: -1,
        deepLinking: true,
        filter: true,
        supportedSubmitMethods: ['get'],
        requestInterceptor: (request: { url: string; method: string }) => {
          const path = new URL(request.url, 'http://localhost').pathname;
          if (
            request.method.toUpperCase() !== 'GET' ||
            !['/api/health', '/api/settings/trading-profile'].includes(path)
          ) {
            throw new Error('Demo preview: execute only health and trading profile.');
          }
          return request;
        },
      },
    });
  }

  const port = configService.getOrThrow<number>('app.port');
  await app.listen(port);
  const logger = new NestLogger('Bootstrap');
  logger.log(
    {
      event: 'app.started',
      module: 'bootstrap',
      operation: 'start',
      environment: configService.getOrThrow<string>('app.nodeEnv'),
      port,
      nodeVersion: process.version,
    },
    'Application started',
  );
}

void bootstrap();
