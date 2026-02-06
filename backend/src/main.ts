import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { ConflictExceptionFilter } from './common/filters/conflict-exception.filter.js';
import { runMigrations } from './database/migrate.js';

async function bootstrap() {
  // Run migrations before starting the app
  try {
    await runMigrations();
  } catch (error) {
    console.error('Failed to run migrations:', error);
    process.exit(1);
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.enableCors();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ConflictExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Clinic Scheduling API')
    .setDescription('Multi-tenant clinic appointment scheduling system')
    .setVersion('1.0')
    .addApiKey(
      { type: 'apiKey', name: 'X-Tenant-Id', in: 'header' },
      'X-Tenant-Id',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
