<p width="%100" align="center">
  <img src="https://avatars.githubusercontent.com/u/179836938?s=200&v=4" width="150" align="center"/>
</p>

# @asenajs/asena-openapi

[![Version](https://img.shields.io/npm/v/@asenajs/asena-openapi.svg)](https://github.com/AsenaJs/asena-openapi)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Bun Version](https://img.shields.io/badge/Bun-1.4%2B-blueviolet)](https://bun.sh)

Automatic OpenAPI 3.1 spec generation for AsenaJS, built from your existing routes, context contracts and validators.

**Requirements:** [Bun](https://bun.sh) v1.4+, [@asenajs/asena](https://github.com/AsenaJs/Asena) v0.12.0+, [Zod](https://zod.dev) v4.3+

## Installation

```bash
bun add @asenajs/asena-openapi
```

## Quick Start

Put this class anywhere in your `sourceFolder`; the component scan picks it up:

```typescript
import { OpenApi, OpenApiPostProcessor } from '@asenajs/asena-openapi';

@OpenApi({
  info: { title: 'My API', version: '1.0.0' },
  path: '/api/openapi',
  ui: 'scalar', // or 'swagger'
})
export class AppOpenApi extends OpenApiPostProcessor {}
```

- `GET /api/openapi` → OpenAPI 3.1 JSON spec
- `GET /api/openapi/ui` → API docs UI

## Documentation

Full documentation: [asena.sh/docs/packages/openapi](https://asena.sh/docs/packages/openapi)

## Contributing

Contributions are welcome. Submit a Pull Request on [GitHub](https://github.com/AsenaJs/asena-openapi).

## License

MIT

## Support

Issues or questions? Open an issue on [GitHub](https://github.com/AsenaJs/asena-openapi/issues).
