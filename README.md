<p width="%100" align="center">
  <img src="https://avatars.githubusercontent.com/u/179836938?s=200&v=4" width="150" align="center"/>
</p>

# @asenajs/asena-openapi

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](https://github.com/AsenaJs/asena-openapi)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Bun Version](https://img.shields.io/badge/Bun-1.4%2B-blueviolet)](https://bun.sh)

Automatic OpenAPI 3.1 spec generation for AsenaJS — zero config, uses your existing validators.

Your existing `@Controller` routes and validator schemas (`json()`, `query()`, `param()`, `response()`) are automatically converted to a full OpenAPI specification. No extra annotations needed.

## Features

- **Zero Config** - Extracts schemas from existing validators, no extra annotations needed
- **OpenAPI 3.1** - Generates JSON Schema draft-2020-12 compatible spec
- **Zero Runtime Dependencies** - Only peer deps (asena, reflect-metadata, zod)
- **Built-in API Docs UIs** - Swagger UI or Scalar, CDN-based, no npm install required
- **@Hidden Decorator** - Class and method level exclusion from spec
- **Zod v4 Native** - Uses `z.toJSONSchema()` for accurate conversion
- **Pluggable Converters** - `SchemaConverter` interface for custom schema types
- **IoC Integrated** - PostProcessor pattern, auto-discovers controllers during bootstrap

## Requirements

- [Bun](https://bun.sh) v1.4 or higher
- [@asenajs/asena](https://github.com/AsenaJs/Asena) v0.11.0 or higher
- [Zod](https://zod.dev) v4.3 or higher

## Installation

```bash
bun add @asenajs/asena-openapi
```

## Quick Start

```typescript
import { OpenApi, OpenApiPostProcessor } from '@asenajs/asena-openapi';

@OpenApi({
  info: { title: 'My API', version: '1.0.0' },
  path: '/api/openapi',
  ui: 'scalar', // or true / 'swagger' — API docs UI at /api/openapi/ui
})
export class AppOpenApi extends OpenApiPostProcessor {}
```

Asena automatically discovers it — that's it.

Now:

- `GET /api/openapi` → OpenAPI 3.1 JSON spec
- `GET /api/openapi/ui` → API docs UI (Swagger UI or Scalar)

## How It Works

The `OpenApiPostProcessor` automatically:

1. **Intercepts** every `@Controller` during IoC setup
2. **Extracts** route metadata (`@Get`, `@Post`, `@Put`, `@Delete`)
3. **Resolves** validators and converts their Zod schemas to JSON Schema
4. **Generates** a complete OpenAPI 3.1 spec
5. **Registers** GET endpoints on the adapter for spec and the docs UI

Your existing validators do double duty — they validate requests AND generate documentation:

```typescript
@Middleware({ validator: true })
export class CreateUserValidator extends ValidationService {
  // → requestBody (application/json)
  json() {
    return z.object({
      name: z.string().min(1),
      email: z.string().email(),
    });
  }

  // → query parameters
  query() {
    return z.object({
      page: z.coerce.number().optional(),
    });
  }

  // → path parameters (only for segments the path template declares)
  param() {
    return z.object({
      id: z.string().uuid(),
    });
  }

  // → response schemas by status code
  response() {
    return {
      201: z.object({ id: z.string(), name: z.string() }),
      400: { schema: z.object({ error: z.string() }), description: 'Validation error' },
    };
  }
}
```

### Path Parameters

Every variable in a route path is documented, whether or not a `param()` validator describes it.
`@Get('/:id')` on its own emits `id` as a required `string`; a `param()` schema replaces that
default with its own definition. A `param()` field the path template does not mention is dropped —
OpenAPI has nowhere to put it.

### Routes That Cannot Be Documented

- **`@All` and `@Connect` are skipped.** `all` and `connect` are not OpenAPI Path Item fields, so
  emitting them produces a spec that fails validation.
- **Two routes claiming the same path and method throw.** Generation stops and the error names both
  controllers, rather than letting the second writer silently overwrite the first. With
  `OpenApiPostProcessor` this surfaces on the first request to the spec endpoint, not at boot.
- **`operationId` collisions get a numeric suffix.** Two controller classes sharing a name would
  otherwise produce duplicate ids, which OpenAPI forbids. The first occurrence keeps the bare id.

## @Hidden

Hide controllers or individual routes from the spec:

```typescript
// Hide entire controller
@Hidden()
@Controller('/internal')
export class InternalController { ... }

// Hide single route
@Controller('/api')
export class ApiController {
  @Hidden()
  @Get('/health')
  healthCheck() {}

  @Get('/users')  // this route IS in the spec
  listUsers() {}
}
```

## Configuration

### OpenApiDecoratorOptions

```typescript
@OpenApi({
  info: {
    title: 'My API', // Required
    version: '1.0.0', // Required
    description: 'My app', // Optional
  },
  path: '/api/openapi', // Default: '/openapi'
  ui: 'scalar', // Default: none — 'swagger' (or true), 'scalar', or { provider, configuration }
  servers: [
    // Optional
    { url: 'https://api.example.com', description: 'Production' },
  ],
  converters: [
    // Default: [ZodSchemaConverter]
    new ZodSchemaConverter(),
  ],
})
export class AppOpenApi extends OpenApiPostProcessor {}
```

## API Docs UI

Set `ui` to serve an API documentation page at `{path}/ui`. Both providers load from
CDN — zero npm dependencies:

| Value                         | UI served                                                                 |
| ----------------------------- | ------------------------------------------------------------------------- |
| `true` / `'swagger'`          | Swagger UI (`swagger-ui-dist@5` from unpkg)                               |
| `'scalar'`                    | Scalar API Reference (`@scalar/api-reference@1` from jsdelivr)            |
| `{ provider, configuration }` | Either provider, with raw provider configuration merged over the defaults |
| `false` / unset               | None                                                                      |

`configuration` is passed straight through: for Scalar it lands in
`Scalar.createApiReference`, for Swagger in `SwaggerUIBundle`. Its keys override the
defaults — including `url`, if you want the UI to read a spec from somewhere else.

```typescript
@OpenApi({
  info: { title: 'My API', version: '1.0.0' },
  ui: {
    provider: 'scalar',
    configuration: { theme: 'purple', darkMode: true },
  },
})
export class AppOpenApi extends OpenApiPostProcessor {}
```

An unknown provider fails at boot with a clear error instead of serving a broken page.

## OpenApiGenerator (Legacy)

For manual spec generation without the PostProcessor:

```typescript
import { OpenApiGenerator, ZodSchemaConverter } from '@asenajs/asena-openapi';

const generator = new OpenApiGenerator({
  info: { title: 'My API', version: '1.0.0' },
  converters: [new ZodSchemaConverter()],
});

const spec = await generator.generate(server.coreContainer.container);
```

Both builders share one internal operation builder, so a route documents identically either way.

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Maintain test coverage for critical paths
2. Follow existing code style and linting rules
3. Test with both Hono and Ergenecore adapters

Submit a Pull Request on [GitHub](https://github.com/AsenaJs/asena-openapi).

## License

MIT

## Support

Issues or questions? Open an issue on [GitHub](https://github.com/AsenaJs/asena-openapi/issues).
