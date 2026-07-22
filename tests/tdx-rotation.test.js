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
  const calls = {
    first429: 0, second429: 0, secondSuccess: 0,
    parkingLot: 0, parkingAvailability: 0, disabledParking: 0,
    detailFirst429: 0, detailSecondSuccess: 0,
    generalCredentialOnBusDetail: 0, reservedCredentialOnGeneralRequest: 0
  };
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
    const isBusDetailRequest = request.url.includes('/v2/Bus/StopOfRoute/City/Taipei/307')
      || request.url.includes('/v2/Bus/EstimatedTimeOfArrival/City/Taipei/307');
    if (isBusDetailRequest && ['Bearer first-token', 'Bearer second-token'].includes(authorization)) {
      calls.generalCredentialOnBusDetail += 1;
    }
    if (!isBusDetailRequest && ['Bearer detail-first-token', 'Bearer detail-second-token'].includes(authorization)) {
      calls.reservedCredentialOnGeneralRequest += 1;
    }
    if (authorization === 'Bearer detail-first-token') {
      calls.detailFirst429 += 1;
      response.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      response.end(JSON.stringify({ message: 'reserved detail credential limited' }));
      return;
    }
    if (authorization === 'Bearer detail-second-token') {
      calls.detailSecondSuccess += 1;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      if (request.url.includes('/v2/Bus/StopOfRoute/City/Taipei/307')) {
        response.end(JSON.stringify([{
          RouteUID: 'R307',
          RouteName: { Zh_tw: '307' },
          Direction: 0,
          Stops: [
            {
              StopUID: 'S003', StopName: { Zh_tw: '第三站' }, StopSequence: 3,
              StopPosition: { PositionLat: 25.0432, PositionLon: 121.5756 }
            },
            {
              StopUID: 'S001', StopName: { Zh_tw: '第一站' }, StopSequence: 1,
              StopPosition: { PositionLat: 25.0332, PositionLon: 121.5656 }
            },
            {
              StopUID: 'S002', StopName: { Zh_tw: '第二站' }, StopSequence: 2,
              StopPosition: { PositionLat: 25.0382, PositionLon: 121.5706 }
            }
          ]
        }, {
          RouteUID: 'R307-RETURN', RouteName: { Zh_tw: '307' }, Direction: 1,
          Stops: [{
            StopUID: 'S101', StopName: { Zh_tw: '返程站' }, StopSequence: 1,
            StopPosition: { PositionLat: 25.0432, PositionLon: 121.5756 }
          }]
        }]));
        return;
      }
      response.end(JSON.stringify([{
        StopUID: 'S001',
        RouteName: { Zh_tw: '307' },
        Direction: 0,
        PlateNumb: 'TEST-001',
        EstimateTime: 120
      }]));
      return;
    }
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
      if (request.url.includes('/v1/Parking/OffStreet/CarPark/City/Taipei')) {
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
      if (request.url.includes('/v1/Parking/OffStreet/CarPark/City/NewTaipei')) {
        calls.disabledParking += 1;
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
    TDX_CLIENT_ID_3: 'detail-first',
    TDX_CLIENT_SECRET_3: 'detail-first-secret',
    TDX_CLIENT_ID_4: 'detail-second',
    TDX_CLIENT_SECRET_4: 'detail-second-secret',
    TDX_CREDENTIALS_JSON: '[]',
    CWA_API_KEY: 'test-cwa-key',
    CWA_FETCH_ENABLED: 'true',
    DATA_GOV_FETCH_ENABLED: 'true',
    TDX_REFRESH_INTERVAL_MS: '5000',
    BUS_REFRESH_INTERVAL_MS: '12000',
    TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS: '300000',
    TDX_REQUEST_SPACING_MS: '1',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: '7766'
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  try {
    const expectedGeneralAvailable = allRateLimited ? 0 : 1;
    const status = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${appPort}/api/status`);
      const payload = await response.json();
      return payload.credentials.tdxGeneralAvailableCredentialCount === expectedGeneralAvailable ? payload : null;
    });
    const stopResponse = await fetch(
      `http://127.0.0.1:${appPort}/api/tdx/bus-stops?lat=25.033&lng=121.5654&city=Taipei`
    );
    const stopPayload = await stopResponse.json();
    const parkingResponse = await fetch(
      `http://127.0.0.1:${appPort}/api/tdx/parking?lat=25.033&lng=121.5654&city=Taipei&radius=5000`
    );
    const parkingPayload = await parkingResponse.json();
    let busDetailResponse = null;
    let busDetailPayload = null;
    let kinmenParkingResponse = null;
    let matsuParkingResponse = null;
    if (!allRateLimited) {
      kinmenParkingResponse = await fetch(
        `http://127.0.0.1:${appPort}/api/tdx/parking?lat=24.432&lng=118.318&city=Kinmen&radius=5000`
      );
      matsuParkingResponse = await fetch(
        `http://127.0.0.1:${appPort}/api/tdx/parking?lat=26.160&lng=119.930&city=Matsu&radius=5000`
      );
      busDetailResponse = await fetch(
        `http://127.0.0.1:${appPort}/api/tdx/bus-details?lat=25.033&lng=121.5654&city=Taipei&routeName=307&plateNumber=TEST-001&direction=0&currentStopUid=S001`
      );
      busDetailPayload = await busDetailResponse.json();
    }
    let admin = null;
    if (!allRateLimited) {
      const unauthorizedStatusResponse = await fetch(`http://127.0.0.1:${appPort}/api/admin/status`);
      const wrongLoginResponse = await fetch(`http://127.0.0.1:${appPort}/api/admin/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong' })
      });
      const loginResponse = await fetch(`http://127.0.0.1:${appPort}/api/admin/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: '7766' })
      });
      const loginPayload = await loginResponse.json();
      const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
      const disableResponse = await fetch(`http://127.0.0.1:${appPort}/api/admin/tdx`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ enabled: false })
      });
      const disablePayload = await disableResponse.json();
      const disabledParkingResponse = await fetch(
        `http://127.0.0.1:${appPort}/api/tdx/parking?lat=25.016&lng=121.462&city=NewTaipei&radius=5000`
      );
      const disabledParkingPayload = await disabledParkingResponse.json();
      const enableResponse = await fetch(`http://127.0.0.1:${appPort}/api/admin/tdx`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ enabled: true })
      });
      const enablePayload = await enableResponse.json();
      const disableCwaResponse = await fetch(`http://127.0.0.1:${appPort}/api/admin/cwa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ enabled: false })
      });
      const disableCwaPayload = await disableCwaResponse.json();
      const disabledWeatherResponse = await fetch(
        `http://127.0.0.1:${appPort}/api/weather?city=Taipei&district=Xinyi&lat=25.033&lng=121.5654`
      );
      const disabledWeatherPayload = await disabledWeatherResponse.json();
      const enableCwaResponse = await fetch(`http://127.0.0.1:${appPort}/api/admin/cwa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ enabled: true })
      });
      const enableCwaPayload = await enableCwaResponse.json();
      const disableDataGovResponse = await fetch(`http://127.0.0.1:${appPort}/api/admin/data-gov`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ enabled: false })
      });
      const disableDataGovPayload = await disableDataGovResponse.json();
      const disabledReportsResponse = await fetch(
        `http://127.0.0.1:${appPort}/api/data-gov/reports?cityTid=22003`
      );
      const disabledReportsPayload = await disabledReportsResponse.json();
      const disabledDatasetSearchResponse = await fetch(`http://127.0.0.1:${appPort}/api/data-gov/datasets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      const disabledDatasetSearchPayload = await disabledDatasetSearchResponse.json();
      const enableDataGovResponse = await fetch(`http://127.0.0.1:${appPort}/api/admin/data-gov`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ enabled: true })
      });
      const enableDataGovPayload = await enableDataGovResponse.json();
      await fetch(`http://127.0.0.1:${appPort}/api/admin/logout`, {
        method: 'POST', headers: { Cookie: cookie }
      });
      const loggedOutStatusResponse = await fetch(`http://127.0.0.1:${appPort}/api/admin/status`, {
        headers: { Cookie: cookie }
      });
      admin = {
        unauthorizedStatus: unauthorizedStatusResponse.status,
        wrongLoginStatus: wrongLoginResponse.status,
        loginStatus: loginResponse.status,
        loginPayload,
        disablePayload,
        disabledParkingStatus: disabledParkingResponse.status,
        disabledParkingPayload,
        enablePayload,
        disableCwaPayload,
        disabledWeatherStatus: disabledWeatherResponse.status,
        disabledWeatherPayload,
        enableCwaPayload,
        disableDataGovPayload,
        disabledReportsStatus: disabledReportsResponse.status,
        disabledReportsPayload,
        disabledDatasetSearchStatus: disabledDatasetSearchResponse.status,
        disabledDatasetSearchPayload,
        enableDataGovPayload,
        loggedOutStatus: loggedOutStatusResponse.status
      };
    }
    return {
      calls, status, stopResponse, stopPayload, parkingResponse, parkingPayload,
      busDetailResponse, busDetailPayload, kinmenParkingResponse, matsuParkingResponse, admin
    };
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
  assert.equal(result.status.credentials.tdxCredentialCount, 4);
  assert.equal(result.status.credentials.tdxAvailableCredentialCount, 3);
  assert.equal(result.status.credentials.tdxGeneralCredentialCount, 2);
  assert.equal(result.status.credentials.tdxGeneralAvailableCredentialCount, 1);
  assert.equal(result.status.credentials.tdxReservedBusDetailCredentialCount, 2);
  assert.equal(result.status.credentials.tdxReservedBusDetailAvailableCredentialCount, 2);
  assert.equal(result.status.cwaFetchingEnabled, true);
  assert.equal(result.status.dataGovFetchingEnabled, true);
  assert.equal(result.status.busRefreshIntervalSeconds, 12);
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
  assert.equal(result.kinmenParkingResponse.status, 200);
  assert.equal(result.matsuParkingResponse.status, 200);
  assert.equal(result.busDetailResponse.status, 200);
  assert.equal(result.busDetailPayload.success, true);
  assert.equal(result.busDetailPayload.data.routes.length, 1);
  assert.equal(result.busDetailPayload.data.routes[0].routeName, '307');
  assert.deepEqual(result.busDetailPayload.data.routes[0].stops.map((stop) => stop.sequence), [1, 2, 3]);
  assert.ok(result.calls.detailFirst429 >= 1);
  assert.ok(result.calls.detailSecondSuccess >= 2);
  assert.equal(result.calls.generalCredentialOnBusDetail, 0);
  assert.equal(result.calls.reservedCredentialOnGeneralRequest, 0);
  assert.equal(result.admin.unauthorizedStatus, 401);
  assert.equal(result.admin.wrongLoginStatus, 401);
  assert.equal(result.admin.loginStatus, 200);
  assert.equal(result.admin.loginPayload.authenticated, true);
  assert.equal(result.admin.disablePayload.tdxFetchingEnabled, false);
  assert.equal(result.admin.disabledParkingStatus, 503);
  assert.equal(result.admin.disabledParkingPayload.message, '管理員已關閉運輸資訊');
  assert.equal(result.calls.disabledParking, 0);
  assert.equal(result.admin.enablePayload.tdxFetchingEnabled, true);
  assert.equal(result.admin.disableCwaPayload.cwaFetchingEnabled, false);
  assert.equal(result.admin.disabledWeatherStatus, 503);
  assert.equal(result.admin.disabledWeatherPayload.message, '管理員已關閉天氣資訊');
  assert.equal(result.admin.enableCwaPayload.cwaFetchingEnabled, true);
  assert.equal(result.admin.disableDataGovPayload.dataGovFetchingEnabled, false);
  assert.equal(result.admin.disabledReportsStatus, 503);
  assert.equal(result.admin.disabledReportsPayload.message, '管理員已關閉當地資訊');
  assert.equal(result.admin.disabledDatasetSearchStatus, 503);
  assert.equal(result.admin.disabledDatasetSearchPayload.message, '管理員已關閉當地資訊');
  assert.equal(result.admin.enableDataGovPayload.dataGovFetchingEnabled, true);
  assert.equal(result.admin.loggedOutStatus, 401);
});

test('the server reports the requested message only after every credential receives 429', async () => {
  const result = await runScenario({ allRateLimited: true });
  assert.equal(result.status.credentials.tdxAvailableCredentialCount, 2);
  assert.equal(result.status.credentials.tdxGeneralAvailableCredentialCount, 0);
  assert.equal(result.status.credentials.tdxReservedBusDetailAvailableCredentialCount, 2);
  assert.equal(result.stopPayload.degraded, true);
  assert.equal(result.stopPayload.message, '請求過多，請稍後再試');
  assert.equal(result.parkingPayload.degraded, true);
  assert.equal(result.parkingPayload.message, '請求過多，請稍後再試；目前暫無停車場即時資料');
  assert.ok(result.calls.first429 >= 1);
  assert.ok(result.calls.second429 >= 1);
  assert.equal(result.calls.reservedCredentialOnGeneralRequest, 0);
});
