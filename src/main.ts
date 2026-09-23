import { Logger as NestLogger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

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
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
      swaggerOptions: { persistAuthorization: true },
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
