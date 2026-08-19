---
'@asenajs/asena-openapi': minor
---

Fix five ways the generated spec was invalid OpenAPI, and unify the two spec builders.

- **Path parameters are now emitted for every path variable.** A route like `@Get('/:id')` without a `param()` validator documented `/{id}` with no matching parameter, which OpenAPI forbids and which left Swagger UI no field to fill the segment in. Missing ones are synthesized as `{ in: 'path', required: true, schema: { type: 'string' } }`; a `param()` schema keeps its own definition. Conversely, a `param()` field the path template does not mention is no longer emitted.
- **Two routes claiming the same path and method now throw** instead of silently overwriting. The second writer used to win, so a routable endpoint vanished from the documentation with no signal. The error names both controllers. For `OpenApiPostProcessor` this surfaces on the first `/openapi` request, not at boot.
- **`@All` and `@Connect` routes are skipped.** `all` and `connect` are not OpenAPI Path Item fields; emitting them produced a spec that fails validation.
- **`operationId` collisions are resolved** with a numeric suffix. Two controller classes sharing a name produced duplicate ids, which OpenAPI forbids. The first occurrence keeps the bare id.
- **`requestBody.required` is derived from the schema** instead of hardcoded `true`. A body of nothing but optional fields is no longer marked required; when a validator declares both `json()` and `form()`, either one having a required field is enough.
- **Hyphenated path params** (`/:user-id`) now convert correctly, and a literal colon (`/time:8080`) is no longer mangled into a parameter.

`OpenApiGenerator` and `OpenApiPostProcessor` now share one internal operation builder rather than carrying near-identical copies. As a side effect the legacy `OpenApiGenerator` gains what only the postprocessor emitted before: route `summary`, request-body descriptions and parameter descriptions. Public API is unchanged.

Not addressed: `@Hidden` is keyed by method name and unioned across the prototype chain, so a subclass reusing a base-hidden method name for a different route stays hidden. Deferred pending the decorator-inheritance rules.
