<p width="%100" align="center">
  <img src="https://avatars.githubusercontent.com/u/179836938?s=200&v=4" width="150" align="center"/>
</p>

# @asenajs/asena-openapi

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/AsenaJs/asena-openapi)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Bun Version](https://img.shields.io/badge/Bun-1.3.11%2B-blueviolet)](https://bun.sh)

Automatic OpenAPI 3.1 spec generation for AsenaJS — zero config, uses your existing validators.

Your existing `@Controller` routes and validator schemas (`json()`, `query()`, `param()`, `response()`) are automatically converted to a full OpenAPI specification. No extra annotations needed.

## Features

- **Zero Config** - Extracts schemas from existing validators, no extra annotations needed
- **OpenAPI 3.1** - Generates JSON Schema draft-2020-12 compatible spec
- **Zero Runtime Dependencies** - Only peer deps (asena, reflect-metadata, zod)
- **Built-in Swagger UI** - CDN-based UI page, no npm install required
- **@Hidden Decorator** - Class and method level exclusion from spec
- **Zod v4 Native** - Uses `z.toJSONSchema()` for accurate conversion
- **Pluggable Converters** - `SchemaConverter` interface for custom schema types
- **IoC Integrated** - PostProcessor pattern, auto-discovers controllers during bootstrap

## Requirements

- [Bun](https://bun.sh) v1.3.11 or higher
- [@asenajs/asena](https://github.com/AsenaJs/Asena) v0.7.0 or higher
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
  ui: true, // Swagger UI at /api/openapi/ui
})
export class AppOpenApi extends OpenApiPostProcessor {}
```

Add it to your components — that's it:

```typescript
const components = [
  AppConfig,
  AppOpenApi,
  // ... your controllers, services, validators
];
```

Now:

- `GET /api/openapi` → OpenAPI 3.1 JSON spec
- `GET /api/openapi/ui` → Swagger UI page

## How It Works

The `OpenApiPostProcessor` automatically:

1. **Intercepts** every `@Controller` during IoC setup
2. **Extracts** route metadata (`@Get`, `@Post`, `@Put`, `@Delete`)
3. **Resolves** validators and converts their Zod schemas to JSON Schema
4. **Generates** a complete OpenAPI 3.1 spec
5. **Registers** GET endpoints on the adapter for spec and Swagger UI

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

  // → path parameters
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
  ui: true, // Default: false — enables Swagger UI at {path}/ui
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

## Swagger UI

When `ui: true`, a Swagger UI page is served at `{path}/ui`. It loads from CDN — zero npm dependencies:

- Uses `swagger-ui-dist@5` from unpkg CDN
- No build step required
- Works in development and production

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
