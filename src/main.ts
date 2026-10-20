
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Inbox Helper API')
    .setDescription(
      'AI-powered candidate inbox assistant. All generated drafts require human review.',
    )
    .setVersion('1.0.0')
    .addTag('inbox', 'Candidate messages and draft review')
    .addTag('health', 'Service health checks')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'request-Key',
        in: 'header',
        description: 'Unique key for batch submission',
      },
      'request-Key',
    )
    .build();

  if (process.env.NODE_ENV == "development") {
    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('swagger', app, document, {
      jsonDocumentUrl: 'swagger',
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  await app.listen(process.env.PORT || 3000);
}

bootstrap();
