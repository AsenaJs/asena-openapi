import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { z } from 'zod';
import { Container } from '@asenajs/asena/container';
import { Controller, Middleware } from '@asenajs/asena/decorators';
import { Get, Post } from '@asenajs/asena/decorators/http';
import { OpenApiPostProcessor } from '../../lib/postprocessor/OpenApiPostProcessor';
import { OpenApi, type OpenApiDecoratorOptions } from '../../lib/decorators/OpenApi';
import { OpenApiConstants } from '../../lib/constants/OpenApiConstants';
import { Hidden } from '../../lib/decorators';
import { getOwnTypedMetadata } from '@asenajs/asena/utils';

function createPostProcessor(container: Container, options?: OpenApiDecoratorOptions): OpenApiPostProcessor {
  // Create with @OpenApi decorator options if provided
  if (options) {
    @OpenApi(options)
    class TestOpenApi extends OpenApiPostProcessor {}

    const pp = new TestOpenApi();

    (pp as any).container = container;
    (pp as any).adapter = { registerRoute: mock(() => {}) };

    return pp;
  }

  const pp = new OpenApiPostProcessor();

  (pp as any).container = container;
  (pp as any).adapter = { registerRoute: mock(() => {}) };

  return pp;
}

describe('OpenApiPostProcessor', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe('postProcess', () => {
    test('collects controller instances', () => {
      const pp = createPostProcessor(container);

      @Controller('/api/users')
      class UserController {
        @Get('/')
        list() {}
      }

      const instance = new UserController();

      const result = pp.postProcess(instance, UserController);

      expect(result).toBe(instance);
      expect((pp as any).controllers.length).toBe(1);
    });

    test('does not modify the instance', () => {
      const pp = createPostProcessor(container);

      @Controller('/api')
      class TestController {
        @Get('/')
        index() {}
      }

      const instance = new TestController();
      const result = pp.postProcess(instance, TestController);

      expect(result).toBe(instance);
    });

    test('skips @Hidden controllers', () => {
      const pp = createPostProcessor(container);

      @Hidden()
      @Controller('/internal')
      class InternalController {
        @Get('/metrics')
        metrics() {}
      }

      pp.postProcess(new InternalController(), InternalController);

      expect((pp as any).controllers.length).toBe(0);
    });

    test('skips non-controller components', () => {
      const pp = createPostProcessor(container);

      class PlainService {}

      pp.postProcess(new PlainService(), PlainService);

      expect((pp as any).controllers.length).toBe(0);
    });
  });

  describe('getSpec', () => {
    test('generates valid OpenAPI 3.1.0 spec', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test API', version: '1.0.0' },
      });

      @Controller('/api/users')
      class UserController {
        @Get('/')
        list() {}
      }

      pp.postProcess(new UserController(), UserController);

      const spec = await pp.getSpec();

      expect(spec.openapi).toBe('3.1.0');
      expect(spec.info.title).toBe('Test API');
      expect(spec.info.version).toBe('1.0.0');
    });

    test('extracts routes from collected controllers', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Controller('/api/users')
      class UserController {
        @Get('/')
        list() {}

        @Post('/')
        create() {}
      }

      pp.postProcess(new UserController(), UserController);

      const spec = await pp.getSpec();

      expect(spec.paths['/api/users']).toBeDefined();
      expect(spec.paths['/api/users']['get']).toBeDefined();
      expect(spec.paths['/api/users']['post']).toBeDefined();
    });

    test('converts path params from :id to {id}', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Controller('/api/users')
      class UserController {
        @Get('/:id')
        getById() {}
      }

      pp.postProcess(new UserController(), UserController);

      const spec = await pp.getSpec();

      expect(spec.paths['/api/users/{id}']).toBeDefined();
    });

    test('generates tags from controller names', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Controller('/api/users')
      class UserController {
        @Get('/')
        list() {}
      }

      @Controller('/api/posts')
      class PostController {
        @Get('/')
        list() {}
      }

      pp.postProcess(new UserController(), UserController);
      pp.postProcess(new PostController(), PostController);

      const spec = await pp.getSpec();

      const tagNames = spec.tags?.map((t) => t.name) || [];

      expect(tagNames).toContain('UserController');
      expect(tagNames).toContain('PostController');
    });

    test('resolves validators and extracts request body schema', async () => {
      @Middleware({ validator: true })
      class CreateUserValidator {
        json() {
          return z.object({ name: z.string(), email: z.string().email() });
        }
      }

      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      // Validator collected via postProcess (not container)
      pp.postProcess(new CreateUserValidator(), CreateUserValidator);

      @Controller('/api/users')
      class UserController {
        @Post({ path: '/', validator: CreateUserValidator as any })
        create() {}
      }

      pp.postProcess(new UserController(), UserController);

      const spec = await pp.getSpec();
      const post = spec.paths['/api/users']['post'];

      expect(post.requestBody).toBeDefined();
      expect(post.requestBody!.content['application/json'].schema.properties).toBeDefined();
      expect(post.requestBody!.content['application/json'].schema.properties!['name']).toBeDefined();
      expect(post.requestBody!.content['application/json'].schema.properties!['email']).toBeDefined();
    });

    test('extracts operation summary from route decorator', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Controller('/api/users')
      class UserController {
        @Get({ path: '/', summary: 'List users', description: 'Returns all users' })
        list() {}
      }

      pp.postProcess(new UserController(), UserController);

      const spec = await pp.getSpec();
      const get = spec.paths['/api/users']['get'];

      expect(get.summary).toBe('List users');
      expect(get.description).toBe('Returns all users');
    });

    test('extracts tag description from controller decorator', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Controller({ path: '/api/users', description: 'User management endpoints' })
      class UserController {
        @Get('/')
        list() {}
      }

      pp.postProcess(new UserController(), UserController);

      const spec = await pp.getSpec();
      const userTag = spec.tags?.find((t) => t.name === 'UserController');

      expect(userTag).toBeDefined();
      expect(userTag!.description).toBe('User management endpoints');
    });

    test('tag without controller description has no description field', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Controller('/api/users')
      class UserController {
        @Get('/')
        list() {}
      }

      pp.postProcess(new UserController(), UserController);

      const spec = await pp.getSpec();
      const userTag = spec.tags?.find((t) => t.name === 'UserController');

      expect(userTag).toBeDefined();
      expect(userTag!.description).toBeUndefined();
    });

    test('extracts parameter description from zod describe', async () => {
      @Middleware({ validator: true })
      class QueryValidator {
        query() {
          return z.object({
            page: z.coerce.number().describe('Page number').optional(),
            limit: z.coerce.number().describe('Items per page').optional(),
          });
        }
      }

      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      pp.postProcess(new QueryValidator(), QueryValidator);

      @Controller('/api/items')
      class ItemController {
        @Get({ path: '/', validator: QueryValidator as any })
        list() {}
      }

      pp.postProcess(new ItemController(), ItemController);

      const spec = await pp.getSpec();
      const get = spec.paths['/api/items']['get'];
      const pageParam = get.parameters?.find((p) => p.name === 'page');
      const limitParam = get.parameters?.find((p) => p.name === 'limit');

      expect(pageParam?.description).toBe('Page number');
      expect(limitParam?.description).toBe('Items per page');
    });

    test('extracts request body description from zod describe', async () => {
      @Middleware({ validator: true })
      class BodyValidator {
        json() {
          return z
            .object({
              name: z.string(),
            })
            .describe('User creation payload');
        }
      }

      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      pp.postProcess(new BodyValidator(), BodyValidator);

      @Controller('/api/users')
      class UserController {
        @Post({ path: '/', validator: BodyValidator as any })
        create() {}
      }

      pp.postProcess(new UserController(), UserController);

      const spec = await pp.getSpec();
      const post = spec.paths['/api/users']['post'];

      expect(post.requestBody?.description).toBe('User creation payload');
    });

    test('caches spec after first generation', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Controller('/api')
      class TestController {
        @Get('/')
        index() {}
      }

      pp.postProcess(new TestController(), TestController);

      const spec1 = await pp.getSpec();
      const spec2 = await pp.getSpec();

      expect(spec1).toBe(spec2);
    });

    test('method-level @Hidden excludes specific route', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Controller('/api')
      class ApiController {
        @Get('/public')
        publicRoute() {}

        @Hidden()
        @Get('/secret')
        secretRoute() {}
      }

      pp.postProcess(new ApiController(), ApiController);

      const spec = await pp.getSpec();

      expect(spec.paths['/api/public']).toBeDefined();
      expect(spec.paths['/api/secret']).toBeUndefined();
    });
  });

  describe('@OpenApi decorator', () => {
    test('stores options in metadata', () => {
      @OpenApi({
        info: { title: 'My API', version: '2.0.0' },
        path: '/docs/openapi',
      })
      class AppOpenApi extends OpenApiPostProcessor {}

      const options = getOwnTypedMetadata<OpenApiDecoratorOptions>(OpenApiConstants.OptionsKey, AppOpenApi);

      expect(options).toBeDefined();
      expect(options!.info.title).toBe('My API');
      expect(options!.path).toBe('/docs/openapi');
    });

    test('onInit registers route on adapter', () => {
      const registerRoute = mock(() => {});

      @OpenApi({
        info: { title: 'Test', version: '1.0.0' },
        path: '/api/openapi',
      })
      class AppOpenApi extends OpenApiPostProcessor {}

      const pp = new AppOpenApi();

      (pp as any).container = container;
      (pp as any).adapter = { registerRoute };

      pp.onInit();

      expect(registerRoute).toHaveBeenCalledTimes(1);

      // @ts-ignore
      const call: any = registerRoute.mock.calls[0][0];

      expect(call.method).toBe('get');
      expect(call.path).toBe('/api/openapi');
    });

    test('uses default path /openapi when not specified', () => {
      const registerRoute = mock(() => {});

      @OpenApi({
        info: { title: 'Test', version: '1.0.0' },
      })
      class AppOpenApi extends OpenApiPostProcessor {}

      const pp = new AppOpenApi();

      (pp as any).container = container;
      (pp as any).adapter = { registerRoute };

      pp.onInit();

      // @ts-ignore
      const call: any = registerRoute.mock.calls[0][0];

      expect(call.path).toBe('/openapi');
    });

    test('ui: true registers Swagger UI route at {path}/ui', () => {
      const registerRoute = mock(() => {});

      @OpenApi({
        info: { title: 'My API', version: '1.0.0' },
        path: '/api/openapi',
        ui: true,
      })
      class AppOpenApi extends OpenApiPostProcessor {}

      const pp = new AppOpenApi();

      (pp as any).container = container;
      (pp as any).adapter = { registerRoute };

      pp.onInit();

      expect(registerRoute).toHaveBeenCalledTimes(2);

      // @ts-ignore
      const specRoute: any = registerRoute.mock.calls[0][0];
      // @ts-ignore
      const uiRoute: any = registerRoute.mock.calls[1][0];

      expect(specRoute.path).toBe('/api/openapi');
      expect(uiRoute.path).toBe('/api/openapi/ui');
    });

    test('ui: false does not register Swagger UI route', () => {
      const registerRoute = mock(() => {});

      @OpenApi({
        info: { title: 'Test', version: '1.0.0' },
        path: '/api/openapi',
      })
      class AppOpenApi extends OpenApiPostProcessor {}

      const pp = new AppOpenApi();

      (pp as any).container = container;
      (pp as any).adapter = { registerRoute };

      pp.onInit();

      expect(registerRoute).toHaveBeenCalledTimes(1);
    });
  });
});
