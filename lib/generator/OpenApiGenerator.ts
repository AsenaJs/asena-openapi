import { ComponentType } from '@asenajs/asena/ioc/types';
import type { Container } from '@asenajs/asena/container';
import type { ApiParams } from '@asenajs/asena/adapter';
import { extractComponentName, extractControllerRouteInfo, getOwnTypedMetadata } from '@asenajs/asena/utils';
import { OpenApiConstants } from '../constants/OpenApiConstants';
import type {
  JsonSchema,
  OpenApiOptions,
  OpenApiSpec,
  OperationObject,
  ParameterObject,
  RequestBodyObject,
  ResponseObject,
  SchemaConverter,
} from '../types';

/**
 * Generates OpenAPI 3.1 specs from Asena controller and validator metadata.
 *
 * Standalone utility class — not an IoC service.
 * Reads route metadata via utility functions, resolves validators from Container,
 * and converts schemas through the converter chain.
 *
 * @example
 * ```typescript
 * const generator = new OpenApiGenerator({
 *   info: { title: 'My API', version: '1.0.0' },
 *   converters: [new ZodSchemaConverter()],
 * });
 *
 * const spec = await generator.generate(server.coreContainer.container);
 * ```
 */
export class OpenApiGenerator {
  private readonly options: OpenApiOptions;

  private readonly converters: SchemaConverter[];

  public constructor(options: OpenApiOptions) {
    this.options = options;
    this.converters = options.converters || [];
  }

  /**
   * Generate OpenAPI 3.1 spec from all controllers in the container.
   */
  public async generate(container: Container): Promise<OpenApiSpec> {
    const spec: OpenApiSpec = {
      openapi: '3.1.0',
      info: this.options.info,
      servers: this.options.servers,
      paths: {},
      tags: [],
    };

    const controllers = await container.resolveAll<any>(ComponentType.CONTROLLER);

    if (!controllers) return spec;

    const tagSet = new Set<string>();

    for (const controller of controllers) {
      const hiddenMeta = getOwnTypedMetadata(OpenApiConstants.HiddenKey, controller.constructor);

      // Class-level @Hidden → skip entire controller
      if (hiddenMeta === true) continue;

      const { basePath, controllerName, routes } = extractControllerRouteInfo(controller);
      const hiddenMethods: string[] = Array.isArray(hiddenMeta) ? (hiddenMeta as string[]) : [];

      if (Object.keys(routes).length === 0) continue;

      tagSet.add(controllerName);

      for (const [methodName, params] of Object.entries(routes) as [string, ApiParams][]) {
        // Method-level @Hidden → skip this route
        if (hiddenMethods.includes(methodName)) continue;

        const fullPath = this.buildOpenApiPath(basePath, params.path);
        const operation = await this.buildOperation(controllerName, methodName, params, container);

        if (!spec.paths[fullPath]) {
          spec.paths[fullPath] = {};
        }

        spec.paths[fullPath][params.method] = operation;
      }
    }

    spec.tags = Array.from(tagSet).map((name) => ({ name }));

    return spec;
  }

