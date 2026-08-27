import { extractComponentName } from '@asenajs/asena/utils';
import type { ApiParams } from '@asenajs/asena/adapter';
import type {
  JsonSchema,
  OperationObject,
  ParameterObject,
  RequestBodyObject,
  ResponseObject,
  SchemaConverter,
} from '../types';

/**
 * Resolves a validator instance by component name, or undefined when it cannot be resolved.
 *
 * The two spec builders discover validators differently - the generator asks the Container, the
 * postprocessor reads what it collected during component creation - and that is the only
 * difference between them worth keeping.
 */
export type ValidatorResolver = (validatorName: string) => Promise<any | undefined>;

/** Path Item fields OpenAPI 3.1 defines. `all` and `connect` are Asena routes with no spec form. */
const OPENAPI_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

/**
 * Whether a route's HTTP method has an OpenAPI representation.
 *
 * `@All` and `@Connect` produce `HttpMethod.ALL` / `HttpMethod.CONNECT`, which are not Path Item
 * fields - emitting them produced a spec that fails validation.
 */
export function isDocumentableMethod(method: string): boolean {
  return OPENAPI_METHODS.has(method);
}

/**
 * Build an OpenAPI path from a controller base path and route path.
 * Converts Express-style `:param` to OpenAPI `{param}` format.
 */
