import { z } from 'zod';
import type { JsonSchema, SchemaConverter } from '../types';

/**
 * Converts Zod schemas to JSON Schema using Zod v4's built-in `z.toJSONSchema()`.
 *
 * OpenAPI 3.1 uses JSON Schema draft-2020-12, which is exactly what
 * `z.toJSONSchema()` outputs by default — fully compatible.
 *
 * @example
 * ```typescript
 * const converter = new ZodSchemaConverter();
 * const jsonSchema = converter.convert(z.object({ name: z.string() }));
 * // { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
 * ```
 */
export class ZodSchemaConverter implements SchemaConverter {
  public canConvert(schema: unknown): boolean {
    return schema instanceof z.ZodType;
  }

  public convert(schema: unknown): JsonSchema | undefined {
    if (!this.canConvert(schema)) return undefined;

    return z.toJSONSchema(schema as z.ZodType, {
      unrepresentable: 'any',
      override: (ctx) => {
        // Convert z.date() to { type: 'string', format: 'date-time' }
        if (ctx.zodSchema instanceof z.ZodDate) {
          ctx.jsonSchema.type = 'string';
          (ctx.jsonSchema as any).format = 'date-time';
        }
      },
    }) as JsonSchema;
  }
}
