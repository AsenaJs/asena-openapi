// Decorators
export { Hidden, OpenApi } from './lib/decorators';
export type { OpenApiDecoratorOptions } from './lib/decorators';

// PostProcessor
export { OpenApiPostProcessor } from './lib/postprocessor/OpenApiPostProcessor';

// Converter
export { ZodSchemaConverter } from './lib/converter/ZodSchemaConverter';

// Generator (legacy — prefer OpenApiPostProcessor)
export { OpenApiGenerator } from './lib/generator/OpenApiGenerator';

// Constants
export { OpenApiConstants } from './lib/constants/OpenApiConstants';

// Types
export type {
  SchemaConverter,
  OpenApiOptions,
  OpenApiInfo,
  OpenApiServer,
  JsonSchema,
  OpenApiSpec,
  OpenApiTag,
  PathItem,
  OperationObject,
  ParameterObject,
  RequestBodyObject,
  ResponseObject,
} from './lib/types';
