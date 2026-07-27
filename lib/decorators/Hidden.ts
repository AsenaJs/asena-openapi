import { OpenApiConstants } from '../constants/OpenApiConstants';
import { defineTypedMetadata, getOwnTypedMetadata } from '@asenajs/asena/utils';

/**
 * Marks a controller or individual route method as hidden from OpenAPI documentation.
 *
 * - **Class-level**: Hides all routes of the controller from the spec.
 * - **Method-level**: Hides only the decorated route from the spec.
 *
 * Follows the same metadata accumulation pattern as Asena's @Override decorator.
 *
 * @example
 * ```typescript
 * // Hide entire controller
 * @Hidden()
 * @Controller('/internal')
 * class InternalController { ... }
 *
 * // Hide single route
 * @Controller('/api')
 * class ApiController {
 *   @Hidden()
 *   @Get('/health')
 *   healthCheck() { ... }
 * }
 * ```
 */
export function Hidden(): ClassDecorator & MethodDecorator {
  return function (target: any, propertyKey?: string | symbol) {
    if (propertyKey === undefined) {
      // Class-level: mark entire controller as hidden
      defineTypedMetadata<boolean>(OpenApiConstants.HiddenClassKey, true, target);
    } else {
      // Method-level: accumulate hidden method names on the declaring class (like @Override).
      // A separate key from the class-level flag - see OpenApiConstants for why.
      const hiddenMethods: string[] =
        getOwnTypedMetadata<string[]>(OpenApiConstants.HiddenMethodsKey, target.constructor) || [];

      const key = String(propertyKey);

      if (!hiddenMethods.includes(key)) {
        hiddenMethods.push(key);
      }

      defineTypedMetadata<string[]>(OpenApiConstants.HiddenMethodsKey, hiddenMethods, target.constructor);
    }
  };
}
