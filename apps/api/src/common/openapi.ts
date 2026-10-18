import { ApiBody } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
/** Documentation is derived from the same schema that validates the request. */
export const ApiInput = (schema: z.ZodType) =>
  ApiBody({
    schema: z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject,
  });
