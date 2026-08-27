---
'@asenajs/asena-openapi': minor
---

Add Scalar API Reference as an alternative API docs UI. The `ui` option now accepts `'swagger'` (or `true`, unchanged), `'scalar'`, or `{ provider, configuration }` to pass raw provider configuration through (e.g. Scalar themes, SwaggerUIBundle options). The UI is still served at `{path}/ui`; invalid `ui` values now fail at boot with a clear error.
