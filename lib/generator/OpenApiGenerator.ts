import { ComponentType } from '@asenajs/asena/ioc/types';
import type { Container } from '@asenajs/asena/container';
import type { ApiParams } from '@asenajs/asena/adapter';
import { extractControllerRouteInfo, getChainedTypedMetadataList, getOwnTypedMetadata } from '@asenajs/asena/utils';
import { OpenApiConstants } from '../constants/OpenApiConstants';
import {
  assertNoRouteCollision,
  buildOpenApiPath,
  buildOperation,
  isDocumentableMethod,
  uniqueOperationId,
} from '../shared/OperationBuilder';
import type { OpenApiOptions, OpenApiSpec, SchemaConverter } from '../types';

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
    const usedOperationIds = new Set<string>();

    for (const controller of controllers) {
      // Class-level stays own-only; method-level walks the chain, because extractControllerRouteInfo
      // now returns inherited routes and a base class's @Hidden has to follow its method.
      if (getOwnTypedMetadata(OpenApiConstants.HiddenClassKey, controller.constructor) === true) continue;

      const { basePath, controllerName, routes } = extractControllerRouteInfo(controller);
      const hiddenMethods = getChainedTypedMetadataList<string>(
        OpenApiConstants.HiddenMethodsKey,
        controller.constructor,
      );

      if (Object.keys(routes).length === 0) continue;

      tagSet.add(controllerName);

      for (const [methodName, params] of Object.entries(routes) as [string, ApiParams][]) {
        // Method-level @Hidden → skip this route
        if (hiddenMethods.includes(methodName)) continue;

        if (!isDocumentableMethod(params.method)) continue;

        const fullPath = buildOpenApiPath(basePath, params.path);

        assertNoRouteCollision(spec.paths[fullPath]?.[params.method], params.method, fullPath, controllerName);

        const operation = await buildOperation({
          controllerName,
          methodName,
          fullPath,
          params,
          converters: this.converters,
          resolveValidator: (name) => this.resolveValidator(name, container),
        });

        operation.operationId = uniqueOperationId(operation.operationId!, usedOperationIds);

        if (!spec.paths[fullPath]) {
          spec.paths[fullPath] = {};
        }

        spec.paths[fullPath][params.method] = operation;
      }
    }

    spec.tags = Array.from(tagSet).map((name) => ({ name }));

    return spec;
  }

  private async resolveValidator(validatorName: string, container: Container): Promise<any | undefined> {
    try {
      return await container.resolve(validatorName);
    } catch {
      // Validator not resolvable (test env, optional) — skip
      return undefined;
    }
  }
}
