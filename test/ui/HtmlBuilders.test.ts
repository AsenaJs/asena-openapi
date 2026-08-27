import { describe, expect, test } from 'bun:test';
import { buildScalarHtml, buildSwaggerHtml } from '../../lib/ui/HtmlBuilders';

describe('buildSwaggerHtml', () => {
  test('renders the Swagger UI page pointing at the spec', () => {
    const html = buildSwaggerHtml('My API', '/api/openapi');

    expect(html).toContain('<title>My API - API Docs</title>');
    expect(html).toContain('https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js');
    expect(html).toContain("url: '/api/openapi'");
    expect(html).toContain("dom_id: '#swagger-ui'");
    expect(html).toContain("layout: 'BaseLayout'");
  });

  test('spreads configuration over the SwaggerUIBundle defaults', () => {
    const html = buildSwaggerHtml('My API', '/api/openapi', { docExpansion: 'none' });

    expect(html).toContain('...{"docExpansion":"none"},');
    // defaults stay in place underneath the spread
    expect(html).toContain("url: '/api/openapi'");
    expect(html).toContain("layout: 'BaseLayout'");
  });

  test('escapes a configuration value that tries to close the script tag', () => {
    const html = buildSwaggerHtml('My API', '/api/openapi', { label: '</script><script>alert(1)</script>' });

    // the payload must not reach the document as markup — a raw `</script>` inside
    // the inline JSON would end the script block and hand the rest to the parser
    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('\\u003c');
  });

  test('HTML-escapes the page title', () => {
    const html = buildSwaggerHtml('<script>x</script>', '/api/openapi');

    expect(html).not.toContain('<title><script>');
    expect(html).toContain('<title>&lt;script&gt;');
  });
});

describe('buildScalarHtml', () => {
  test('renders the Scalar API Reference page pointing at the spec', () => {
    const html = buildScalarHtml('My API', '/api/openapi');

    expect(html).toContain('<title>My API - API Docs</title>');
    expect(html).toContain('https://cdn.jsdelivr.net/npm/@scalar/api-reference@1');
    expect(html).toContain('Scalar.createApiReference(\'#app\', {"url":"/api/openapi"});');
  });

  test('never names the mount point "api-reference", which the CDN bundle auto-mounts as an empty document', () => {
    const html = buildScalarHtml('My API', '/api/openapi');

    expect(html).not.toContain('id="api-reference"');
    expect(html).not.toContain("'#api-reference'");
  });

  test('merges configuration over the default url', () => {
    const html = buildScalarHtml('My API', '/api/openapi', { theme: 'purple' });

    expect(html).toContain('{"url":"/api/openapi","theme":"purple"}');
  });

  test('lets configuration override the spec url', () => {
    const html = buildScalarHtml('My API', '/api/openapi', { url: '/other-spec.json' });

    expect(html).toContain('{"url":"/other-spec.json"}');
  });

  test('escapes a configuration value that tries to close the script tag', () => {
    const html = buildScalarHtml('My API', '/api/openapi', { label: '</script><script>alert(1)</script>' });

    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('\\u003c');
  });

  test('HTML-escapes the page title', () => {
    const html = buildScalarHtml('<script>x</script>', '/api/openapi');

    expect(html).not.toContain('<title><script>');
    expect(html).toContain('<title>&lt;script&gt;');
  });
});
