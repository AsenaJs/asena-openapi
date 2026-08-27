/**
 * CDN-based API documentation UI pages. Zero npm dependencies — the provider
 * bundles load from a CDN at request time in the browser.
 */

/**
 * Escapes a value for safe interpolation into HTML text and attribute contexts.
 */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Serializes a value for embedding inside an inline <script>. A literal `<` would
 * let attacker-controlled configuration close the script tag early (`</script>`),
 * and JSON accepts \u escapes, so every `<` becomes `\u003c`.
 */
const serializeInlineJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * Builds a Swagger UI page. `configuration` is spread over the SwaggerUIBundle
 * defaults, so its keys (including `url`) win.
 */
export function buildSwaggerHtml(title: string, specPath: string, configuration?: Record<string, unknown>): string {
  const config = configuration ? `\n      ...${serializeInlineJson(configuration)},` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - API Docs</title>
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
      layout: 'BaseLayout',${config}
    });
  </script>
</body>
</html>`;
}

/**
 * Builds a Scalar API Reference page using the documented standalone CDN pattern
 * (Scalar.createApiReference). `configuration` is spread over `{ url: specPath }`,
 * so its keys (including `url`) win.
 */
export function buildScalarHtml(title: string, specPath: string, configuration?: Record<string, unknown>): string {
  const config = serializeInlineJson({ url: specPath, ...configuration });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - API Docs</title>
</head>
<body>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1"></script>
  <script>
    Scalar.createApiReference('#app', ${config});
  </script>
</body>
</html>`;
}
