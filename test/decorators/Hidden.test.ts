import { describe, expect, test } from 'bun:test';
import { Hidden } from '../../lib/decorators';
import { OpenApiConstants } from '../../lib/constants/OpenApiConstants';
import { getChainedTypedMetadataList, getOwnTypedMetadata } from '@asenajs/asena/utils';

describe('@Hidden Decorator', () => {
  describe('Class-level', () => {
    test('should store boolean true on class', () => {
      @Hidden()
      class HiddenController {}

      const meta = getOwnTypedMetadata<boolean>(OpenApiConstants.HiddenClassKey, HiddenController);

      expect(meta).toBe(true);
    });

    test('should not set metadata on non-decorated class', () => {
      class NormalController {}

      const meta = getOwnTypedMetadata<boolean>(OpenApiConstants.HiddenClassKey, NormalController);

      expect(meta).toBeUndefined();
    });
  });

  describe('Method-level', () => {
    test('should store method name in string array', () => {
      class TestController {
        @Hidden()
        healthCheck() {}
      }

      const meta = getOwnTypedMetadata<string[]>(OpenApiConstants.HiddenMethodsKey, TestController);

      expect(meta).toEqual(['healthCheck']);
    });

    test('should accumulate multiple hidden methods', () => {
      class TestController {
        @Hidden()
        healthCheck() {}

        @Hidden()
        internalMetrics() {}
      }

      const meta = getOwnTypedMetadata<string[]>(OpenApiConstants.HiddenMethodsKey, TestController);

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

      const meta = getOwnTypedMetadata<string[]>(OpenApiConstants.HiddenMethodsKey, TestController);

      expect(meta).toEqual(['healthCheck']);
    });
  });

  // Method-level @Hidden writes to the class that DECLARES the method, so a base class's
  // hidden route has to be found through the prototype chain. Since inherited routes now reach
  // the spec, missing this publishes an endpoint its author marked internal.
  describe('Inheritance', () => {
    test('a base class method marked @Hidden is reported for the subclass', () => {
      abstract class AdminBase {
        @Hidden()
        public internalMetrics() {}
      }

      class PublicController extends AdminBase {}

      expect(getOwnTypedMetadata(OpenApiConstants.HiddenMethodsKey, PublicController)).toBeUndefined();
      expect(getChainedTypedMetadataList<string>(OpenApiConstants.HiddenMethodsKey, PublicController)).toEqual([
        'internalMetrics',
      ]);
    });

    test('the subclass keeps its own hidden methods alongside inherited ones', () => {
      abstract class AdminBase {
        @Hidden()
        public internalMetrics() {}
      }

      class PublicController extends AdminBase {
        @Hidden()
        public debugDump() {}
      }

      expect(getChainedTypedMetadataList<string>(OpenApiConstants.HiddenMethodsKey, PublicController).sort()).toEqual([
        'debugDump',
        'internalMetrics',
      ]);
    });

    test('class-level @Hidden on a base does NOT hide the subclass', () => {
      @Hidden()
      abstract class HiddenBase {}

      class VisibleController extends HiddenBase {}

      // Own-only on purpose: class-level metadata describes the class it decorates. A subclass
      // that re-exposes a hidden base under its own @Controller is a legitimate thing to write.
      expect(getOwnTypedMetadata(OpenApiConstants.HiddenClassKey, VisibleController)).toBeUndefined();
      expect(getOwnTypedMetadata<boolean>(OpenApiConstants.HiddenClassKey, HiddenBase)).toBe(true);
    });
  });

  describe('Mixed usage', () => {
    test('class-level and method-level are stored under separate keys', () => {
      @Hidden()
      class HiddenController {}

      class PartialController {
        @Hidden()
        secret() {}
      }

      const classMeta = getOwnTypedMetadata(OpenApiConstants.HiddenClassKey, HiddenController);
      const methodMeta = getOwnTypedMetadata(OpenApiConstants.HiddenMethodsKey, PartialController);

      expect(classMeta).toBe(true);
      expect(Array.isArray(methodMeta)).toBe(true);
    });
  });
});
