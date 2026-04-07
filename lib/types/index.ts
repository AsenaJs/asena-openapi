/**
 * Interface for converting adapter-specific schemas (e.g., Zod) to JSON Schema.
 * Supports a converter chain pattern — multiple converters can be registered,
 * and the first one that matches wins.
 */
export interface SchemaConverter {
  /**
   * Checks whether this converter can handle the given schema.
   * @param schema - Raw schema object (e.g., a Zod type)
   * @returns true if this converter can convert it
   */
  canConvert(schema: unknown): boolean;

  /**
   * Converts a schema to JSON Schema format.
   * @param schema - Raw schema object
   * @returns JSON Schema representation, or undefined if conversion fails
   */
  convert(schema: unknown): JsonSchema | undefined;
}

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
