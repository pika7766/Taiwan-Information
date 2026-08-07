const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
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

function departureValue() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(Date.now() + 5 * 60_000)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

async function runScenario(limitedKeys) {
  const calls = [];
  const mock = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    const key = requestUrl.searchParams.get('key');
    calls.push({ key, points: requestUrl.searchParams.getAll('point'), profile: requestUrl.searchParams.get('profile') });
    if (limitedKeys.includes(key)) {
      response.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      response.end(JSON.stringify({ message: 'rate limited' }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      paths: [{
        distance: 12_000,
        time: 1_200_000,
        points: { type: 'LineString', coordinates: [[120.30, 23.09], [120.29, 22.62]] },
        instructions: [{
          text: '沿測試道路向南行駛', street_name: '測試道路', distance: 12_000,
          time: 1_200_000, interval: [0, 1]
        }]
      }]
    }));
  });
  const mockPort = await listen(mock);
  const appPort = await availablePort();
  const cleanEnvironment = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !/^GRAPHHOPPER_API_KEY(?:_\d+)?$/.test(name)
      && !/^TDX_CLIENT_(?:ID|SECRET)(?:_\d+)?$/.test(name)));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...cleanEnvironment,
      SKIP_ENV_FILE: 'true',
      HOST: '127.0.0.1',
      PORT: String(appPort),
      GRAPHHOPPER_API_ROOT: `http://127.0.0.1:${mockPort}/route`,
      GRAPHHOPPER_API_KEY_1: 'key-one',
      GRAPHHOPPER_API_KEY_2: 'key-two'
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
    const plannerUrl = new URL('/api/route/planner', baseUrl);
    plannerUrl.search = new URLSearchParams({
      originLat: '23.0923809', originLng: '120.3088807', originName: '大營郵局',
      destinationLat: '22.6195179', destinationLng: '120.2966363', destinationName: '高雄漢來大飯店',
      departureTime: departureValue(), modes: 'car'
    });
    const response = await fetch(plannerUrl);
    const payload = await response.json();
    return { calls, status, response, payload };
  } catch (error) {
    error.message += `\nServer output:\n${output}`;
    throw error;
  } finally {
    await stopChild(child);
    await new Promise((resolve) => mock.close(resolve));
  }
}

test('GraphHopper switches to the second server-side key when the first is limited', async () => {
  const result = await runScenario(['key-one']);
  assert.equal(result.status.credentials.graphHopperApiKeyCount, 2);
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.results[0].source, 'GraphHopper');
  assert.equal(result.payload.data.results[0].geometry.length, 2);
  assert.deepEqual(result.calls.map((call) => call.key), ['key-one', 'key-two']);
  assert.deepEqual(result.calls[0].points, ['23.0923809,120.3088807', '22.6195179,120.2966363']);
  assert.equal(result.calls[0].profile, 'car');
});

test('GraphHopper reports rate limiting only after both keys are limited', async () => {
  const result = await runScenario(['key-one', 'key-two']);
  assert.equal(result.response.status, 429);
  assert.equal(result.payload.message, '請求過多，請稍後再試');
  assert.deepEqual(result.calls.map((call) => call.key), ['key-one', 'key-two']);
});
