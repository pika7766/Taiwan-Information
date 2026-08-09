const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function main() {
  const calls = [];
  const mock = http.createServer((request, response) => {
    calls.push(request.url);
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
    response.writeHead(200, { 'Content-Type': 'application/json' });
    if (request.url.includes('/v1/Parking/OffStreet/CarPark/City/Taipei')) {
      response.end(JSON.stringify([{ CarParkID: 'P-1', CarParkName: { Zh_tw: '停車場' }, CarParkPosition: { PositionLat: 25.0332, PositionLon: 121.5656 }, TotalSpaces: 50 }]));
      return;
    }
    if (request.url.includes('/v1/Parking/OffStreet/ParkingAvailability/City/Taipei')) {
      response.end(JSON.stringify([{ CarParkID: 'P-1', AvailableSpaces: 17, ServiceStatus: 1, DataCollectTime: '2026-08-03T12:00:00+08:00' }]));
      return;
    }
    response.end(JSON.stringify([]));
  });

  const mockPort = await listen(mock);
  const appPort = 4124;
  const cacheFile = path.join(os.tmpdir(), `parking-debug-${process.pid}.json`);
  const graphCacheFile = path.join(os.tmpdir(), `parking-graph-debug-${process.pid}.json`);
  const env = {
    ...process.env,
    SKIP_ENV_FILE: 'true',
    HOST: '127.0.0.1',
    PORT: String(appPort),
    BUS_REALTIME_CACHE_FILE: cacheFile,
    JOURNEY_GRAPH_CACHE_FILE: graphCacheFile,
    TDX_API_ROOT: `http://127.0.0.1:${mockPort}/api/basic`,
    TDX_TOKEN_ENDPOINT: `http://127.0.0.1:${mockPort}/token`,
    TDX_CLIENT_ID_1: 'fixed-first',
    TDX_CLIENT_SECRET_1: 'fixed-first-secret',
    TDX_REQUEST_SPACING_MS: '1',
    TDX_DYNAMIC_REFRESH_INTERVAL_MS: '1000',
    TDX_STATIC_REFRESH_INTERVAL_MS: '300000',
    CWA_API_KEY: 'test-cwa-key'
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname), env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  const waitForServer = async () => {
    for (let i = 0; i < 100; i += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${appPort}/api/status`);
        if (response.ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  await waitForServer();

  const parkingUrl = `http://127.0.0.1:${appPort}/api/tdx/parking?lat=25.033&lng=121.5654&city=Taipei&radius=5000`;
  const first = await fetch(parkingUrl);
  console.log('first status', first.status, await first.text());
  await new Promise((r) => setTimeout(r, 1_100));
  const second = await fetch(parkingUrl);
  console.log('second status', second.status, await second.text());
  console.log('calls', calls);
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 500));
  mock.close();
  fs.rmSync(cacheFile, { force: true });
  fs.rmSync(graphCacheFile, { force: true });
}

main().catch((error) => { console.error(error); process.exit(1); });
