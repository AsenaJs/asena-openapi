import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { ZodSchemaConverter } from '../../lib/converter/ZodSchemaConverter';

describe('ZodSchemaConverter', () => {
  const converter = new ZodSchemaConverter();

  describe('canConvert', () => {
    test('should return true for Zod schemas', () => {
      expect(converter.canConvert(z.string())).toBe(true);
      expect(converter.canConvert(z.object({}))).toBe(true);
    });

    test('should return false for non-Zod values', () => {
      expect(converter.canConvert({})).toBe(false);
      expect(converter.canConvert(null)).toBe(false);
      expect(converter.canConvert('string')).toBe(false);
      expect(converter.canConvert(42)).toBe(false);
    });
  });

  describe('Primitive types', () => {
    test('should convert z.string()', () => {
      const result = converter.convert(z.string());

      expect(result).toBeDefined();
      expect(result!.type).toBe('string');
    });

    test('should convert z.number()', () => {
      const result = converter.convert(z.number());

      expect(result).toBeDefined();
      expect(result!.type).toBe('number');
    });

    test('should convert z.boolean()', () => {
      const result = converter.convert(z.boolean());

      expect(result).toBeDefined();
      expect(result!.type).toBe('boolean');
    });

    test('should convert z.number().int() to integer', () => {
      const result = converter.convert(z.number().int());

      expect(result).toBeDefined();
      expect(result!.type).toBe('integer');
    });
  });

  describe('String checks', () => {
    test('should convert email format', () => {
      const result = converter.convert(z.string().email());

      expect(result!.format).toBe('email');
    });

    test('should convert url format', () => {
      const result = converter.convert(z.string().url());

      expect(result!.format).toBe('uri');
    });

    test('should convert uuid format', () => {
      const result = converter.convert(z.string().uuid());

      expect(result!.format).toBe('uuid');
    });

    test('should convert min/max length', () => {
      const result = converter.convert(z.string().min(3).max(50));

      expect(result!.minLength).toBe(3);
      expect(result!.maxLength).toBe(50);
    });
  });

  describe('Number checks', () => {
    test('should convert min/max', () => {
      const result = converter.convert(z.number().min(1).max(100));

      expect(result!.minimum).toBe(1);
      expect(result!.maximum).toBe(100);
    });
  });

  describe('Object type', () => {
    test('should convert z.object() with properties and required', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
        bio: z.string().optional(),
      });

      const result = converter.convert(schema);

      expect(result!.type).toBe('object');
      expect(result!.properties).toBeDefined();
      expect(result!.properties!['name']).toBeDefined();
      expect(result!.properties!['age']).toBeDefined();
      expect(result!.properties!['bio']).toBeDefined();
      expect(result!.required).toContain('name');
      expect(result!.required).toContain('age');
      expect(result!.required).not.toContain('bio');
    });
  });

  describe('Array type', () => {
    test('should convert z.array()', () => {
      const result = converter.convert(z.array(z.string()));

      expect(result!.type).toBe('array');
      expect(result!.items).toBeDefined();
      expect((result!.items as any).type).toBe('string');
    });
  });

  describe('Enum type', () => {
    test('should convert z.enum()', () => {
      const result = converter.convert(z.enum(['admin', 'user', 'guest']));

      expect(result!.enum).toEqual(['admin', 'user', 'guest']);
    });
  });

  describe('Complex types', () => {
    test('should convert z.optional() (unwrap)', () => {
      const result = converter.convert(z.string().optional());

      expect(result).toBeDefined();
    });

    test('should convert nested objects', () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          address: z.object({
            city: z.string(),
          }),
        }),
      });

      const result = converter.convert(schema);

      expect(result!.properties!['user']).toBeDefined();
      expect((result!.properties!['user'] as any).properties!.name).toBeDefined();
      expect((result!.properties!['user'] as any).properties!.address).toBeDefined();
    });

    test('should handle z.date() as string with date-time format', () => {
      const result = converter.convert(z.date());

      expect(result).toBeDefined();
      expect(result!.type).toBe('string');
      expect(result!.format).toBe('date-time');
    });
  });

  describe('Edge cases', () => {
    test('should return undefined for non-Zod input', () => {
      expect(converter.convert({ type: 'string' })).toBeUndefined();
    });

    test('should return undefined for null', () => {
      expect(converter.convert(null)).toBeUndefined();
    });
  });
});
