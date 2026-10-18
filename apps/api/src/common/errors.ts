import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response, Request } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
export const logger = pino({
  redact: ['password', 'token', 'DATABASE_URL', 'req.headers.cookie', 'req.headers.authorization'],
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
});
@Catch()
export class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const requestId = randomUUID();
    let status = 500,
      message = 'Nao foi possivel concluir a operacao.',
      code = 'INTERNAL_ERROR';
    let fieldErrors: Record<string, string[]> | undefined;
    if (error instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Verifique os campos informados.';
      fieldErrors = {};
      for (const issue of error.issues) {
        const key = issue.path.join('.') || 'form';
        (fieldErrors[key] ??= []).push(issue.message);
      }
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      message = error.message;
      code = String(status);
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        status = 409;
        message = 'Ja existe registro com essa identificacao.';
        code = 'DUPLICATE';
      } else if (['P2003', 'P2004'].includes(error.code)) {
        status = 400;
        message = 'Operacao viola uma regra de integridade.';
        code = 'INTEGRITY';
      } else if (error.code === 'P2025') {
        status = 404;
        message = 'Registro nao encontrado.';
        code = 'NOT_FOUND';
      } else if (error.code === 'P2034') {
        status = 409;
        message = 'Operacao concorrente. Tente novamente.';
        code = 'CONCURRENT_OPERATION';
      }
    }
    logger[status >= 500 ? 'error' : 'warn'](
      { requestId, status, code, method: req.method, path: req.path },
      'request_failed',
    );
    res.status(status).json({ code, message, fieldErrors, requestId });
  }
}
