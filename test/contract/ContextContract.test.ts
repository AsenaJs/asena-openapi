import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { ASENA_CONTEXT_ADAPTER, ASENA_CONTEXT_CONTRACT, defineRequestSchemas } from '@asenajs/asena/adapter';
import { Container } from '@asenajs/asena/container';
import { Controller } from '@asenajs/asena/decorators';
import { Middleware } from '@asenajs/asena/decorators';
import { Get, Post } from '@asenajs/asena/decorators/http';
import { ZodSchemaConverter } from '../../lib/converter/ZodSchemaConverter';
import { OpenApi } from '../../lib/decorators/OpenApi';
import { OpenApiGenerator } from '../../lib/generator/OpenApiGenerator';
import { OpenApiPostProcessor } from '../../lib/postprocessor/OpenApiPostProcessor';
import type { JsonSchema, SchemaConverter, SchemaDirection } from '../../index';

function context(schemas: Parameters<typeof defineRequestSchemas>[0]) {
  class ContractContext {
    static readonly [ASENA_CONTEXT_CONTRACT] = defineRequestSchemas(schemas);
    static readonly [ASENA_CONTEXT_ADAPTER] = 'ergenecore';
  }

  return ContractContext;
}

describe('context contracts in OpenAPI', () => {
  test('both generators use input schemas for all request targets', async () => {
    class BodyContext extends context({
      body: z.object({ name: z.string() }).transform(({ name }) => ({ normalized: name.toLowerCase() })),
      query: z.object({ page: z.coerce.number().default(1) }),
      params: z.object({ id: z.string().uuid() }),
      headers: z.object({ authorization: z.string() }),
    }) {}

    @Controller('/users')
    class UsersController {
      @Post('/:id')
      create(_context: BodyContext) {}
    }

    const instance = new UsersController();
    const container = new Container();

    await container.registerInstance('UsersController', instance);

    const generator = new OpenApiGenerator({
      info: { title: 'API', version: '1.0.0' },
      converters: [new ZodSchemaConverter()],
    });
    const standalone = await generator.generate(container);

    @OpenApi({ info: { title: 'API', version: '1.0.0' }, converters: [new ZodSchemaConverter()] })
    class TestPostProcessor extends OpenApiPostProcessor {}

    const postProcessor = new TestPostProcessor();

    postProcessor.postProcess(instance, UsersController);

    const integrated = await postProcessor.getSpec();
    const operation = integrated.paths['/users/{id}'].post;

    expect(integrated).toEqual(standalone);
    expect(operation.requestBody?.required).toBe(true);
    expect(operation.requestBody?.content['application/json'].schema.properties?.name).toMatchObject({
      type: 'string',
    });
    expect(operation.requestBody?.content['application/json'].schema.properties?.normalized).toBeUndefined();
    expect(operation.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: 'query', name: 'page' }),
        expect.objectContaining({ in: 'path', name: 'id', required: true }),
        expect.objectContaining({ in: 'header', name: 'authorization' }),
      ]),
    );
  });

  test('a scalar body is required even without object required fields', async () => {
    class BodyContext extends context({ body: z.string().min(1) }) {}

    @Controller('/scalar')
    class ScalarController {
      @Post('/')
      create(_context: BodyContext) {}
    }

    const container = new Container();

    await container.registerInstance('ScalarController', new ScalarController());

    const spec = await new OpenApiGenerator({
      info: { title: 'API', version: '1' },
      converters: [new ZodSchemaConverter()],
    }).generate(container);

    expect(spec.paths['/scalar'].post.requestBody).toMatchObject({
      required: true,
      content: { 'application/json': { schema: { type: 'string' } } },
    });
  });

  test('unsupported schemas report route and target and do not cache a partial spec', async () => {
    class BadContext extends context({ query: z.map(z.string(), z.string()) }) {}

    @Controller('/bad')
    class BadController {
      @Get('/')
      get(_context: BadContext) {}
    }

    @OpenApi({ info: { title: 'API', version: '1' }, converters: [new ZodSchemaConverter()] })
    class TestPostProcessor extends OpenApiPostProcessor {}

    const processor = new TestPostProcessor();

    processor.postProcess(new BadController(), BadController);

    await expect(processor.getSpec()).rejects.toThrow(/GET \/bad.*contract query/);
    expect((processor as any)._spec).toBeNull();
  });

  test('custom converters receive input direction and unsupported parameter objects fail clearly', async () => {
    const custom = {
      '~standard': { version: 1 as const, vendor: 'custom', validate: (value: unknown) => ({ value }) },
    };
    class QueryContext extends context({ query: custom }) {}

    @Controller('/custom')
    class CustomController {
      @Get('/')
      get(_context: QueryContext) {}
    }

    const container = new Container();

    await container.registerInstance('CustomController', new CustomController());

    const calls: string[] = [];
    const converter: SchemaConverter = {
      canConvert: (schema, direction) => {
        calls.push(`can:${direction}`);
        return schema === custom;
      },
      convert: (_schema, direction?: SchemaDirection): JsonSchema => {
        calls.push(`convert:${direction}`);
        return { type: 'string' };
      },
    };
    const generator = new OpenApiGenerator({ info: { title: 'API', version: '1' }, converters: [converter] });

    await expect(generator.generate(container)).rejects.toThrow(/GET \/custom.*contract query.*object/);
    expect(calls).toEqual(['can:input', 'convert:input']);
  });

  test('legacy responses keep output conversion while requests use input conversion', async () => {
    const requestSchema = { kind: 'request' };
    const responseSchema = { kind: 'response' };

    @Middleware({ validator: true })
    class LegacyValidator {
      json() {
        return requestSchema;
      }

      response() {
        return responseSchema;
      }
    }

    @Controller('/legacy-direction')
    class LegacyController {
      @Post({ path: '/', validator: LegacyValidator })
      create() {}
    }

    const container = new Container();
    await container.registerInstance('LegacyController', new LegacyController());
    await container.registerInstance('LegacyValidator', new LegacyValidator());

    const directions: string[] = [];
    const converter: SchemaConverter = {
      canConvert: (schema) => schema === requestSchema || schema === responseSchema,
      convert: (schema, direction) => {
        directions.push(`${(schema as { kind: string }).kind}:${direction}`);
        return { type: 'object', properties: { id: { type: 'string' } } };
      },
    };
    const spec = await new OpenApiGenerator({
      info: { title: 'API', version: '1' },
      converters: [converter],
    }).generate(container);

    expect(directions).toEqual(['request:input', 'response:output']);
    expect(spec.paths['/legacy-direction'].post.responses['200'].content).toBeDefined();
  });
});
