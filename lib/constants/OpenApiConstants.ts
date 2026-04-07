/**
 * Metadata constants for OpenAPI decorators.
 * Uses Symbols to prevent naming collisions.
 */
export class OpenApiConstants {
  /**
   * @Hidden() decorator metadata key.
   * - Class-level: stores `boolean` (true = entire controller hidden)
   * - Method-level: stores `string[]` (list of hidden method names)
   */
  public static readonly HiddenKey = Symbol('openapi:hidden');

  /**
   * @OpenApi() decorator metadata key.
   * Stores OpenApiDecoratorOptions on the PostProcessor subclass.
   */
  public static readonly OptionsKey = Symbol('openapi:options');
}
