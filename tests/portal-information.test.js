const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
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

function startApp(port, cwaPort, contentFile, fcmServiceAccount) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      SKIP_ENV_FILE: 'true',
      HOST: '127.0.0.1',
      PORT: String(port),
      CWA_API_KEY: 'test-key',
      CWA_DATASTORE_ROOT: `http://127.0.0.1:${cwaPort}/api/v1/rest/datastore`,
      CWA_EMERGENCY_DATASET_IDS: 'W-C0033-001,E-A0015-001',
      PORTAL_CONTENT_FILE: contentFile,
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'test-password',
      TDX_FETCH_ENABLED: 'false',
      FCM_SERVICE_ACCOUNT_JSON_BASE64: Buffer.from(JSON.stringify(fcmServiceAccount)).toString('base64'),
      FCM_TOKEN_ENDPOINT: `http://127.0.0.1:${cwaPort}/token`,
      FCM_API_ROOT: `http://127.0.0.1:${cwaPort}`,
      FCM_TOPIC: 'test-information-topic'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  return { child, output: () => output };
}

test('announcements persist and CWA emergencies are retained without duplicates', async () => {
  let cwaRequestCount = 0;
  const fcmMessages = [];
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  const fcmServiceAccount = {
    project_id: 'test-project',
    client_email: 'firebase-adminsdk@test-project.iam.gserviceaccount.com',
    private_key: privateKey
  };
  const cwa = http.createServer(async (request, response) => {
    if (request.url === '/token') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ access_token: 'test-fcm-token', expires_in: 3600 }));
      return;
    }
    if (request.url === '/v1/projects/test-project/messages:send') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      fcmMessages.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ name: `projects/test-project/messages/${fcmMessages.length}` }));
      return;
    }
    cwaRequestCount += 1;
    const isEarthquake = request.url.includes('E-A0015-001');
    const payload = isEarthquake ? {
      records: {
        Earthquake: [{
          EarthquakeNo: 12345,
          ReportContent: '8月4日臺灣南部發生有感地震',
          EarthquakeInfo: {
            OriginTime: '2026-08-04T20:00:00+08:00',
            Epicenter: { Location: '臺南市政府南方 10 公里' },
            EarthquakeMagnitude: { MagnitudeValue: 5.2 }
          }
        }]
      }
    } : {
      records: {
        record: [{
          identifier: 'typhoon-warning-1',
          datasetInfo: { datasetDescription: '颱風海上陸上警報', issueTime: '2026-08-04T19:30:00+08:00' },
          hazardConditions: { hazards: { hazard: [{ info: {
            phenomena: '颱風海上陸上警報',
            affectedAreas: { location: [{ locationName: '臺灣各地' }] }
          } }] } },
          contents: { content: { contentText: '中央氣象署發布颱風海上陸上警報。' } }
        }]
      }
    };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
  });
  const cwaPort = await listen(cwa);
  const appPort = await availablePort();
  const contentFile = path.join(os.tmpdir(), `portal-content-${process.pid}-${appPort}.json`);
  const baseUrl = `http://127.0.0.1:${appPort}`;
  let app = startApp(appPort, cwaPort, contentFile, fcmServiceAccount);

  try {
    const initial = await waitFor(async () => {
      const response = await fetch(`${baseUrl}/api/information`);
      if (!response.ok) return null;
      const payload = await response.json();
      return payload.data.emergencies.length === 2 ? payload : null;
    });
    assert.equal(initial.data.announcements.length, 0);
    assert.deepEqual(new Set(initial.data.emergencies.map((item) => item.category)), new Set(['地震', '颱風警報']));
    assert.equal(initial.fcmTopic, 'test-information-topic');
    await waitFor(() => fcmMessages.filter((entry) => entry.message?.data?.type === 'emergency').length === 2);

    const unauthorized = await fetch(`${baseUrl}/api/admin/announcements`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    assert.equal(unauthorized.status, 401);

    const login = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'test-password' })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const invalid = await fetch(`${baseUrl}/api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        title: '<script>alert(1)</script>', summary: '摘要', details: '內容',
        category: '系統公告', severity: '一般', publisher: '測試管理員'
      })
    });
    assert.equal(invalid.status, 400);

    const publish = await fetch(`${baseUrl}/api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        title: '服務維護公告', summary: '今晚進行短暫維護', details: '交通資料顯示可能短暫延遲。',
        category: '系統維護', severity: '重要', publisher: '台灣智慧生活'
      })
    });
    assert.equal(publish.status, 201);
    const publishedAnnouncement = await publish.json();
    assert.equal(publishedAnnouncement.notificationQueued, true);
    assert.equal(publishedAnnouncement.notificationSent, true);
    assert.equal(publishedAnnouncement.notificationError, null);
    const fcmStatus = await (await fetch(`${baseUrl}/api/admin/status`, {
      headers: { Accept: 'application/json', Cookie: cookie }
    })).json();
    assert.equal(fcmStatus.fcmProjectId, 'test-project');
    assert.equal(fcmStatus.lastFcmNotification.sent, true);
    assert.equal(fcmStatus.lastFcmNotification.type, 'announcement');
    await waitFor(() => fcmMessages.some((entry) => (
      entry.message?.data?.type === 'announcement'
      && entry.message?.notification?.title === '服務維護公告'
      && entry.message?.topic === 'test-information-topic'
    )));

    const secondPublish = await fetch(`${baseUrl}/api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        title: '第二則公告', summary: '測試自訂公告順序', details: '發布後預設顯示在最前面。',
        category: '系統公告', severity: '一般', publisher: '台灣智慧生活'
      })
    });
    assert.equal(secondPublish.status, 201);
    const secondAnnouncement = await secondPublish.json();
    const afterPublish = await (await fetch(`${baseUrl}/api/information`)).json();
    assert.deepEqual(afterPublish.data.announcements.map((item) => item.title), ['第二則公告', '服務維護公告']);

    const reorder = await fetch(`${baseUrl}/api/admin/announcements/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ ids: [publishedAnnouncement.data.id, secondAnnouncement.data.id] })
    });
    assert.equal(reorder.status, 200);
    assert.deepEqual((await reorder.json()).announcements.map((item) => item.title), ['服務維護公告', '第二則公告']);

    const remove = await fetch(`${baseUrl}/api/admin/announcements/${secondAnnouncement.data.id}`, {
      method: 'DELETE', headers: { Accept: 'application/json', Cookie: cookie }
    });
    assert.equal(remove.status, 200);
    assert.deepEqual((await remove.json()).announcements.map((item) => item.title), ['服務維護公告']);

    for (const [endpoint, enabled] of [['tdx', true], ['cwa', false], ['data-gov', false]]) {
      const setting = await fetch(`${baseUrl}/api/admin/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ enabled })
      });
      assert.equal(setting.status, 200);
    }

    await stopChild(app.child);
    const cwaRequestsBeforeRestart = cwaRequestCount;
    app = startApp(appPort, cwaPort, contentFile, fcmServiceAccount);
    const afterRestart = await waitFor(async () => {
      const response = await fetch(`${baseUrl}/api/information`);
      return response.ok ? response.json() : null;
    });
    const final = await (await fetch(`${baseUrl}/api/information`)).json();
    assert.equal(afterRestart.data.announcements[0].title, '服務維護公告');
    assert.equal(final.data.emergencies.length, 2);
    assert.equal(cwaRequestCount, cwaRequestsBeforeRestart);

    const restartLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'test-password' })
    });
    const restartStatus = await restartLogin.json();
    assert.equal(restartStatus.tdxFetchingEnabled, true);
    assert.equal(restartStatus.cwaFetchingEnabled, false);
    assert.equal(restartStatus.dataGovFetchingEnabled, false);
    assert.deepEqual(restartStatus.announcements.map((item) => item.title), ['服務維護公告']);

    const persisted = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
    assert.equal(persisted.announcements.length, 1);
    assert.equal(persisted.settings.tdxFetchingEnabled, true);
    assert.equal(persisted.settings.cwaFetchingEnabled, false);
    assert.equal(persisted.settings.dataGovFetchingEnabled, false);
  } catch (error) {
    error.message += `\nServer output:\n${app.output()}`;
    throw error;
  } finally {
    await stopChild(app.child);
    await new Promise((resolve) => cwa.close(resolve));
    fs.rmSync(contentFile, { force: true });
  }
});
