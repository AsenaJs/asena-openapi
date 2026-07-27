/**
 * Metadata constants for OpenAPI decorators.
 * Uses Symbols to prevent naming collisions.
 */
export class OpenApiConstants {
  /**
   * Class-level `@Hidden()`: `true` when the whole controller is hidden.
   *
   * Read own-only. Hiding a base controller must not hide the subclasses that extend it -
   * class-level metadata describes the class it decorates, not its descendants.
   */
  public static readonly HiddenClassKey = Symbol.for('asena:openapi:hidden:class');

  /**
   * Method-level `@Hidden()`: the names of the hidden route methods.
   *
   * Read across the prototype chain, because a method decorator writes to the class that
   * *declares* the method. Kept separate from {@link HiddenClassKey}: both used to share one
   * key holding two different shapes (`boolean` and `string[]`), which no chain merge can
   * reconcile - and it silently published a base class's `@Hidden` route once inherited
   * routes started reaching the spec.
   */
  public static readonly HiddenMethodsKey = Symbol.for('asena:openapi:hidden:methods');

  /**
   * @OpenApi() decorator metadata key.
   * Stores OpenApiDecoratorOptions on the PostProcessor subclass.
   */
  public static readonly OptionsKey = Symbol.for('asena:openapi:options');
}
