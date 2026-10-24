const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const mobileRuntime = fs.readFileSync(
  path.join(repoRoot, '手機apk', 'src', 'mobile-runtime.js'),
  'utf8'
);

async function availablePort() {
  const listener = http.createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function startServer(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

test('TDX background acquisition stops after inactivity and resumes on foreground activity', async () => {
  const port = await availablePort();
  const tdxCalls = [];
  const slowTdxCalls = [];
  const mockTdx = http.createServer((request, response) => {
    if (request.url === '/token') {
      request.resume();
      request.on('end', () => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ access_token: 'activity-test-token', expires_in: 900 }));
      });
      return;
    }
    tdxCalls.push(request.url);
    if (!request.url.includes('/v2/Bike/Station/City/Tainan')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('[]');
      return;
    }
    slowTdxCalls.push(request.url);
    response.on('close', () => {
      if (!response.writableEnded) slowTdxCalls.aborted = true;
    });
    setTimeout(() => {
      if (!response.destroyed) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end('[]');
      }
    }, 3_000);
  });
  const mockTdxPort = await startServer(mockTdx);
  const tempId = `${process.pid}-${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      SKIP_ENV_FILE: 'true',
      TDX_FETCH_ENABLED: 'true',
      TDX_USER_IDLE_TIMEOUT_MS: '1000',
      TDX_REFRESH_INTERVAL_MS: '1000',
      TDX_DYNAMIC_REFRESH_INTERVAL_MS: '12000',
      TDX_STATIC_REFRESH_INTERVAL_MS: '12000',
      TDX_CLIENT_ID: 'activity-test',
      TDX_CLIENT_SECRET: 'activity-test-secret',
      TDX_API_ROOT: `http://127.0.0.1:${mockTdxPort}/api/basic`,
      TDX_TOKEN_ENDPOINT: `http://127.0.0.1:${mockTdxPort}/token`,
      TDX_REQUEST_SPACING_MS: '1',
      PORTAL_CONTENT_FILE: path.join(os.tmpdir(), `tdx-activity-content-${tempId}.json`),
      BUS_REALTIME_CACHE_FILE: path.join(os.tmpdir(), `tdx-activity-buses-${tempId}.json`),
      JOURNEY_GRAPH_CACHE_FILE: path.join(os.tmpdir(), `tdx-activity-journeys-${tempId}.json`)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;

  const waitForServer = async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(`${baseUrl}/api/status`);
        if (response.ok) return response.json();
      } catch (error) {
        // The server is still starting up.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Server did not start in time.\n${output}`);
  };

  try {
    const initialStatus = await waitForServer();
    assert.equal(initialStatus.tdxFetchingEnabled, true);
    assert.equal(initialStatus.tdxAcquisitionActive, false);

    await new Promise((resolve) => setTimeout(resolve, 1_300));
    assert.deepEqual(tdxCalls, []);
    const stillIdleStatus = await (await fetch(`${baseUrl}/api/status`)).json();
    assert.equal(stillIdleStatus.tdxAcquisitionActive, false);

    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    const enteredStatus = await (await fetch(`${baseUrl}/api/status`)).json();
    assert.equal(enteredStatus.tdxAcquisitionActive, true);
    assert.ok(enteredStatus.tdxLastUserActivityAt);

    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const idleStatus = await (await fetch(`${baseUrl}/api/status`)).json();
    assert.equal(idleStatus.tdxAcquisitionActive, false);

    const activityResponse = await fetch(`${baseUrl}/api/activity`, { method: 'POST' });
    assert.equal(activityResponse.status, 200);
    const resumedStatus = await activityResponse.json();
    assert.equal(resumedStatus.tdxAcquisitionActive, true);
    assert.equal(resumedStatus.tdxUserIdleTimeoutSeconds, 1);

    const pendingTdxResponse = fetch(
      `${baseUrl}/api/tdx/bike?lat=22.997&lng=120.212&city=Tainan`
    );
    const failedWhenIdle = await pendingTdxResponse;
    assert.equal(failedWhenIdle.status, 200);
    const failedPayload = await failedWhenIdle.json();
    assert.equal(failedPayload.degraded, true);
    assert.equal(slowTdxCalls.length, 1);
    assert.equal(slowTdxCalls.aborted, true);

    assert.match(html, /event\.isTrusted\) reportTdxUserActivity\(\)/);
    assert.match(html, /\/api\/activity/);
    assert.match(html, /input\.url \|\| input\.href/);
    assert.match(html, /tdxUserActivityPromise\.then\(\(\) => fetchWithActivityOrdering\(input, options\)\)/);
    assert.match(mobileRuntime, /App\.addListener\('appStateChange', \(\{ isActive \}\) => \{\s*appIsActive = isActive;\s*if \(isActive\) \{\s*window\.__reportTdxUserActivity\?\.\(true\)/);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await new Promise((resolve) => mockTdx.close(resolve));
  }
});
