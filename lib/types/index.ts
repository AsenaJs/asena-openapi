/**
 * Interface for converting adapter-specific schemas (e.g., Zod) to JSON Schema.
 * Supports a converter chain pattern — multiple converters can be registered,
 * and the first one that matches wins.
 */
export interface SchemaConverter {
  /**
   * Checks whether this converter can handle the given schema.
   * @param schema - Raw schema object (e.g., a Zod type)
   * @param direction - Request input or response output shape
   * @returns true if this converter can convert it
   */
  canConvert(schema: unknown, direction?: SchemaDirection): boolean;

  /**
   * Converts a schema to JSON Schema format.
   * @param schema - Raw schema object
   * @param direction - Request input or response output shape
   * @param options - Strict mode is used for route contracts, which must be documentable
   * @returns JSON Schema representation, or undefined if conversion fails
   */
  convert(schema: unknown, direction?: SchemaDirection, options?: { strict?: boolean }): JsonSchema | undefined;
}

/** The side of a Standard Schema contract represented in JSON Schema. */
export type SchemaDirection = 'input' | 'output';

/**
 * Available API documentation UI providers.
 */
export type OpenApiUiProvider = 'swagger' | 'scalar';

/**
 * UI option of the @OpenApi decorator.
 *
 * - `true` / `'swagger'` — Swagger UI (the historical behavior of `true`)
 * - `'scalar'` — Scalar API Reference
 * - object — provider plus raw provider configuration, merged over the defaults
 *   (e.g. `{ provider: 'scalar', configuration: { theme: 'purple' } }`)
 */
export type OpenApiUiOption =
  | boolean
  | OpenApiUiProvider
  | {
      provider: OpenApiUiProvider;
      configuration?: Record<string, unknown>;
    };

/**
 * Configuration options for the OpenAPI spec generator.
 */
export interface OpenApiOptions {
  /** OpenAPI info object */
  info: OpenApiInfo;
  /** Optional list of server URLs */
  servers?: OpenApiServer[];
  /** Schema converters for transforming validator schemas to JSON Schema */
  converters?: SchemaConverter[];
}

export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
}

export interface OpenApiServer {
  url: string;
  description?: string;
}

// --- JSON Schema types ---

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  description?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  default?: unknown;
  const?: unknown;
  nullable?: boolean;
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
}

// --- OpenAPI 3.1 spec types ---

export interface OpenApiSpec {
  openapi: '3.1.0';
  info: OpenApiInfo;
  servers?: OpenApiServer[];
  paths: Record<string, PathItem>;
  tags?: OpenApiTag[];
}

export interface OpenApiTag {
  name: string;
  description?: string;
}

export interface PathItem {
  [method: string]: OperationObject;
}

export interface OperationObject {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject>;
}

export interface ParameterObject {
  name: string;
  in: 'query' | 'path' | 'header';
  required?: boolean;
  schema?: JsonSchema;
  description?: string;
}

export interface RequestBodyObject {
  description?: string;
  content: Record<string, { schema: JsonSchema }>;
  required?: boolean;
}

export interface ResponseObject {
  description: string;
  content?: Record<string, { schema: JsonSchema }>;
}