  /**
   * Build OpenAPI path from controller base path and route path.
   * Converts Express-style `:param` to OpenAPI `{param}` format.
   */
  private buildOpenApiPath(basePath: string, routePath: string): string {
    const joined = `${basePath}/${routePath}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';

    // Convert :param → {param}
    return joined.replace(/:(\w+)/g, '{$1}');
  }

  /**
   * Build a single OpenAPI operation object from route metadata.
   */
  // eslint-disable-next-line max-params
  private async buildOperation(
    controllerName: string,
    methodName: string,
    params: ApiParams,
    container: Container,
  ): Promise<OperationObject> {
    const operation: OperationObject = {
      tags: [controllerName],
      operationId: `${controllerName}_${methodName}`,
      responses: {},
    };

    if (params.description) {
      operation.description = params.description;
    }

    // Extract schemas from validator
    if (params.validator) {
      await this.extractValidatorSchemas(operation, params.validator, container);
    }

    // Ensure at least a default response
    if (Object.keys(operation.responses).length === 0) {
      operation.responses['200'] = { description: 'Successful response' };
    }

    return operation;
  }

  /**
   * Resolve validator from container and extract schemas for all validator methods.
   */
  private async extractValidatorSchemas(operation: OperationObject, validatorClass: any, container: Container) {
    const validatorName = extractComponentName(validatorClass);

    if (!validatorName) return;

    let validator: any;

    try {
      validator = await container.resolve(validatorName);
    } catch {
      // Validator not resolvable (test env, optional) — skip
      return;
    }

    if (!validator || Array.isArray(validator)) return;

    // json() → requestBody (application/json)
    await this.extractRequestBody(operation, validator, 'json', 'application/json');

    // form() → requestBody (multipart/form-data)
    await this.extractRequestBody(operation, validator, 'form', 'multipart/form-data');

    // query() → parameters (in: query)
    await this.extractParameters(operation, validator, 'query', 'query');

    // param() → parameters (in: path)
    await this.extractParameters(operation, validator, 'param', 'path');

    // header() → parameters (in: header)
    await this.extractParameters(operation, validator, 'header', 'header');

    // response() → responses
    await this.extractResponses(operation, validator);
  }

  /**
   * Extract request body from validator method (json/form).
   */
  // eslint-disable-next-line max-params
  private async extractRequestBody(
    operation: OperationObject,
    validator: any,
    method: string,
    contentType: string,
  ): Promise<void> {
    if (typeof validator[method] !== 'function') return;

    const rawSchema = await validator[method]();
    const schema = this.unwrapSchema(rawSchema);
    const jsonSchema = this.convertSchema(schema);

    if (!jsonSchema) return;

    const requestBody: RequestBodyObject = operation.requestBody || { content: {}, required: true };

    requestBody.content[contentType] = { schema: jsonSchema };
    operation.requestBody = requestBody;
  }

  /**
   * Extract parameters from validator method (query/param/header).
   * Converts ZodObject properties to individual ParameterObject entries.
   */
  // eslint-disable-next-line max-params
  private async extractParameters(
    operation: OperationObject,
    validator: any,
    method: string,
    location: 'query' | 'path' | 'header',
  ): Promise<void> {
    if (typeof validator[method] !== 'function') return;

    const rawSchema = await validator[method]();
    const schema = this.unwrapSchema(rawSchema);
    const jsonSchema = this.convertSchema(schema);

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

      // Path params are always required
      if (location === 'path') {
        param.required = true;
      } else if (jsonSchema.required?.includes(name)) {
        param.required = true;
      }

      operation.parameters.push(param);
    }
  }

  /**
   * Extract response schemas from validator.response().
   *
   * Supports three formats:
   * 1. Single schema → 200 response
   * 2. { 201: schema, 400: schema } → status code map
   * 3. { 201: { schema, description } } → full response definitions
   */
  private async extractResponses(operation: OperationObject, validator: any): Promise<void> {
    if (typeof validator.response !== 'function') return;

    const rawResponse = await validator.response();

    if (!rawResponse) return;

    // Check if it's a status code map (object with numeric keys)
    if (this.isStatusCodeMap(rawResponse)) {
      for (const [statusCode, entry] of Object.entries(rawResponse)) {
        const responseObj: ResponseObject = { description: `Response ${statusCode}` };

        if (this.isResponseDefinition(entry)) {
          // Full definition: { schema, description }
          if (entry.description) {
            responseObj.description = entry.description;
          }

          if (entry.schema) {
            const unwrapped = this.unwrapSchema(entry.schema);
            const jsonSchema = this.convertSchema(unwrapped);

            if (jsonSchema) {
              responseObj.content = { 'application/json': { schema: jsonSchema } };
            }
          }
        } else {
          // Raw schema
          const unwrapped = this.unwrapSchema(entry);
          const jsonSchema = this.convertSchema(unwrapped);

          if (jsonSchema) {
            responseObj.content = { 'application/json': { schema: jsonSchema } };
          }
        }

        operation.responses[statusCode] = responseObj;
      }
    } else {
      // Single schema → default 200 response
      const unwrapped = this.unwrapSchema(rawResponse);
      const jsonSchema = this.convertSchema(unwrapped);

      if (jsonSchema) {
        operation.responses['200'] = {
          description: 'Successful response',
          content: { 'application/json': { schema: jsonSchema } },
        };
      }
    }
  }

  /**
   * Check if response() returned a status code map.
   * A status code map is a plain object with numeric string keys.
   */
  private isStatusCodeMap(value: any): boolean {
    if (value === null || typeof value !== 'object') return false;

    // If it has _def, it's a Zod schema, not a map
    if ('_def' in value) return false;

    const keys = Object.keys(value);

    if (keys.length === 0) return false;

    // All keys must be numeric (status codes)
    return keys.every((key) => /^\d+$/.test(key));
  }

  /**
   * Check if a response entry is a ResponseSchemaDefinition ({ schema, description }).
   */
  private isResponseDefinition(value: any): value is { schema?: any; description?: string } {
    return (
      value !== null && typeof value === 'object' && !('_def' in value) && ('schema' in value || 'description' in value)
    );
  }

  /**
   * Unwrap ValidationSchemaWithHook format: { schema, hook } → schema.
   * Both Ergenecore and Hono use this pattern.
   */
  private unwrapSchema(schema: unknown): unknown {
    if (schema !== null && typeof schema === 'object' && 'schema' in schema && 'hook' in schema) {
      return (schema as any).schema;
    }

    return schema;
  }

  /**
   * Convert a raw schema through the converter chain.
   * Returns the first successful conversion.
   */
  private convertSchema(schema: unknown): JsonSchema | undefined {
    for (const converter of this.converters) {
      if (converter.canConvert(schema)) {
        return converter.convert(schema);
      }
    }

    return undefined;
  }
}
