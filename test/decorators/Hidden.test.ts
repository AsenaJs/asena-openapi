import { describe, expect, test } from 'bun:test';
import { Hidden } from '../../lib/decorators';
import { OpenApiConstants } from '../../lib/constants/OpenApiConstants';
import { getOwnTypedMetadata } from '@asenajs/asena/utils';

describe('@Hidden Decorator', () => {
  describe('Class-level', () => {
    test('should store boolean true on class', () => {
      @Hidden()
      class HiddenController {}

      const meta = getOwnTypedMetadata<boolean>(OpenApiConstants.HiddenKey, HiddenController);

      expect(meta).toBe(true);
    });

    test('should not set metadata on non-decorated class', () => {
      class NormalController {}

      const meta = getOwnTypedMetadata<boolean>(OpenApiConstants.HiddenKey, NormalController);

      expect(meta).toBeUndefined();
    });
  });

  describe('Method-level', () => {
    test('should store method name in string array', () => {
      class TestController {
        @Hidden()
        healthCheck() {}
      }

      const meta = getOwnTypedMetadata<string[]>(OpenApiConstants.HiddenKey, TestController);

      expect(meta).toEqual(['healthCheck']);
    });

    test('should accumulate multiple hidden methods', () => {
      class TestController {
        @Hidden()
        healthCheck() {}

        @Hidden()
        internalMetrics() {}
      }

      const meta = getOwnTypedMetadata<string[]>(OpenApiConstants.HiddenKey, TestController);

      expect(meta).toHaveLength(2);
      expect(meta).toContain('healthCheck');
      expect(meta).toContain('internalMetrics');
    });

    test('should not duplicate method names', () => {
      class TestController {
        @Hidden()
        healthCheck() {}
      }

      // Manually apply @Hidden again to same method
      const decorator = Hidden();

      decorator(
        TestController.prototype,
        'healthCheck',
        Object.getOwnPropertyDescriptor(TestController.prototype, 'healthCheck')!,
      );

      const meta = getOwnTypedMetadata<string[]>(OpenApiConstants.HiddenKey, TestController);

      expect(meta).toEqual(['healthCheck']);
    });
  });

  describe('Mixed usage', () => {
    test('class-level and method-level produce different metadata types', () => {
      @Hidden()
      class HiddenController {}

      class PartialController {
        @Hidden()
        secret() {}
      }

      const classMeta = getOwnTypedMetadata(OpenApiConstants.HiddenKey, HiddenController);
      const methodMeta = getOwnTypedMetadata(OpenApiConstants.HiddenKey, PartialController);

      expect(classMeta).toBe(true);
      expect(Array.isArray(methodMeta)).toBe(true);
    });
  });
});
