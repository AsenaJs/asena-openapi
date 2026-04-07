import { PostProcessor } from '@asenajs/asena/decorators';
import { defineTypedMetadata } from '@asenajs/asena/utils';
import { OpenApiConstants } from '../constants/OpenApiConstants';
import type { OpenApiInfo, OpenApiServer, SchemaConverter } from '../types';

/**
 * Configuration options for the @OpenApi decorator.
 */
export interface OpenApiDecoratorOptions {
  /** OpenAPI info object (title, version, description) */
  info: OpenApiInfo;
  /** Path to serve the OpenAPI spec (default: '/openapi') */
  path?: string;
  /** Enable Swagger UI at {path}/ui (default: false) */
  ui?: boolean;
  /** Schema converters (default: [ZodSchemaConverter]) */
  converters?: SchemaConverter[];
  /** Server URLs for the spec */
  servers?: OpenApiServer[];
}

/**
 * Decorator that configures an OpenAPI PostProcessor.
 *
 * Apply to a class extending `OpenApiPostProcessor` to automatically:
 * 1. Scan all controllers and their validators
 * 2. Generate an OpenAPI 3.1 spec
 * 3. Register a GET endpoint that serves the spec
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
export function OpenApi(options: OpenApiDecoratorOptions) {
  return function <T extends new (...args: any[]) => any>(target: T) {
    defineTypedMetadata(OpenApiConstants.OptionsKey, options, target);

    return PostProcessor()(target) as T;
  };
}
