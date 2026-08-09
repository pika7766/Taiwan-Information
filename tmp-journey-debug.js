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

    const authorization = request.headers.authorization;
    const payload = [];
    if (request.url.includes('/v3/Rail/TRA/Station')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify([{ StationID: '1000', StationName: { Zh_tw: '臺北' }, StationPosition: { PositionLat: 25.0478, PositionLon: 121.5170 }, Stops: [] }, { StationID: '1001', StationName: { Zh_tw: '板橋' }, StationPosition: { PositionLat: 25.0129, PositionLon: 121.4620 }, Stops: [] }]));
      return;
    }
    if (request.url.includes('/v3/Rail/TRA/DailyTrainTimetable/TrainDate/')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ TrainTimetables: [{ TrainNo: '101', TrainTypeName: { Zh_tw: '自強號' }, StopTimes: [{ StationID: '1000', ArrivalTime: '08:00', DepartureTime: '08:00' }, { StationID: '1001', ArrivalTime: '08:30', DepartureTime: '08:30' }] }] }));
      return;
    }
    if (request.url.includes('/v2/Rail/TRA/ODFare')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify([{ OriginStationID: '1000', DestinationStationID: '1001', Fares: [{ TicketType: '標準', Price: 40 }] }]));
      return;
    }
    if (request.url.includes('/v3/Rail/TRA/TrainLiveBoard')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify([{ TrainNo: '101', TrainStatus: 'OnTime', PositionLat: 25.0143, PositionLon: 121.4638, UpdateTime: '2026-08-03T12:00:00+08:00' }]));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
  });

  const mockPort = await listen(mock);
  const appPort = 4123;
  const cacheFile = path.join(os.tmpdir(), `journey-debug-${process.pid}.json`);
  const graphCacheFile = path.join(os.tmpdir(), `journey-graph-debug-${process.pid}.json`);
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
    TDX_STATIC_REFRESH_INTERVAL_MS: '3000',
    ROUTE_PLANNER_TIMEOUT_MS: '5000',
    JOURNEY_BOOKING_WINDOW_DAYS: '28'
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
    throw new Error('server did not start');
  };
  await waitForServer();

  const optionsResponse = await fetch(`http://127.0.0.1:${appPort}/api/tdx/journey/options?mode=tra`);
  console.log('options status', optionsResponse.status);
  const options = await optionsResponse.text();
  console.log(options.slice(0, 300));

  const futureDepartureParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(Date.now() + 30 * 60_000));
  const futureDeparture = Object.fromEntries(futureDepartureParts.map((part) => [part.type, part.value]));
  const departureTime = `${futureDeparture.year}-${futureDeparture.month}-${futureDeparture.day}T${futureDeparture.hour}:${futureDeparture.minute}`;
  const searchUrl = new URL(`http://127.0.0.1:${appPort}/api/tdx/journey/search`);
  searchUrl.search = new URLSearchParams({ mode: 'tra', originId: '1000', destinationId: '1001', departureTime });
  const searchResponse = await fetch(searchUrl);
  console.log('search status', searchResponse.status);
  console.log(await searchResponse.text());

  console.log('mock calls', calls.slice(0, 20));
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 500));
  mock.close();
  fs.rmSync(cacheFile, { force: true });
  fs.rmSync(graphCacheFile, { force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