export function buildOpenApiPath(basePath: string, routePath: string): string {
  const joined = `${basePath}/${routePath}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';

  // Leading letter/underscore required: a param name can contain hyphens (`:user-id`), but
  // `/time:8080` is a literal segment, not a parameter.
  return joined.replace(/:([A-Za-z_][\w-]*)/g, '{$1}');
}

/**
 * Rejects two routes claiming the same path and method.
 *
 * The spec is a plain object keyed by path and method, so the second writer used to overwrite the
 * first: one endpoint vanished from the documentation while staying perfectly routable at runtime.
 */
// eslint-disable-next-line max-params
export function assertNoRouteCollision(
  existing: OperationObject | undefined,
  method: string,
  fullPath: string,
  controllerName: string,
): void {
  if (!existing) return;

  const previousOwner = existing.tags?.[0] ?? 'unknown controller';

  throw new Error(
    `OpenAPI route collision: ${method.toUpperCase()} ${fullPath} is declared by both ` +
      `${previousOwner} and ${controllerName}. Give one of them a different path or method.`,
  );
}

/**
 * Keeps operationIds unique, which OpenAPI requires and same-named controller classes break.
 * The first occurrence keeps the bare id so existing specs do not shift.
 */
export function uniqueOperationId(operationId: string, used: Set<string>): string {
  if (!used.has(operationId)) {
    used.add(operationId);

    return operationId;
  }

  let suffix = 2;

  while (used.has(`${operationId}_${suffix}`)) {
    suffix++;
  }

  const unique = `${operationId}_${suffix}`;

  used.add(unique);

  return unique;
}

/**
 * Build a single OpenAPI operation object from route metadata.
 */
export async function buildOperation(input: {
  controllerName: string;
  methodName: string;
  fullPath: string;
  params: ApiParams;
  converters: SchemaConverter[];
  resolveValidator: ValidatorResolver;
}): Promise<OperationObject> {
  const { controllerName, methodName, fullPath, params, converters, resolveValidator } = input;

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
    await extractValidatorSchemas(operation, params.validator, converters, resolveValidator);
  }

  reconcilePathParameters(operation, fullPath);

  if (Object.keys(operation.responses).length === 0) {
    operation.responses['200'] = { description: 'Successful response' };
  }

  return operation;
}

/**
 * Makes the operation's path parameters match the path template.
 *
 * OpenAPI requires every `{variable}` in the path to have a matching parameter, and forbids path
 * parameters that are not in the template. Both used to happen: a route with no `param()`
 * validator documented `{id}` with no parameter at all, and a `param()` schema declaring a field
 * the path never mentions emitted it anyway.
 */
function reconcilePathParameters(operation: OperationObject, fullPath: string): void {
  const templateParams = [...fullPath.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);

  if (operation.parameters) {
    operation.parameters = operation.parameters.filter(
      (parameter) => parameter.in !== 'path' || templateParams.includes(parameter.name),
    );
  }

  const declared = new Set(
    (operation.parameters ?? []).filter((parameter) => parameter.in === 'path').map((parameter) => parameter.name),
  );

  const missing = templateParams.filter((name) => !declared.has(name));

  if (missing.length === 0) return;

  operation.parameters ??= [];

  for (const name of missing) {
    operation.parameters.push({ name, in: 'path', required: true, schema: { type: 'string' } });
  }
}

// eslint-disable-next-line max-params
async function extractValidatorSchemas(
  operation: OperationObject,
  validatorClass: any,
  converters: SchemaConverter[],
  resolveValidator: ValidatorResolver,
): Promise<void> {
  const validatorName = extractComponentName(validatorClass);

  if (!validatorName) return;

  const validator = await resolveValidator(validatorName);

  if (!validator || Array.isArray(validator)) return;

  await extractRequestBody(operation, validator, 'json', 'application/json', converters);
  await extractRequestBody(operation, validator, 'form', 'multipart/form-data', converters);
  await extractParameters(operation, validator, 'query', 'query', converters);
  await extractParameters(operation, validator, 'param', 'path', converters);
  await extractParameters(operation, validator, 'header', 'header', converters);
  await extractResponses(operation, validator, converters);
}

// eslint-disable-next-line max-params
async function extractRequestBody(
  operation: OperationObject,
  validator: any,
  method: string,
  contentType: string,
  converters: SchemaConverter[],
): Promise<void> {
  if (typeof validator[method] !== 'function') return;

  const rawSchema = await validator[method]();
  const schema = unwrapSchema(rawSchema);
  const jsonSchema = convertSchema(schema, converters);

  if (!jsonSchema) return;

  const requestBody: RequestBodyObject = operation.requestBody || { content: {} };

  // Moved, not copied: Scalar renders both requestBody.description and schema.description,
  // so leaving it in place shows the same sentence twice.
  if (jsonSchema.description) {
    requestBody.description = jsonSchema.description;
    delete jsonSchema.description;
  }

  // A body of nothing but optional fields is not required; json and form OR together because
  // both write the same requestBody and the flag is only ever raised.
  if (jsonSchema.required?.length) {
    requestBody.required = true;
  }

  requestBody.content[contentType] = { schema: jsonSchema };
  operation.requestBody = requestBody;
}

// eslint-disable-next-line max-params
async function extractParameters(
  operation: OperationObject,
  validator: any,
  method: string,
  location: 'query' | 'path' | 'header',
  converters: SchemaConverter[],
): Promise<void> {
  if (typeof validator[method] !== 'function') return;

  const rawSchema = await validator[method]();
  const schema = unwrapSchema(rawSchema);
  const jsonSchema = convertSchema(schema, converters);

  if (!jsonSchema || !jsonSchema.properties) return;

  operation.parameters ??= [];

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

async function extractResponses(
  operation: OperationObject,
  validator: any,
  converters: SchemaConverter[],
): Promise<void> {
  if (typeof validator.response !== 'function') return;

  const rawResponse = await validator.response();

  if (!rawResponse) return;

  if (isStatusCodeMap(rawResponse)) {
    for (const [statusCode, entry] of Object.entries(rawResponse)) {
      const responseObj: ResponseObject = { description: `Response ${statusCode}` };

      if (isResponseDefinition(entry)) {
        if (entry.description) {
          responseObj.description = entry.description;
        }

        if (entry.schema) {
          const jsonSchema = convertSchema(unwrapSchema(entry.schema), converters);

          if (jsonSchema) {
            responseObj.content = { 'application/json': { schema: jsonSchema } };
          }
        }
      } else {
        const jsonSchema = convertSchema(unwrapSchema(entry), converters);

        if (jsonSchema) {
          responseObj.content = { 'application/json': { schema: jsonSchema } };
        }
      }

      operation.responses[statusCode] = responseObj;
    }

    return;
  }

  const jsonSchema = convertSchema(unwrapSchema(rawResponse), converters);

  if (jsonSchema) {
    operation.responses['200'] = {
      description: 'Successful response',
      content: { 'application/json': { schema: jsonSchema } },
    };
  }
}

/**
 * Check if response() returned a status code map (a plain object with numeric string keys).
 */
function isStatusCodeMap(value: any): boolean {
  if (value === null || typeof value !== 'object') return false;

  // If it has _def, it's a Zod schema, not a map
  if ('_def' in value) return false;

  const keys = Object.keys(value);

  if (keys.length === 0) return false;

  return keys.every((key) => /^\d+$/.test(key));
}

/**
 * Check if a response entry is a ResponseSchemaDefinition ({ schema, description }).
 */
function isResponseDefinition(value: any): value is { schema?: any; description?: string } {
  return (
    value !== null && typeof value === 'object' && !('_def' in value) && ('schema' in value || 'description' in value)
  );
}

/**
 * Unwrap ValidationSchemaWithHook format: { schema, hook } → schema.
 * Both Ergenecore and Hono use this pattern.
 */
function unwrapSchema(schema: unknown): unknown {
  if (schema !== null && typeof schema === 'object' && 'schema' in schema && 'hook' in schema) {
    return (schema as any).schema;
  }

  return schema;
}

/**
 * Convert a raw schema through the converter chain. Returns the first successful conversion.
 */
function convertSchema(schema: unknown, converters: SchemaConverter[]): JsonSchema | undefined {
  for (const converter of converters) {
    if (converter.canConvert(schema)) {
      return converter.convert(schema);
    }
  }

  return undefined;
}
