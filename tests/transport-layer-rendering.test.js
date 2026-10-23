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
    config: { cities: { Taipei: { cityName: '臺北市' } } },
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
    normalizePlaceName: (value = '') => value.trim().replaceAll('台', '臺'),
    findNearestCityCode: () => 'Taipei',
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
    '    function stationDisasterWarning(',
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
