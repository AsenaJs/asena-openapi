# @asenajs/asena-openapi

## 1.1.0

### Minor Changes

- `@Hidden` on a base class method is honoured, and its two shapes now use separate keys

  `@asenajs/asena` 0.9.0 merges a controller's inherited routes into `extractControllerRouteInfo`,
  which this package builds its schema from. Method-level `@Hidden` was still read own-only, so a
  route a base class marked internal became both routable _and_ published:

  ```typescript
  abstract class AdminBase {
    @Hidden() @Get('/internal-metrics') metrics(c) { ... }
  }

  @Controller('/api')
  class PublicController extends AdminBase {}
  // /api/internal-metrics appeared in the public spec
  ```

  Method-level `@Hidden` is now read across the prototype chain. Class-level `@Hidden` stays
  own-only on purpose: it describes the class it decorates, and re-exposing a hidden base under a
  new `@Controller` is a legitimate thing to write.

  **Breaking for anyone reading the metadata directly:** `OpenApiConstants.HiddenKey` is replaced
  by `HiddenClassKey` (boolean) and `HiddenMethodsKey` (string array). One key holding two
  different shapes cannot survive a chain merge — the walk would meet `true` from one class and
  `['debug']` from another.

  All keys are now registered symbols (`Symbol.for`), so they survive a project resolving two
  copies of this package.

  Requires `@asenajs/asena` 0.9.0 or later.
