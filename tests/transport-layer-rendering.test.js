const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function readFunction(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing ${startMarker}`);
  assert.notEqual(end, -1, `Missing ${endMarker}`);
  return html.slice(start, end).trim();
}

function createRendererContext() {
  const bikeLayer = {
    markers: [],
    clearLayers() { this.markers = []; },
    addLayers(markers) { this.markers.push(...markers); }
  };
  const parkingLayer = {
    markers: [],
    clearLayers() { this.markers = []; },
    addLayers(markers) { this.markers.push(...markers); }
  };
  const state = {
    transportLayers: { bike: bikeLayer, parking: parkingLayer },
    config: {
      cities: {
        Taipei: { cityName: '臺北市' },
        Tainan: { cityName: '臺南市' }
      }
    },
    hazards: [{
      affectedCities: ['臺北市'],
      title: '豪雨特報',
      details: '外出請注意安全'
    }]
  };
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
  const marker = () => ({
    bindPopup(content) { this.popup = content; return this; },
    bindTooltip() { return this; },
    on() { return this; }
  });
  const context = {
    state,
    API_BASE_URL: 'https://example.test',
    URL,
    fetch: async () => {
      throw new Error('Unexpected fetch in this test');
    },
    normalizePlaceName: (value = '') => value.trim().replaceAll('台', '臺'),
    findCityCodeByName: (value = '') => Object.entries(state.config.cities)
      .find(([, city]) => city.cityName === value)?.[0] || null,
    findNearestCityCode: (latitude) => latitude < 24 ? 'Tainan' : 'Taipei',
    escapeHtml,
    formatOfficialTime: () => '更新時間',
    showBikeDetails() {},
    L: { divIcon: (options) => options, marker }
  };
  return { context, bikeLayer, parkingLayer };
}

test('YouBike and parking renderers add markers when station alerts are present', () => {
  const { context, bikeLayer, parkingLayer } = createRendererContext();
  const helper = readFunction(
    '    function disasterAlertHighlights(',
    '    function renderBikeLayer('
  );
  const bikeRendererSource = readFunction(
    '    function renderBikeLayer(',
    '    function renderParkingLayer('
  );
  const parkingRendererSource = readFunction(
    '    function renderParkingLayer(',
    '    function renderTrafficLayer('
  );

  vm.runInNewContext(helper, context);
  const renderBikeLayer = vm.runInNewContext(`(${bikeRendererSource})`, context);
  const renderParkingLayer = vm.runInNewContext(`(${parkingRendererSource})`, context);

  renderBikeLayer({
    data: [{ lat: 25.033, lng: 121.565, stationName: '測試站' }]
  }, 'CITY:Taipei');
  renderParkingLayer({
    data: [{ lat: 25.034, lng: 121.566, parkingName: '測試停車場' }]
  }, 'CITY:Taipei');

  assert.equal(bikeLayer.markers.length, 1);
  assert.match(bikeLayer.markers[0].popup, /豪雨特報/);
  assert.equal(parkingLayer.markers.length, 1);
  assert.match(parkingLayer.markers[0].popup, /豪雨特報/);
});

test('station disaster warnings match raw CWA area strings and show concise highlights', () => {
  const { context } = createRendererContext();
  context.state.config.cities = { Tainan: { cityName: '臺南市' } };
  context.state.hazards = [{
    category: '颱風警報',
    title: '海上陸上颱風警報',
    summary: '臺南市；67；zh-TW；海上陸上颱風；警報；2026-10-23 22:15:00；2026-10-24 02:15:00；陸上強風；特報；2026-10-23 16:47:00；2026-10-24 22:00:00',
    details: '臺南市；67；zh-TW；海上陸上颱風；警報；2026-10-23 22:15:00；2026-10-24 02:15:00；陸上強風；特報；2026-10-23 16:47:00；2026-10-24 22:00:00',
    affectedCities: [],
    affectedAreas: ['臺南市；67；zh-TW'],
    issuedAt: '2026-10-23T22:15:00+08:00',
    receivedAt: '2026-10-23T22:16:00+08:00'
  }];
  context.emergencyReceivedTimestamp = (alert) => Date.parse(alert.receivedAt || 0);
  const helper = readFunction(
    '    function disasterAlertHighlights(',
    '    function renderBikeLayer('
  );
  vm.runInNewContext(helper, context);

  const warning = context.stationDisasterWarning(
    'U-Bike站',
    { lat: 22.999, lng: 120.227 },
    'Tainan'
  );

  assert.match(warning, /可能災情資訊・臺南市U-Bike站/);
  assert.match(warning, /海上陸上颱風、陸上強風/);
  assert.match(warning, /發布時間/);
  assert.doesNotMatch(warning, /zh-TW|2026-10-23 22:15:00|臺南市；67/);
});

test('station city takes precedence over a different requested dataset city', () => {
  const { context } = createRendererContext();
  context.state.config.cities = {
    Taipei: { cityName: '臺北市' },
    Tainan: { cityName: '臺南市' }
  };
  context.state.hazards = [{
    category: '颱風警報',
    title: '海上陸上颱風警報',
    summary: '臺南市；海上陸上颱風；陸上強風',
    affectedCities: ['臺南市'],
    affectedAreas: ['臺南市'],
    receivedAt: '2026-10-23T22:16:00+08:00'
  }];
  context.emergencyReceivedTimestamp = (alert) => Date.parse(alert.receivedAt || 0);
  context.findCityCodeByName = () => null;
  const helper = readFunction(
    '    function disasterAlertHighlights(',
    '    function renderBikeLayer('
  );
  vm.runInNewContext(helper, context);

  const warning = context.stationDisasterWarning(
    '停車場',
    { city: 'Tainan', lat: 25.033, lng: 121.565 },
    'CITY:Taipei'
  );

  assert.match(warning, /臺南市停車場/);
  assert.match(warning, /陸上強風/);
  assert.doesNotMatch(warning, /臺北市/);

  context.state.hazards = [];
  assert.equal(context.stationDisasterWarning(
    '停車場',
    { city: 'Tainan', lat: 25.033, lng: 121.565 },
    'CITY:Taipei'
  ), '');
});

test('station details fetch local hazards and render the returned warning', async () => {
  const { context } = createRendererContext();
  context.fetch = async (endpoint) => {
    assert.equal(endpoint.pathname, '/api/hazards');
    assert.equal(endpoint.searchParams.get('lat'), '23.11');
    assert.equal(endpoint.searchParams.get('lng'), '120.29');
    return {
      ok: true,
      async json() {
        return {
          success: true,
          observedAt: '2026-10-23T14:56:52.023Z',
          data: {
            cityCode: 'Tainan',
            cityName: '臺南市',
            alerts: [{
              id: 'tainan-typhoon',
              category: '颱風警報',
              title: '海上陸上颱風',
              description: '臺南市；67；zh-TW；海上陸上颱風；警報；陸上強風',
              issuedAt: null,
              affectedAreas: []
            }]
          }
        };
      }
    };
  };
  const helper = readFunction(
    '    function disasterAlertHighlights(',
    '    function renderBikeLayer('
  );
  vm.runInNewContext(helper, context);
  const warning = {
    isConnected: true,
    dataset: {},
    innerHTML: '',
    textContent: ''
  };

  await context.refreshStationDisasterWarning(
    'U-Bike站',
    { lat: 23.11, lng: 120.29 },
    warning
  );

  assert.match(warning.innerHTML, /可能災情資訊・臺南市U-Bike站/);
  assert.match(warning.innerHTML, /海上陸上颱風、陸上強風/);
  assert.doesNotMatch(warning.innerHTML, /zh-TW|臺南市；67/);
});
