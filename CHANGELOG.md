# @asenajs/asena-openapi

## 3.0.0

### Major Changes

- a5aa0c1: Requires `@asenajs/asena` `^0.11.0` as the peer dependency and Bun 1.4. Core 0.10.x is outside the peer range.

## 2.1.0

### Minor Changes

- a3daeb8: Fix five ways the generated spec was invalid OpenAPI, and unify the two spec builders.
  - **Path parameters are now emitted for every path variable.** A route like `@Get('/:id')` without a `param()` validator documented `/{id}` with no matching parameter, which OpenAPI forbids and which left Swagger UI no field to fill the segment in. Missing ones are synthesized as `{ in: 'path', required: true, schema: { type: 'string' } }`; a `param()` schema keeps its own definition. Conversely, a `param()` field the path template does not mention is no longer emitted.
  - **Two routes claiming the same path and method now throw** instead of silently overwriting. The second writer used to win, so a routable endpoint vanished from the documentation with no signal. The error names both controllers. For `OpenApiPostProcessor` this surfaces on the first `/openapi` request, not at boot.
  - **`@All` and `@Connect` routes are skipped.** `all` and `connect` are not OpenAPI Path Item fields; emitting them produced a spec that fails validation.
  - **`operationId` collisions are resolved** with a numeric suffix. Two controller classes sharing a name produced duplicate ids, which OpenAPI forbids. The first occurrence keeps the bare id.
  - **`requestBody.required` is derived from the schema** instead of hardcoded `true`. A body of nothing but optional fields is no longer marked required; when a validator declares both `json()` and `form()`, either one having a required field is enough.
  - **Hyphenated path params** (`/:user-id`) now convert correctly, and a literal colon (`/time:8080`) is no longer mangled into a parameter.

  `OpenApiGenerator` and `OpenApiPostProcessor` now share one internal operation builder rather than carrying near-identical copies. As a side effect the legacy `OpenApiGenerator` gains what only the postprocessor emitted before: route `summary`, request-body descriptions and parameter descriptions. Public API is unchanged.

  Not addressed: `@Hidden` is keyed by method name and unioned across the prototype chain, so a subclass reusing a base-hidden method name for a different route stays hidden. Deferred pending the decorator-inheritance rules.

## 2.0.0

### Major Changes

- The core peer moves to `^0.10.0`

  No source change. `@asenajs/asena@0.10.0` moves component start hooks out of the container and
  into `server.start()`; `OpenApiPostProcessor` is a `@PostProcessor`, so its own hook keeps running
  at construction and its behaviour is unaffected.

  **Breaking:** requires `@asenajs/asena@^0.10.0`. A 0.9.x application cannot use this version.

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
