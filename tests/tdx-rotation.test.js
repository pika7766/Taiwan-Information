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

async function runScenario({ allRateLimited }) {
  const calls = { first429: 0, second429: 0, secondSuccess: 0, parkingLot: 0, parkingAvailability: 0 };
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

    const authorization = request.headers.authorization;
    if (authorization === 'Bearer first-token') {
      calls.first429 += 1;
      response.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      response.end(JSON.stringify({ message: 'first limited' }));
      return;
    }
    if (authorization === 'Bearer second-token' && allRateLimited) {
      calls.second429 += 1;
      response.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      response.end(JSON.stringify({ message: 'second limited' }));
      return;
    }
    if (authorization === 'Bearer second-token') {
      calls.secondSuccess += 1;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      if (request.url.includes('/v1/Parking/OffStreet/ParkingLot/City/Taipei')) {
        calls.parkingLot += 1;
        response.end(JSON.stringify([{
          CarParkID: 'P001',
          CarParkName: { Zh_tw: '測試停車場' },
          CarParkPosition: { PositionLat: 25.0332, PositionLon: 121.5656 },
          Address: '臺北市信義區測試路 1 號',
          Telephone: '02-12345678',
          FareDescription: { Zh_tw: '每小時 30 元' },
          ServiceTime: '24 小時',
          TotalSpaces: 50
        }]));
        return;
      }
      if (request.url.includes('/v1/Parking/OffStreet/ParkingAvailability/City/Taipei')) {
        calls.parkingAvailability += 1;
        response.end(JSON.stringify([{
          CarParkID: 'P001',
          TotalSpaces: 50,
          AvailableSpaces: 17,
          ServiceStatus: 1,
          DataCollectTime: '2026-07-22T12:00:00+08:00'
        }]));
        return;
      }
      response.end('[]');
      return;
    }
    response.writeHead(401, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: 'unknown token' }));
  });

  const mockPort = await listen(mock);
  const appPort = await availablePort();
  const cacheFile = path.join(os.tmpdir(), `tdx-rotation-${process.pid}-${appPort}.json`);
  const cleanEnvironment = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !/^TDX_CLIENT_(?:ID|SECRET)(?:_\d+)?$/.test(name) && name !== 'TDX_CREDENTIALS_JSON'));
  const env = {
    ...cleanEnvironment,
    SKIP_ENV_FILE: 'true',
    HOST: '127.0.0.1',
    PORT: String(appPort),
    BUS_REALTIME_CACHE_FILE: cacheFile,
    TDX_API_ROOT: `http://127.0.0.1:${mockPort}/api/basic`,
    TDX_TOKEN_ENDPOINT: `http://127.0.0.1:${mockPort}/token`,
    TDX_CLIENT_ID: 'first',
    TDX_CLIENT_SECRET: 'first-secret',
    TDX_CLIENT_ID_2: 'second',
    TDX_CLIENT_SECRET_2: 'second-secret',
    TDX_CREDENTIALS_JSON: '[]',
    TDX_REFRESH_INTERVAL_MS: '5000',
    TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS: '300000',
    TDX_REQUEST_SPACING_MS: '1'
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  try {
    const expectedAvailable = allRateLimited ? 0 : 1;
    const status = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${appPort}/api/status`);
      const payload = await response.json();
      return payload.credentials.tdxAvailableCredentialCount === expectedAvailable ? payload : null;
    });
    const stopResponse = await fetch(
      `http://127.0.0.1:${appPort}/api/tdx/bus-stops?lat=25.033&lng=121.5654&city=Taipei`
    );
    const stopPayload = await stopResponse.json();
    const parkingResponse = await fetch(
      `http://127.0.0.1:${appPort}/api/tdx/parking?lat=25.033&lng=121.5654&city=Taipei&radius=5000`
    );
    const parkingPayload = await parkingResponse.json();
    return { calls, status, stopResponse, stopPayload, parkingResponse, parkingPayload };
  } catch (error) {
    error.message += `\nServer output:\n${output}`;
    throw error;
  } finally {
    await stopChild(child);
    await new Promise((resolve) => mock.close(resolve));
    fs.rmSync(cacheFile, { force: true });
  }
}

test('TDX credentials rotate on 429 and report only aggregate status', async () => {
  const result = await runScenario({ allRateLimited: false });
  assert.equal(result.status.credentials.tdxCredentialCount, 2);
  assert.equal(result.status.credentials.tdxAvailableCredentialCount, 1);
  assert.equal(result.status.tdxRefreshIntervalSeconds, 5);
  assert.equal(result.status.tdxTrafficBikeRefreshIntervalSeconds, 300);
  assert.equal(result.status.tdxParkingRefreshIntervalSeconds, 300);
  assert.equal(result.stopResponse.status, 200);
  assert.equal(result.stopPayload.success, true);
  assert.ok(result.calls.first429 >= 1);
  assert.ok(result.calls.secondSuccess >= 1);
  assert.equal(result.parkingResponse.status, 200);
  assert.equal(result.parkingPayload.refreshIntervalSeconds, 300);
  assert.equal(result.parkingPayload.data[0].parkingId, 'P001');
  assert.equal(result.parkingPayload.data[0].parkingName, '測試停車場');
  assert.equal(result.parkingPayload.data[0].availableSpaces, 17);
  assert.equal(result.parkingPayload.data[0].totalSpaces, 50);
  assert.ok(result.parkingPayload.data[0].distanceMeters < 50);
  assert.equal(result.calls.parkingLot, 1);
  assert.equal(result.calls.parkingAvailability, 1);
});

test('the server reports the requested message only after every credential receives 429', async () => {
  const result = await runScenario({ allRateLimited: true });
  assert.equal(result.status.credentials.tdxAvailableCredentialCount, 0);
  assert.equal(result.stopPayload.degraded, true);
  assert.equal(result.stopPayload.message, '請求過多，請稍後再試');
  assert.equal(result.parkingPayload.degraded, true);
  assert.equal(result.parkingPayload.message, '請求過多，請稍後再試；目前暫無停車場即時資料');
  assert.ok(result.calls.first429 >= 1);
  assert.ok(result.calls.second429 >= 1);
});
