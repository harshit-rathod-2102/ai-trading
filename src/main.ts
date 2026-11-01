import { Logger as NestLogger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { createDemoDocument } from './swagger/demo-document';
import { DemoMockInterceptor } from './swagger/demo-mock.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  const configService = app.get(ConfigService);
  app.useLogger(app.get(Logger));

  const mockResponses = configService.get<string>('DEMO_MOCK_RESPONSES') === 'true';
  if (mockResponses) {
    if (configService.getOrThrow<string>('app.nodeEnv') === 'production') {
      throw new Error('DEMO_MOCK_RESPONSES is only supported outside production.');
    }
    app.useGlobalInterceptors(new DemoMockInterceptor());
    new NestLogger('Bootstrap').warn(
      'MOCK RESPONSE MODE: demo endpoints return synthetic fixtures; operations are not performed.',
    );
  }

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
      .setTitle(
        mockResponses ? 'Swing Trading System API — MOCK RESPONSES' : 'Swing Trading System API',
      )
      .setDescription(
        mockResponses
          ? 'MOCK RESPONSE MODE: the 16 curated demo routes return synthetic fixed responses. ' +
              'Other routes retain normal behavior.'
          : 'Backend API for the personal AI-assisted swing trading system.',
      )
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs-all', app, document, {
      jsonDocumentUrl: 'api/docs-all-json',
      customSiteTitle: 'Swing Trading System — Full API',
      swaggerOptions: { persistAuthorization: true },
    });
    SwaggerModule.setup('api/docs', app, createDemoDocument(document, mockResponses), {
      jsonDocumentUrl: 'api/docs-json',
      customSiteTitle: mockResponses
        ? 'AI-Assisted Trading Demo — MOCK RESPONSES'
        : 'AI-Assisted Trading Demo',
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        docExpansion: 'list',
        defaultModelsExpandDepth: -1,
        deepLinking: true,
        filter: true,
        supportedSubmitMethods: ['get', 'post'],
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
