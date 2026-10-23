const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mobileHtml = fs.readFileSync(path.join(root, '手機apk', 'www', 'index.html'), 'utf8');
const mobileSyncScript = fs.readFileSync(path.join(root, '手機apk', 'scripts', 'sync-web.mjs'), 'utf8');

function extractFunctions(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing ${startMarker}`);
  assert.notEqual(end, -1, `Missing ${endMarker}`);
  return html.slice(start, end);
}

test('emergency city groups show local alerts with latest received first', () => {
  const source = extractFunctions(
    '    function emergencyReceivedTimestamp(',
    '    function renderEmergencyCityAlerts('
  );
  const context = {
    normalizePlaceName: (value = '') => value.trim().replaceAll('台', '臺')
  };
  vm.runInNewContext(source, context);
  const alerts = [
    {
      id: 'older',
      affectedCities: ['臺北市'],
      receivedAt: '2026-10-23T10:00:00.000Z'
    },
    {
      id: 'newest',
      affectedCities: ['臺北市', '花蓮縣'],
      receivedAt: '2026-10-23T12:00:00.000Z'
    },
    {
      id: 'hualien',
      affectedCities: ['花蓮縣'],
      receivedAt: '2026-10-23T11:00:00.000Z'
    }
  ];
  const groups = context.groupEmergencyAlertsByCity(alerts, {
    Taipei: { cityName: '臺北市' },
    Hualien: { cityName: '花蓮縣' }
  });

  assert.deepEqual(Array.from(groups, (group) => group.cityCode), ['Taipei', 'Hualien']);
  assert.deepEqual(Array.from(groups[0].items, (item) => item.id), ['newest', 'older']);
  assert.deepEqual(Array.from(groups[1].items, (item) => item.id), ['newest', 'hualien']);
  assert.match(html, /id="emergencies-city-select"/);
  assert.match(html, /選擇縣市查看氣象署災害訊息/);
});

test('mobile app has the web portal link in its related-links section', () => {
  assert.match(mobileSyncScript, /'台灣智慧生活網apk下載',\s*'台灣智慧生活網'/);
  assert.match(mobileHtml, /id="portal-app-link"[^>]+href="https:\/\/taiwan-information\.onrender\.com\/"/);
  assert.match(mobileHtml, /id="portal-app-link-label"[^>]*>台灣智慧生活網</);
  assert.doesNotMatch(mobileHtml, /portal-app-link-label[^>]*>台灣智慧生活網apk下載</);
});
