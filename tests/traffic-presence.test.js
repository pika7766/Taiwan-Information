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

async function waitFor(check, timeoutMs = 20_000) {
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
  throw lastError || new Error('Timed out waiting for the portal server');
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
}

test('TDX live traffic is merged, proximity-filtered, and available to active sessions', async () => {
  const tdxPaths = [];
  const tdxAuthorizationHeaders = [];
  const trafficPayloads = {
    sections: [
      { SectionID: 'near-section', RoadName: '測試道路', SectionName: '測試路段' },
      { SectionID: 'far-section', RoadName: '遠方道路', SectionName: '遠方路段' }
    ],
    shapes: [
      { SectionID: 'near-section', Geometry: 'LINESTRING (121.54 25.0336, 121.58 25.0336)' },
      { SectionID: 'far-section', Geometry: 'LINESTRING (121.60 25.0336, 121.61 25.0336)' }
    ],
    live: [
      {
        SectionID: 'near-section', CongestionLevel: 3, TravelSpeed: 18,
        DataCollectTime: '2026-10-23T11:00:00+08:00'
      },
      { SectionID: 'far-section', CongestionLevel: 1, TravelSpeed: 48 }
    ]
  };
  const neighboringCityTraffic = {
    sections: [{ SectionID: 'neighbor-section', RoadName: '跨縣市測試道路', SectionName: '鄰近縣市路段' }],
    shapes: [{
      SectionID: 'neighbor-section',
      Geometry: 'LINESTRING (121.90 25.0336, 121.91 25.0336)'
    }],
    live: [{ SectionID: 'neighbor-section', CongestionLevel: 2, TravelSpeed: 32 }]
  };
  const tdxMock = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const city = pathname.split('/').at(-1);
    if (pathname !== '/token') {
      tdxPaths.push(pathname);
      tdxAuthorizationHeaders.push(request.headers.authorization);
    }
    let payload = [];
    if (pathname === '/token') {
      payload = { access_token: 'test-tdx-token', expires_in: 3600 };
    } else if (pathname.includes('/v2/Road/Traffic/Section/City/')) {
      payload = city === 'Taipei' ? trafficPayloads.sections
        : city === 'NewTaipei' ? neighboringCityTraffic.sections : [];
    } else if (pathname.includes('/v2/Road/Traffic/SectionShape/City/')) {
      payload = city === 'Taipei' ? trafficPayloads.shapes
        : city === 'NewTaipei' ? neighboringCityTraffic.shapes : [];
    } else if (pathname.includes('/v2/Road/Traffic/Live/City/')) {
      payload = city === 'Taipei' ? trafficPayloads.live
        : city === 'NewTaipei' ? neighboringCityTraffic.live : [];
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
  });
  const mockPort = await listen(tdxMock);
  const appPort = await availablePort();
  const cacheFile = path.join(os.tmpdir(), `traffic-presence-${process.pid}-${appPort}.json`);
  const graphCacheFile = path.join(os.tmpdir(), `traffic-graph-${process.pid}-${appPort}.json`);
  const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^TDX_CLIENT_(?:ID|SECRET)(?:_\d+)?$/.test(name)
    && !/^TDX_SHARED_CLIENT_(?:ID|SECRET)$/.test(name)
    && !['PORT', 'HOST', 'TDX_API_ROOT', 'TDX_TOKEN_ENDPOINT', 'TDX_FETCH_ENABLED',
    'TDX_REFRESH_INTERVAL_MS', 'TDX_DYNAMIC_REFRESH_INTERVAL_MS',
    'TDX_MOBILITY_REFRESH_INTERVAL_MS', 'TDX_STATIC_REFRESH_INTERVAL_MS',
    'BUS_REALTIME_CACHE_FILE', 'JOURNEY_GRAPH_CACHE_FILE'].includes(name)));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...cleanEnvironment,
      SKIP_ENV_FILE: 'true',
      HOST: '127.0.0.1',
      PORT: String(appPort),
      TDX_CLIENT_ID: 'traffic-test-client',
      TDX_CLIENT_SECRET: 'traffic-test-secret',
      TDX_API_ROOT: `http://127.0.0.1:${mockPort}/api/basic`,
      TDX_TOKEN_ENDPOINT: `http://127.0.0.1:${mockPort}/token`,
      TDX_REQUEST_SPACING_MS: '1',
      TDX_REFRESH_INTERVAL_MS: '12000',
      TDX_DYNAMIC_REFRESH_INTERVAL_MS: '12000',
      TDX_MOBILITY_REFRESH_INTERVAL_MS: '1800000',
      TDX_STATIC_REFRESH_INTERVAL_MS: '86400000',
      BUS_REALTIME_CACHE_FILE: cacheFile,
      JOURNEY_GRAPH_CACHE_FILE: graphCacheFile
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  try {
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const status = await waitFor(async () => {
      const response = await fetch(`${baseUrl}/api/status`);
      return response.ok ? response.json() : null;
    });
    assert.equal(status.tdxStaticRefreshIntervalSeconds, 86_400);
    assert.equal(status.tdxTrafficBikeRefreshIntervalSeconds, 1_800);
    assert.equal(status.tdxParkingRefreshIntervalSeconds, 1_800);
    assert.equal(status.tdxIdleTimeoutSeconds, 300);
    assert.deepEqual(tdxPaths, [], 'server startup must not fetch TDX data without a user request');

    const trafficResponse = await fetch(
      `${baseUrl}/api/tdx/traffic?lat=25.0336&lng=121.5648&city=Taipei&radius=1000`
    );
    const traffic = await trafficResponse.json();
    assert.equal(trafficResponse.status, 200, output);
    assert.equal(traffic.success, true);
    assert.equal(traffic.data.roads.length, 1);
    assert.equal(traffic.data.roads[0].sectionId, 'near-section');
    assert.equal(traffic.data.roads[0].status, 'congested');
    assert.equal(traffic.data.roads[0].speed, 18);
    assert.deepEqual(traffic.data.roads[0].lines, [[[25.0336, 121.54], [25.0336, 121.58]]]);
    assert.ok(traffic.data.cities.includes('NewTaipei'));
    const expandedTrafficResponse = await fetch(
      `${baseUrl}/api/tdx/traffic?lat=25.0336&lng=121.5648&city=Taipei&radius=100000`
    );
    const expandedTraffic = await expandedTrafficResponse.json();
    assert.equal(expandedTrafficResponse.status, 200, output);
    assert.ok(expandedTraffic.data.roads.some((road) => road.sectionId === 'neighbor-section'),
      'traffic coverage should include adjacent-city roads beyond the old 30 km cap');
    assert.ok(tdxPaths.includes('/api/basic/v2/Road/Traffic/SectionShape/City/NewTaipei'));
    assert.ok(tdxAuthorizationHeaders.includes('Bearer test-tdx-token'));
    for (const pathName of [
      '/api/basic/v2/Road/Traffic/Section/City/Taipei',
      '/api/basic/v2/Road/Traffic/SectionShape/City/Taipei',
      '/api/basic/v2/Road/Traffic/Live/City/Taipei'
    ]) {
      assert.ok(tdxPaths.includes(pathName), `TDX endpoint was not requested: ${pathName}`);
    }

    const sessionId = 'b4c02e83-5ec8-4612-b6d1-458bcb1f7985';
    const heartbeat = (body) => fetch(`${baseUrl}/api/presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: baseUrl,
        'X-Forwarded-For': '203.0.113.7'
      },
      body: JSON.stringify(body)
    });
    const activeResponse = await heartbeat({ sessionId, active: true });
    assert.equal(activeResponse.status, 200);
    assert.deepEqual(await activeResponse.json(), { success: true });
    assert.match(output, /\[active-visitors\].*sessions=0 ips=\[\]/);
    const invalidResponse = await heartbeat({ sessionId: 'not-a-session' });
    assert.equal(invalidResponse.status, 400);
    const crossOriginResponse = await fetch(`${baseUrl}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://third-party.example' },
      body: JSON.stringify({ sessionId, active: true })
    });
    assert.equal(crossOriginResponse.status, 403);
    const inactiveResponse = await heartbeat({ sessionId, active: false });
    assert.equal(inactiveResponse.status, 200);

    const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.match(indexHtml, /key: 'traffic', label: '即時路況'/);
    assert.match(indexHtml, /L\.polyline\(line/);
    assert.doesNotMatch(indexHtml, /handleTrafficLayerDisabled|即時路況功能目前暫不開放/);
  } finally {
    await stopChild(child);
    tdxMock.closeAllConnections?.();
    await new Promise((resolve) => tdxMock.close(resolve));
    fs.rmSync(cacheFile, { force: true });
    fs.rmSync(graphCacheFile, { force: true });
  }
});
