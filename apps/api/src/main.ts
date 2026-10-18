import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, static as staticFiles } from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AccessGuard } from './common/security';
import { Errors, logger } from './common/errors';
import { config } from './common/config';
export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
  app.setGlobalPrefix('api/v1');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    }),
  );
  app.use(json({ limit: '256kb' }));
  app.use(cookieParser());
  app.enableCors({
    origin: config.APP_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'],
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.header('origin') !== config.APP_ORIGIN
    )
      return res.status(403).json({ code: 'ORIGIN', message: 'Origem nao autorizada.' });
    return next();
  });
  app.useGlobalFilters(new Errors());
  const guard = app.get(AccessGuard);
  app.use(
    ['/api/v1/docs', '/api/v1/docs-json', '/api/v1/docs-yaml'],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = await guard.authenticate(req);
        if (!user.permissions.includes('users.manage') || (user.mfaRequired && !user.mfaEnabled))
          return res.sendStatus(403);
        next();
      } catch {
        return res.sendStatus(401);
      }
    },
  );
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('CHAME TOTAL')
      .setVersion('1')
      .addCookieAuth('ct_session')
      .build(),
  );
  SwaggerModule.setup('api/v1/docs', app, document);
  const webPath = resolve(process.cwd(), '../web/dist');
  if (existsSync(resolve(webPath, 'index.html'))) {
    app.use(staticFiles(webPath));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/'))
        return res.sendFile(resolve(webPath, 'index.html'));
      return next();
    });
  }
  app.enableShutdownHooks();
  await app.init();
  return app;
}
if (require.main === module)
  createApp()
    .then(async (app) => {
      await app.listen(config.PORT, config.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
      logger.info({ port: config.PORT }, 'api_ready');
    })
    .catch(() => {
      logger.error('api_start_failed');
      process.exitCode = 1;
    });
