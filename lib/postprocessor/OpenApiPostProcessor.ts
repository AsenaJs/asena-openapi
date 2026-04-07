import { Inject, PostConstruct } from '@asenajs/asena/decorators/ioc';
import { ICoreServiceNames } from '@asenajs/asena/ioc/types';
import {
  extractComponentName,
  extractControllerRouteInfo,
  getOwnTypedMetadata,
  isValidator as isValidatorUtil,
  isController as isControllerUtil,
} from '@asenajs/asena/utils';
import { HttpMethod } from '@asenajs/asena/web-types';
import type { AsenaAdapter } from '@asenajs/asena/adapter';
import type { ApiParams } from '@asenajs/asena/adapter';
import type { ComponentPostProcessor } from '@asenajs/asena/ioc/types';
import { OpenApiConstants } from '../constants/OpenApiConstants';
import { ZodSchemaConverter } from '../converter/ZodSchemaConverter';
import type {
  JsonSchema,
  OpenApiSpec,
  OperationObject,
  ParameterObject,
  RequestBodyObject,
  ResponseObject,
  SchemaConverter,
} from '../types';
import type { OpenApiDecoratorOptions } from '../decorators/OpenApi';

/**
 * PostProcessor that automatically generates OpenAPI 3.1 specs from controllers and validators.
 *
 * Use with the @OpenApi decorator to configure options and auto-register a GET endpoint.
 *
 * @example
 * ```typescript
 * @OpenApi({
 *   info: { title: 'My API', version: '1.0.0' },
 *   path: '/api/openapi',
 * })
 * export class AppOpenApi extends OpenApiPostProcessor {}
 * ```
 */
export class OpenApiPostProcessor implements ComponentPostProcessor {
  @Inject(ICoreServiceNames.ASENA_ADAPTER)
  private adapter: AsenaAdapter<any, any>;

  private controllers: { instance: any; Class: any }[] = [];

  private validators = new Map<string, any>();

  private _spec: OpenApiSpec | null = null;

  @PostConstruct()
  public onInit(): void {
    const options = this.getOptions();

    if (!options) return;

    const path = options.path || '/openapi';

    this.adapter.registerRoute({
      method: HttpMethod.GET,
      path,
      middlewares: [],
      handler: async (context: any) => {
        const spec = await this.getSpec();

        return context.send(spec);
      },
      staticServe: undefined as any,
      validator: undefined as any,
    });

    if (options.ui) {
      this.adapter.registerRoute({
        method: HttpMethod.GET,
        path: `${path}/ui`,
        middlewares: [],
        handler: async (context: any) => {
          return context.html(this.buildSwaggerHtml(options.info.title, path));
        },
        staticServe: undefined as any,
        validator: undefined as any,
      });
    }
  }

  public postProcess<T>(instance: T, Class: any): T {
    if (this.isController(Class)) {
      const isHidden = getOwnTypedMetadata(OpenApiConstants.HiddenKey, Class);

      if (isHidden !== true) {
        this.controllers.push({ instance, Class });
      }
    }

    if (this.isValidator(Class)) {
      const name = extractComponentName(Class);

      if (name) {
        this.validators.set(name, instance);
      }
    }

    return instance;
  }

  public async getSpec(): Promise<OpenApiSpec> {
    if (this._spec) return this._spec;

    this._spec = await this.generate();

    return this._spec;
  }

  private getOptions(): OpenApiDecoratorOptions | undefined {
    return getOwnTypedMetadata<OpenApiDecoratorOptions>(OpenApiConstants.OptionsKey, this.constructor);
  }

  private async generate(): Promise<OpenApiSpec> {
    const options = this.getOptions();
    const converters = options?.converters || [new ZodSchemaConverter()];

    const spec: OpenApiSpec = {
      openapi: '3.1.0',
      info: options?.info || { title: 'API', version: '1.0.0' },
      servers: options?.servers,
      paths: {},
      tags: [],
    };

    const tagMap = new Map<string, string>();

    for (const { instance, Class } of this.controllers) {
      const hiddenMeta = getOwnTypedMetadata(OpenApiConstants.HiddenKey, Class);
      const hiddenMethods: string[] = Array.isArray(hiddenMeta) ? (hiddenMeta as string[]) : [];

      const {
        basePath,
        controllerName,
        description: controllerDescription,
        routes,
      } = extractControllerRouteInfo(instance);

      if (Object.keys(routes).length === 0) continue;

      tagMap.set(controllerName, controllerDescription || '');

      for (const [methodName, params] of Object.entries(routes) as [string, ApiParams][]) {
        if (hiddenMethods.includes(methodName)) continue;

        const fullPath = this.buildOpenApiPath(basePath, params.path);
        const operation = await this.buildOperation(controllerName, methodName, params, converters);

        if (!spec.paths[fullPath]) {
          spec.paths[fullPath] = {};
        }

        spec.paths[fullPath][params.method] = operation;
      }
    }

    spec.tags = Array.from(tagMap.entries()).map(([name, description]) => {
      const tag: { name: string; description?: string } = { name };

      if (description) {
        tag.description = description;
      }

      return tag;
    });

    return spec;
  }

