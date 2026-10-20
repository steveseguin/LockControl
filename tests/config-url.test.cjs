const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// Run the actual inline application with an inert DOM and no network access.
const html = fs.readFileSync(path.join(__dirname, '..', 'lockcontrol.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];

for (const baseUrl of ['https://configured-ha.invalid', 'http://192.0.2.10:8123']) {
  test(`Home Assistant requests use configured URL ${baseUrl}`, () => {
    const requests = [];
    const elements = new Map();
    const context = {
      config: { HA_URL: baseUrl, HA_TOKEN: 'synthetic-test-marker' },
      window: { location: { search: '' } },
      document: {
        getElementById(id) {
          if (!elements.has(id)) {
            elements.set(id, { style: {}, classList: { add() {}, remove() {} } });
          }
          return elements.get(id);
        }
      },
      console: { log() {}, error() {} },
      setInterval() { return 1; },
      clearInterval() {},
      setTimeout() {},
      fetch(url, options) {
        requests.push({ url, options });
        // Do not resolve or perform any real network/device operation.
        return new Promise(() => {});
      }
    };
    vm.runInNewContext(source, context, { timeout: 1000 });
    assert.equal(requests.length, 7, 'initial status, timer and information requests');
    vm.runInNewContext("callService('switch.turn_on', { entity_id: 'test.entity' })", context);
    assert.equal(requests.length, 8);
    assert.equal(requests.at(-1).options.method, 'POST');
    for (const request of requests) {
      assert.ok(request.url.startsWith(`${baseUrl}/api/`), request.url);
      assert.equal(request.options.headers.Authorization, 'Bearer synthetic-test-marker');
    }
  });
}
