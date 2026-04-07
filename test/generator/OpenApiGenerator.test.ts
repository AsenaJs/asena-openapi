import { beforeEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { Container } from '@asenajs/asena/container';
import { Controller, Middleware } from '@asenajs/asena/decorators';
import { Delete, Get, Post } from '@asenajs/asena/decorators/http';
import { OpenApiGenerator } from '../../lib/generator/OpenApiGenerator';
import { ZodSchemaConverter } from '../../lib/converter/ZodSchemaConverter';
import { Hidden } from '../../lib/decorators';

describe('OpenApiGenerator', () => {
  let generator: OpenApiGenerator;
  let container: Container;

  beforeEach(() => {
    container = new Container();
    generator = new OpenApiGenerator({
      info: { title: 'Test API', version: '1.0.0' },
      converters: [new ZodSchemaConverter()],
    });
  });

  test('should return empty paths when no controllers exist', async () => {
    const spec = await generator.generate(container);

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('Test API');
    expect(Object.keys(spec.paths)).toHaveLength(0);
  });

  test('should generate spec for a simple controller', async () => {
    @Controller('/api/users')
    class UserController {
      @Get('/')
      getUsers() {}
    }

    await container.registerInstance('UserController', new UserController());

    const spec = await generator.generate(container);

    expect(spec.paths['/api/users']).toBeDefined();
    expect(spec.paths['/api/users']['get']).toBeDefined();
    expect(spec.paths['/api/users']['get'].operationId).toBe('UserController_getUsers');
    expect(spec.paths['/api/users']['get'].tags).toEqual(['UserController']);
  });

  test('should include route description', async () => {
    @Controller('/api')
    class TestController {
      @Get({ path: '/items', description: 'List all items' })
      listItems() {}
    }

    await container.registerInstance('TestController', new TestController());

    const spec = await generator.generate(container);

    expect(spec.paths['/api/items']['get'].description).toBe('List all items');
  });

  test('should handle multiple routes in one controller', async () => {
    @Controller('/api/posts')
    class PostController {
      @Get('/')
      list() {}

      @Post('/')
      create() {}

      @Delete('/:id')
      remove() {}
    }

    await container.registerInstance('PostController', new PostController());

    const spec = await generator.generate(container);

    expect(spec.paths['/api/posts']).toBeDefined();
    expect(spec.paths['/api/posts']['get']).toBeDefined();
    expect(spec.paths['/api/posts']['post']).toBeDefined();
    expect(spec.paths['/api/posts/{id}']).toBeDefined();
    expect(spec.paths['/api/posts/{id}']['delete']).toBeDefined();
  });

  test('should convert :param to {param} in paths', async () => {
    @Controller('/api')
    class ParamController {
      @Get('/users/:userId/posts/:postId')
      getPost() {}
    }

    await container.registerInstance('ParamController', new ParamController());

    const spec = await generator.generate(container);

    expect(spec.paths['/api/users/{userId}/posts/{postId}']).toBeDefined();
  });

  test('should generate tags from controller names', async () => {
    @Controller('/api/a')
    class AController {
      @Get('/')
      get() {}
    }

    @Controller('/api/b')
    class BController {
      @Get('/')
      get() {}
    }

    await container.registerInstance('AController', new AController());
    await container.registerInstance('BController', new BController());

    const spec = await generator.generate(container);

    const tagNames = spec.tags!.map((t) => t.name);

    expect(tagNames).toContain('AController');
    expect(tagNames).toContain('BController');
  });

  describe('@Hidden', () => {
    test('should skip class-level @Hidden controllers', async () => {
      @Hidden()
      @Controller('/internal')
      class InternalController {
        @Get('/health')
        health() {}
      }

      await container.registerInstance('InternalController', new InternalController());

      const spec = await generator.generate(container);

      expect(spec.paths['/internal/health']).toBeUndefined();
    });

    test('should skip method-level @Hidden routes', async () => {
      @Controller('/api')
      class ApiController {
        @Get('/public')
        publicRoute() {}

        @Hidden()
        @Get('/secret')
        secretRoute() {}
      }

      await container.registerInstance('ApiController', new ApiController());

      const spec = await generator.generate(container);

      expect(spec.paths['/api/public']).toBeDefined();
      expect(spec.paths['/api/secret']).toBeUndefined();
    });
  });

  describe('Validator integration', () => {
    test('should extract requestBody from validator.json()', async () => {
      @Middleware({ validator: true })
      class CreateValidator {
        json() {
          return z.object({ name: z.string(), email: z.string().email() });
        }
      }

      @Controller('/api')
      class TestController {
        @Post({ path: '/users', validator: CreateValidator as any })
        create() {}
      }

      await container.registerInstance('CreateValidator', new CreateValidator());
      await container.registerInstance('TestController', new TestController());

      const spec = await generator.generate(container);
      const op = spec.paths['/api/users']['post'];

      expect(op.requestBody).toBeDefined();
      expect(op.requestBody!.content['application/json']).toBeDefined();
      expect(op.requestBody!.content['application/json'].schema.properties).toBeDefined();
    });

    test('should extract query parameters from validator.query()', async () => {
      @Middleware({ validator: true })
      class ListValidator {
        query() {
          return z.object({ page: z.number(), limit: z.number().optional() });
        }
      }

      @Controller('/api')
      class TestController {
        @Get({ path: '/items', validator: ListValidator as any })
        list() {}
      }

      await container.registerInstance('ListValidator', new ListValidator());
      await container.registerInstance('TestController', new TestController());

      const spec = await generator.generate(container);
      const op = spec.paths['/api/items']['get'];

      expect(op.parameters).toBeDefined();

      const pageParam = op.parameters!.find((p) => p.name === 'page');
      const limitParam = op.parameters!.find((p) => p.name === 'limit');

      expect(pageParam).toBeDefined();
      expect(pageParam!.in).toBe('query');
      expect(pageParam!.required).toBe(true);
      expect(limitParam).toBeDefined();
      expect(limitParam!.required).toBeUndefined();
    });

    test('should extract path parameters from validator.param()', async () => {
      @Middleware({ validator: true })
      class GetValidator {
        param() {
          return z.object({ id: z.string().uuid() });
        }
      }

      @Controller('/api')
      class TestController {
        @Get({ path: '/users/:id', validator: GetValidator as any })
        getUser() {}
      }

      await container.registerInstance('GetValidator', new GetValidator());
      await container.registerInstance('TestController', new TestController());

      const spec = await generator.generate(container);
      const op = spec.paths['/api/users/{id}']['get'];

      const idParam = op.parameters!.find((p) => p.name === 'id');

      expect(idParam).toBeDefined();
      expect(idParam!.in).toBe('path');
      expect(idParam!.required).toBe(true);
    });

    test('should extract single response schema (200)', async () => {
      @Middleware({ validator: true })
      class UserValidator {
        json() {
          return z.object({});
        }

        response() {
          return z.object({ id: z.string(), name: z.string() });
        }
      }

      @Controller('/api')
      class TestController {
        @Get({ path: '/me', validator: UserValidator as any })
        getMe() {}
      }

      await container.registerInstance('UserValidator', new UserValidator());
      await container.registerInstance('TestController', new TestController());

      const spec = await generator.generate(container);
      const op = spec.paths['/api/me']['get'];

      expect(op.responses['200']).toBeDefined();
      expect(op.responses['200'].content).toBeDefined();
      expect(op.responses['200'].content!['application/json'].schema.properties).toBeDefined();
    });

    test('should extract status code map from response()', async () => {
      @Middleware({ validator: true })
      class CreateUserValidator {
        json() {
          return z.object({ name: z.string() });
        }

        response() {
          return {
            201: z.object({ id: z.string() }),
            400: z.object({ error: z.string() }),
          };
        }
      }

      @Controller('/api')
      class TestController {
        @Post({ path: '/users', validator: CreateUserValidator as any })
        create() {}
      }

      await container.registerInstance('CreateUserValidator', new CreateUserValidator());
      await container.registerInstance('TestController', new TestController());

      const spec = await generator.generate(container);
      const op = spec.paths['/api/users']['post'];

      expect(op.responses['201']).toBeDefined();
      expect(op.responses['201'].content).toBeDefined();
      expect(op.responses['400']).toBeDefined();
      expect(op.responses['400'].content).toBeDefined();
    });

    test('should extract response with description from response()', async () => {
      @Middleware({ validator: true })
      class DetailedValidator {
        json() {
          return z.object({});
        }

        response() {
          return {
            200: { schema: z.object({ data: z.string() }), description: 'Success' },
            404: { description: 'Not found' },
          };
        }
      }

      @Controller('/api')
      class TestController {
        @Get({ path: '/data', validator: DetailedValidator as any })
        getData() {}
      }

      await container.registerInstance('DetailedValidator', new DetailedValidator());
      await container.registerInstance('TestController', new TestController());

      const spec = await generator.generate(container);
      const op = spec.paths['/api/data']['get'];

      expect(op.responses['200'].description).toBe('Success');
      expect(op.responses['200'].content).toBeDefined();
      expect(op.responses['404'].description).toBe('Not found');
      expect(op.responses['404'].content).toBeUndefined();
    });

    test('should add default 200 response when no response() exists', async () => {
      @Controller('/api')
      class TestController {
        @Get('/ping')
        ping() {}
      }

      await container.registerInstance('TestController', new TestController());

      const spec = await generator.generate(container);

      expect(spec.paths['/api/ping']['get'].responses['200']).toBeDefined();
      expect(spec.paths['/api/ping']['get'].responses['200'].description).toBe('Successful response');
    });

    test('should handle ValidationSchemaWithHook (unwrap)', async () => {
      @Middleware({ validator: true })
      class HookValidator {
        json() {
          return {
            schema: z.object({ name: z.string() }),
            hook: () => {},
          };
        }
      }

      @Controller('/api')
      class TestController {
        @Post({ path: '/test', validator: HookValidator as any })
        test() {}
      }

      await container.registerInstance('HookValidator', new HookValidator());
      await container.registerInstance('TestController', new TestController());

      const spec = await generator.generate(container);
      const op = spec.paths['/api/test']['post'];

      expect(op.requestBody).toBeDefined();
      expect(op.requestBody!.content['application/json'].schema.properties).toBeDefined();
    });

    test('should skip gracefully when validator cannot be resolved', async () => {
      @Controller('/api')
      class TestController {
        @Get({ path: '/test', validator: class UnregisteredValidator {} as any })
        test() {}
      }

      await container.registerInstance('TestController', new TestController());

      const spec = await generator.generate(container);

      // Should not throw, just skip validator schemas
      expect(spec.paths['/api/test']['get']).toBeDefined();
      expect(spec.paths['/api/test']['get'].responses['200']).toBeDefined();
    });
  });

  test('should include servers when provided', async () => {
    const genWithServers = new OpenApiGenerator({
      info: { title: 'Test', version: '1.0' },
      servers: [{ url: 'https://api.example.com', description: 'Production' }],
    });

    const spec = await genWithServers.generate(container);

    expect(spec.servers).toHaveLength(1);
    expect(spec.servers![0].url).toBe('https://api.example.com');
  });
});