  private buildOpenApiPath(basePath: string, routePath: string): string {
    const joined = `${basePath}/${routePath}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';

    return joined.replace(/:(\w+)/g, '{$1}');
  }

  // eslint-disable-next-line max-params
  private async buildOperation(
    controllerName: string,
    methodName: string,
    params: ApiParams,
    converters: SchemaConverter[],
  ): Promise<OperationObject> {
    const operation: OperationObject = {
      tags: [controllerName],
      operationId: `${controllerName}_${methodName}`,
      responses: {},
    };

    if (params.summary) {
      operation.summary = params.summary;
    }

    if (params.description) {
      operation.description = params.description;
    }

    if (params.validator) {
      await this.extractValidatorSchemas(operation, params.validator, converters);
    }

    if (Object.keys(operation.responses).length === 0) {
      operation.responses['200'] = { description: 'Successful response' };
    }

    return operation;
  }

  private async extractValidatorSchemas(
    operation: OperationObject,
    validatorClass: any,
    converters: SchemaConverter[],
  ): Promise<void> {
    const validatorName = extractComponentName(validatorClass);

    if (!validatorName) return;

    const validator = this.validators.get(validatorName);

    if (!validator) return;

    await this.extractRequestBody(operation, validator, 'json', 'application/json', converters);
    await this.extractRequestBody(operation, validator, 'form', 'multipart/form-data', converters);
    await this.extractParameters(operation, validator, 'query', 'query', converters);
    await this.extractParameters(operation, validator, 'param', 'path', converters);
    await this.extractParameters(operation, validator, 'header', 'header', converters);
    await this.extractResponses(operation, validator, converters);
  }

  // eslint-disable-next-line max-params
  private async extractRequestBody(
    operation: OperationObject,
    validator: any,
    method: string,
    contentType: string,
    converters: SchemaConverter[],
  ): Promise<void> {
    if (typeof validator[method] !== 'function') return;

    const rawSchema = await validator[method]();
    const schema = this.unwrapSchema(rawSchema);
    const jsonSchema = this.convertSchema(schema, converters);

    if (!jsonSchema) return;

    const requestBody: RequestBodyObject = operation.requestBody || { content: {}, required: true };

    if (jsonSchema.description) {
      requestBody.description = jsonSchema.description;
    }

    requestBody.content[contentType] = { schema: jsonSchema };
    operation.requestBody = requestBody;
  }

  // eslint-disable-next-line max-params
  private async extractParameters(
    operation: OperationObject,
    validator: any,
    method: string,
    location: 'query' | 'path' | 'header',
    converters: SchemaConverter[],
  ): Promise<void> {
    if (typeof validator[method] !== 'function') return;

    const rawSchema = await validator[method]();
    const schema = this.unwrapSchema(rawSchema);
    const jsonSchema = this.convertSchema(schema, converters);

    if (!jsonSchema || !jsonSchema.properties) return;

    if (!operation.parameters) {
      operation.parameters = [];
    }

    for (const [name, propSchema] of Object.entries(jsonSchema.properties)) {
      const param: ParameterObject = {
        name,
        in: location,
        schema: propSchema,
      };

      if ((propSchema as JsonSchema).description) {
        param.description = (propSchema as JsonSchema).description;
      }

      if (location === 'path') {
        param.required = true;
      } else if (jsonSchema.required?.includes(name)) {
        param.required = true;
      }

      operation.parameters.push(param);
    }
  }

  private async extractResponses(
    operation: OperationObject,
    validator: any,
    converters: SchemaConverter[],
  ): Promise<void> {
    if (typeof validator.response !== 'function') return;

    const rawResponse = await validator.response();

    if (!rawResponse) return;

    if (this.isStatusCodeMap(rawResponse)) {
      for (const [statusCode, entry] of Object.entries(rawResponse)) {
        const responseObj: ResponseObject = { description: `Response ${statusCode}` };

        if (this.isResponseDefinition(entry)) {
          if (entry.description) {
            responseObj.description = entry.description;
          }

          if (entry.schema) {
            const unwrapped = this.unwrapSchema(entry.schema);
            const jsonSchema = this.convertSchema(unwrapped, converters);

            if (jsonSchema) {
              responseObj.content = { 'application/json': { schema: jsonSchema } };
            }
          }
        } else {
          const unwrapped = this.unwrapSchema(entry);
          const jsonSchema = this.convertSchema(unwrapped, converters);

          if (jsonSchema) {
            responseObj.content = { 'application/json': { schema: jsonSchema } };
          }
        }

        operation.responses[statusCode] = responseObj;
      }
    } else {
      const unwrapped = this.unwrapSchema(rawResponse);
      const jsonSchema = this.convertSchema(unwrapped, converters);

      if (jsonSchema) {
        operation.responses['200'] = {
          description: 'Successful response',
          content: { 'application/json': { schema: jsonSchema } },
        };
      }
    }
  }

  private isStatusCodeMap(value: any): boolean {
    if (value === null || typeof value !== 'object') return false;

    if ('_def' in value) return false;

    const keys = Object.keys(value);

    if (keys.length === 0) return false;

    return keys.every((key) => /^\d+$/.test(key));
  }

  private isResponseDefinition(value: any): value is { schema?: any; description?: string } {
    return (
      value !== null && typeof value === 'object' && !('_def' in value) && ('schema' in value || 'description' in value)
    );
  }

  private unwrapSchema(schema: unknown): unknown {
    if (schema !== null && typeof schema === 'object' && 'schema' in schema && 'hook' in schema) {
      return (schema as any).schema;
    }

    return schema;
  }

  private convertSchema(schema: unknown, converters: SchemaConverter[]): JsonSchema | undefined {
    for (const converter of converters) {
      if (converter.canConvert(schema)) {
        return converter.convert(schema);
      }
    }

    return undefined;
  }

  private isController(Class: any): boolean {
    return isControllerUtil(Class);
  }

  private isValidator(Class: any): boolean {
    return isValidatorUtil(Class);
  }

  private buildSwaggerHtml(title: string, specPath: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>body { margin: 0; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '${specPath}',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>`;
  }
}
