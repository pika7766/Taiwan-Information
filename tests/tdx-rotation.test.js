const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function availablePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError || new Error('Timed out waiting for condition');
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
}

function tdxPayloadFor(requestUrl, credentialName) {
  if (requestUrl.includes('/v1/Parking/OffStreet/CarPark/City/Taipei')) {
    return [{
      CarParkID: `P-${credentialName}`,
      CarParkName: { Zh_tw: `${credentialName}停車場` },
      CarParkPosition: { PositionLat: 25.0332, PositionLon: 121.5656 },
      TotalSpaces: 50
    }];
  }
  if (requestUrl.includes('/v1/Parking/OffStreet/ParkingAvailability/City/Taipei')) {
    return [{
      CarParkID: `P-${credentialName}`,
      TotalSpaces: 50,
      AvailableSpaces: 17,
      ServiceStatus: 1,
      DataCollectTime: '2026-08-03T12:00:00+08:00'
    }];
  }
  if (requestUrl.includes('/v2/Bus/StopOfRoute/City/Taipei/307')) {
    return [{
      RouteUID: 'R307', RouteName: { Zh_tw: '307' }, Direction: 0,
      Stops: [
        {
          StopUID: 'S001', StopName: { Zh_tw: '第一站' }, StopSequence: 1,
          StopPosition: { PositionLat: 25.0332, PositionLon: 121.5656 }
        },
        {
          StopUID: 'S002', StopName: { Zh_tw: '第二站' }, StopSequence: 2,
          StopPosition: { PositionLat: 25.0382, PositionLon: 121.5706 }
        }
      ]
    }];
  }
  if (requestUrl.includes('/v2/Bus/EstimatedTimeOfArrival/City/Taipei/307')) {
    return [{
      StopUID: 'S001', RouteName: { Zh_tw: '307' }, Direction: 0,
      PlateNumb: 'TEST-001', EstimateTime: 120
    }];
  }
  return [];
}

async function runScenario({ credentialId = 'single', limited = [], unavailable = [] } = {}) {
  const limitedSet = new Set(limited);
  const unavailableSet = new Set(unavailable);
  const calls = [];
  const mock = http.createServer((request, response) => {
    if (request.url === '/token') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const clientId = new URLSearchParams(body).get('client_id');
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ access_token: `${clientId}-token`, expires_in: 900 }));
      });
      return;
    }
    const token = String(request.headers.authorization || '').replace(/^Bearer /, '');
    const credentialName = token.replace(/-token$/, '');
    calls.push({ credentialName, url: request.url });
    if (limitedSet.has(credentialName)) {
      response.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      response.end(JSON.stringify({ message: `${credentialName} limited` }));
      return;
    }
    if (unavailableSet.has(credentialName)) {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message: `${credentialName} unavailable` }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(tdxPayloadFor(request.url, credentialName)));
  });

  const mockPort = await listen(mock);
  const appPort = await availablePort();
  const cacheFile = path.join(os.tmpdir(), `tdx-rotation-${process.pid}-${appPort}.json`);
  const graphCacheFile = path.join(os.tmpdir(), `tdx-graph-${process.pid}-${appPort}.json`);
  const cleanEnvironment = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !/^TDX_CLIENT_(?:ID|SECRET)(?:_\d+)?$/.test(name)
      && !/^TDX_SHARED_CLIENT_(?:ID|SECRET)$/.test(name)
      && name !== 'TDX_CREDENTIALS_JSON'));
  const env = {
    ...cleanEnvironment,
    SKIP_ENV_FILE: 'true',
    TDX_CLIENT_ID: credentialId,
    TDX_CLIENT_SECRET: `${credentialId}-secret`,
    HOST: '127.0.0.1',
    PORT: String(appPort),
    BUS_REALTIME_CACHE_FILE: cacheFile,
    JOURNEY_GRAPH_CACHE_FILE: graphCacheFile,
    TDX_API_ROOT: `http://127.0.0.1:${mockPort}/api/basic`,
    TDX_TOKEN_ENDPOINT: `http://127.0.0.1:${mockPort}/token`,
    TDX_REQUEST_SPACING_MS: '1',
    TDX_REFRESH_INTERVAL_MS: '5000',
    TDX_DYNAMIC_REFRESH_INTERVAL_MS: '12000',
    TDX_STATIC_REFRESH_INTERVAL_MS: '300000',
    CWA_API_KEY: 'test-cwa-key'
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  try {
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const initialStatus = await waitFor(async () => {
      const response = await fetch(`${baseUrl}/api/status`);
      return response.ok ? response.json() : null;
    });
    await fetch(`${baseUrl}/api/activity`, { method: 'POST' });
    const parkingResponse = await fetch(
      `${baseUrl}/api/tdx/parking?lat=25.033&lng=121.5654&city=Taipei&radius=5000`
    );
    const parking = await parkingResponse.json();
    const detailResponse = await fetch(
      `${baseUrl}/api/tdx/bus-details?lat=25.033&lng=121.5654&city=Taipei&routeName=307&plateNumber=TEST-001&direction=0&currentStopUid=S001`
    );
    const detail = await detailResponse.json();
    const finalStatus = await (await fetch(`${baseUrl}/api/status`)).json();
    return { calls, initialStatus, parkingResponse, parking, detailResponse, detail, finalStatus };
  } catch (error) {
    error.message += `\nServer output:\n${output}`;
    throw error;
  } finally {
    await stopChild(child);
    await new Promise((resolve) => mock.close(resolve));
    fs.rmSync(cacheFile, { force: true });
    fs.rmSync(graphCacheFile, { force: true });
  }
}

test('single TDX credential handles all supported data types', async () => {
  const result = await runScenario();
  assert.equal(result.initialStatus.credentials.tdxPrimaryCredentialCount, 1);
  assert.equal(result.initialStatus.credentials.tdxReserveCredentialCount, 0);
  assert.equal(result.parkingResponse.status, 200);
  assert.equal(result.parking.data[0].parkingId, 'P-single');
  assert.equal(result.detailResponse.status, 200);
  assert.equal(result.detail.data.routes[0].routeName, '307');
  assert.ok(result.calls.every((call) => call.credentialName === 'single'));
  assert.equal(result.calls.filter((call) => call.credentialName === 'reserve').length, 0);
});

test('single TDX credential rate limit returns Chinese degraded parking response', async () => {
  const result = await runScenario({ limited: ['single'] });
  assert.equal(result.parkingResponse.status, 200);
  assert.equal(result.parking.degraded, true);
  assert.equal(result.parking.message, '請求過多，請稍後再試；目前暫無停車場即時資料');
  assert.equal(result.detailResponse.status, 429);
  assert.equal(result.detail.message, '請求過多，請稍後再試');
  assert.equal(result.finalStatus.credentials.tdxPrimaryCredentialCount, 1);
  assert.equal(result.finalStatus.credentials.tdxReserveCredentialCount, 0);
});

test('single TDX credential unavailable returns upstream failure', async () => {
  const result = await runScenario({ unavailable: ['single'] });
  assert.equal(result.parkingResponse.status, 502);
  assert.match(result.parking.message, /503|Service Unavailable/);
  assert.equal(result.detailResponse.status, 502);
  assert.match(result.detail.message, /503|Service Unavailable/);
  assert.ok(result.calls.some((call) => call.credentialName === 'single'));
});
