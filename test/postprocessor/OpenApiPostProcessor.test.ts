import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { z } from 'zod';
import { Container } from '@asenajs/asena/container';
import { Controller, Middleware, Service } from '@asenajs/asena/decorators';
import { All, Get, Post } from '@asenajs/asena/decorators/http';
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

      // OpenAPI requires a parameter for every path variable; without one the spec fails
      // validation and Swagger UI offers no field to fill the segment in.
      expect(spec.paths['/api/users/{id}']['get'].parameters).toEqual([
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ]);
    });

    test('keeps the validator schema for a path param it declares', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Middleware({ validator: true })
      class IdValidator {
        param() {
          return z.object({ id: z.coerce.number() });
        }
      }

      @Controller('/api/users')
      class UserController {
        @Get({ path: '/:id', validator: IdValidator as any })
        getById() {}
      }

      pp.postProcess(new IdValidator(), IdValidator);
      pp.postProcess(new UserController(), UserController);

      const spec = await pp.getSpec();

      const params = spec.paths['/api/users/{id}']['get'].parameters!;

      // Synthesis fills gaps only - a declared param keeps its own schema and is not duplicated
      expect(params.length).toBe(1);
      expect(params[0].name).toBe('id');
      expect(params[0].schema).not.toEqual({ type: 'string' });
    });

    test('drops path params the route template does not contain', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Middleware({ validator: true })
      class StrayValidator {
        param() {
          return z.object({ id: z.string(), ghost: z.string() });
        }
      }

      @Controller('/api/users')
      class UserController {
        @Get({ path: '/:id', validator: StrayValidator as any })
        getById() {}
      }

      pp.postProcess(new StrayValidator(), StrayValidator);
      pp.postProcess(new UserController(), UserController);

      const spec = await pp.getSpec();

      const params = spec.paths['/api/users/{id}']['get'].parameters!;

      // A path parameter absent from the template is invalid OpenAPI, whatever the schema says
      expect(params.map((p) => p.name)).toEqual(['id']);
    });

    test('converts hyphenated path params and leaves literal colons alone', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Controller('/api')
      class MixedController {
        @Get('/users/:user-id')
        byUser() {}

        @Get('/time:8080')
        literal() {}
      }

      pp.postProcess(new MixedController(), MixedController);

      const spec = await pp.getSpec();

      expect(spec.paths['/api/users/{user-id}']).toBeDefined();
      expect(spec.paths['/api/users/{user-id}']['get'].parameters).toEqual([
        { name: 'user-id', in: 'path', required: true, schema: { type: 'string' } },
      ]);
      // Not every colon starts a parameter - a port number is part of the literal path
      expect(spec.paths['/api/time:8080']).toBeDefined();
    });

    test('rejects two controllers claiming the same path and method', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Controller('/api/users')
      class UserController {
        @Get('/')
        list() {}
      }

      @Controller('/api/users')
      class LegacyUserController {
        @Get('/')
        list() {}
      }

      pp.postProcess(new UserController(), UserController);
      pp.postProcess(new LegacyUserController(), LegacyUserController);

      // Silently keeping the last writer meant a routable endpoint vanished from the docs
      await expect(pp.getSpec()).rejects.toThrow(
        /UserController.*LegacyUserController|LegacyUserController.*UserController/,
      );
    });

    test('skips routes whose method has no OpenAPI representation', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Controller('/api')
      class CatchAllController {
        @All('/proxy')
        proxy() {}

        @Get('/health')
        health() {}
      }

      pp.postProcess(new CatchAllController(), CatchAllController);

      const spec = await pp.getSpec();

      // `all` is not a Path Item field - emitting it produced a spec that fails validation
      expect(spec.paths['/api/proxy']).toBeUndefined();
      expect(spec.paths['/api/health']['get']).toBeDefined();
    });

    test('keeps operationIds unique across same-named controller classes', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      const makeController = (basePath: string) => {
        @Controller(basePath)
        class UserController {
          @Get('/')
          list() {}
        }

        return UserController;
      };

      const First = makeController('/api/v1/users');
      const Second = makeController('/api/v2/users');

      pp.postProcess(new First(), First);
      pp.postProcess(new Second(), Second);

      const spec = await pp.getSpec();

      const first = spec.paths['/api/v1/users']['get'].operationId;
      const second = spec.paths['/api/v2/users']['get'].operationId;

      // OpenAPI requires unique operationIds; class names alone do not guarantee that
      expect(first).toBe('UserController_list');
      expect(second).toBe('UserController_list_2');
    });

    test('marks a request body required only when the schema has required fields', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Middleware({ validator: true })
      class OptionalValidator {
        json() {
          return z.object({ note: z.string().optional() });
        }
      }

      @Middleware({ validator: true })
      class RequiredValidator {
        json() {
          return z.object({ name: z.string() });
        }
      }

      @Controller('/api')
      class BodyController {
        @Post({ path: '/optional', validator: OptionalValidator as any })
        optional() {}

        @Post({ path: '/required', validator: RequiredValidator as any })
        required() {}
      }

      pp.postProcess(new OptionalValidator(), OptionalValidator);
      pp.postProcess(new RequiredValidator(), RequiredValidator);
      pp.postProcess(new BodyController(), BodyController);

      const spec = await pp.getSpec();

      // A body of nothing but optional fields is not a required body
      expect(spec.paths['/api/optional']['post'].requestBody!.required).toBeFalsy();
      expect(spec.paths['/api/required']['post'].requestBody!.required).toBe(true);
    });

    test('marks the request body required when either content type requires fields', async () => {
      const pp = createPostProcessor(container, {
        info: { title: 'Test', version: '1.0.0' },
      });

      @Middleware({ validator: true })
      class MixedValidator {
        json() {
          return z.object({ note: z.string().optional() });
        }

        form() {
          return z.object({ file: z.string() });
        }
      }

      @Controller('/api')
      class MixedController {
        @Post({ path: '/mixed', validator: MixedValidator as any })
        mixed() {}
      }

      pp.postProcess(new MixedValidator(), MixedValidator);
      pp.postProcess(new MixedController(), MixedController);

      const spec = await pp.getSpec();

      const { requestBody } = spec.paths['/api/mixed']['post'];

      expect(requestBody!.content['application/json']).toBeDefined();
      expect(requestBody!.content['multipart/form-data']).toBeDefined();
      expect(requestBody!.required).toBe(true);
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

  // The PostProcessor is the path a running app takes; OpenApiGenerator is the legacy
  // standalone entry point. Its inheritance coverage lived only on the generator, so nothing
  // proved the two agree - and the @Hidden regression (a base class's routes reaching the spec
  // while its own-only @Hidden marks did not) is a property of this class, not of that one.
  describe('inheritance', () => {
    test('publishes a route declared on a base class under the subclass base path', async () => {
      const pp = createPostProcessor(container);

      abstract class HealthBase {
        @Get('/live')
        live() {}
      }

      @Controller('/api')
      class ApiController extends HealthBase {
        @Get('/things')
        things() {}
      }

      pp.postProcess(new ApiController(), ApiController);

      const spec = await pp.getSpec();

      expect(Object.keys(spec.paths).sort()).toEqual(['/api/live', '/api/things']);
    });

    test('a @Hidden method on a base class stays out of the spec', async () => {
      const pp = createPostProcessor(container);

      abstract class AdminBase {
        @Hidden()
        @Get('/internal-metrics')
        metrics() {}

        @Get('/status')
        status() {}
      }

      @Controller('/api')
      class PublicController extends AdminBase {}

      pp.postProcess(new PublicController(), PublicController);

      const spec = await pp.getSpec();

      // The regression precisely: /api/internal-metrics was both routable and published.
      expect(Object.keys(spec.paths)).toEqual(['/api/status']);
    });

    test('the subclass keeps its own hidden methods alongside the inherited ones', async () => {
      const pp = createPostProcessor(container);

      abstract class AdminBase {
        @Hidden()
        @Get('/internal-metrics')
        metrics() {}
      }

      @Controller('/api')
      class PublicController extends AdminBase {
        @Hidden()
        @Get('/debug')
        debug() {}

        @Get('/public')
        publicRoute() {}
      }

      pp.postProcess(new PublicController(), PublicController);

      const spec = await pp.getSpec();

      expect(Object.keys(spec.paths)).toEqual(['/api/public']);
    });

    test('a class-level @Hidden on a base does NOT hide the subclass', async () => {
      const pp = createPostProcessor(container);

      @Hidden()
      @Controller('/internal')
      class InternalBase {
        @Get('/thing')
        thing() {}
      }

      @Controller('/public')
      class PublicController extends InternalBase {}

      // The hidden base is offered to the collector too - it must be the one that is dropped.
      pp.postProcess(new InternalBase(), InternalBase);
      pp.postProcess(new PublicController(), PublicController);

      expect((pp as any).controllers.length).toBe(1);

      const spec = await pp.getSpec();

      expect(Object.keys(spec.paths)).toEqual(['/public/thing']);
    });

    test('a @Service extending a @Controller is not collected as a controller', () => {
      const pp = createPostProcessor(container);

      @Controller('/reports')
      class ReportController {
        @Get('/list')
        list() {}
      }

      @Service('DerivedReportService')
      class DerivedReportService extends ReportController {}

      pp.postProcess(new DerivedReportService(), DerivedReportService);

      // Component identity is own-only. Collecting it would publish /list a second time, at the
      // server root, because @Controller's PathKey does not travel with the subclass.
      expect((pp as any).controllers.length).toBe(0);
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
