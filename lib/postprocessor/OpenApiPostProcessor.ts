import { Inject, PostConstruct } from '@asenajs/asena/decorators/ioc';
import { ICoreServiceNames } from '@asenajs/asena/ioc/types';
import {
  extractComponentName,
  extractControllerRouteInfo,
  getChainedTypedMetadataList,
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
import { buildScalarHtml, buildSwaggerHtml } from '../ui/HtmlBuilders';
import {
  assertNoRouteCollision,
  buildOpenApiPath,
  buildOperation,
  isDocumentableMethod,
  uniqueOperationId,
} from '../shared/OperationBuilder';
import type { OpenApiSpec, OpenApiUiOption, OpenApiUiProvider } from '../types';
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

    const ui = this.resolveUi(options.ui);

    if (ui) {
      const html =
        ui.provider === 'scalar'
          ? buildScalarHtml(options.info.title, path, ui.configuration)
          : buildSwaggerHtml(options.info.title, path, ui.configuration);

      this.adapter.registerRoute({
        method: HttpMethod.GET,
        path: `${path}/ui`,
        middlewares: [],
        handler: async (context: any) => context.html(html),
        staticServe: undefined as any,
        validator: undefined as any,
      });
    }
  }

  public postProcess<T>(instance: T, Class: any): T {
    if (this.isController(Class)) {
      const isHidden = getOwnTypedMetadata(OpenApiConstants.HiddenClassKey, Class);

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

  private resolveUi(
    ui: OpenApiUiOption | undefined,
  ): { provider: OpenApiUiProvider; configuration?: Record<string, unknown> } | null {
    if (ui === undefined || ui === false) return null;

    if (ui === true) return { provider: 'swagger' };

    if (typeof ui === 'string') {
      if (ui === 'swagger' || ui === 'scalar') return { provider: ui };

      throw new Error(
        `Invalid @OpenApi() ui value: "${ui}". Expected true, false, 'swagger', 'scalar' or { provider, configuration }.`,
      );
    }

    const provider = (ui as { provider?: unknown }).provider;

    if (provider === 'swagger' || provider === 'scalar') {
      return { provider, configuration: ui.configuration };
    }

    throw new Error(`Invalid @OpenApi() ui provider: "${String(provider)}". Expected 'swagger' or 'scalar'.`);
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
    const usedOperationIds = new Set<string>();

    for (const { instance, Class } of this.controllers) {
      const hiddenMethods = getChainedTypedMetadataList<string>(OpenApiConstants.HiddenMethodsKey, Class);

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

        if (!isDocumentableMethod(params.method)) continue;

        const fullPath = buildOpenApiPath(basePath, params.path);

        assertNoRouteCollision(spec.paths[fullPath]?.[params.method], params.method, fullPath, controllerName);

        const operation = await buildOperation({
          controllerName,
          methodName,
          fullPath,
          params,
          converters,
          resolveValidator: async (name) => this.validators.get(name),
        });

        operation.operationId = uniqueOperationId(operation.operationId!, usedOperationIds);

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

  private isController(Class: any): boolean {
    return isControllerUtil(Class);
  }

  private isValidator(Class: any): boolean {
    return isValidatorUtil(Class);
  }
}
