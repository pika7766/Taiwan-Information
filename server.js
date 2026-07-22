

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ENV_FILE = path.join(ROOT, '.env');
const BIKE_STATION_CACHE_FILE = path.join(ROOT, 'bike_station_cache.json');
const BUS_REALTIME_CACHE_FILE = process.env.BUS_REALTIME_CACHE_FILE || path.join(ROOT, 'bus_realtime_cache.json');

function loadEnvironmentFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const contents = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  contents.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const separator = line.indexOf('=');
    if (separator <= 0) return;
    const name = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || process.env[name]) return;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  });
  return true;
}

const environmentFileLoaded = process.env.SKIP_ENV_FILE !== 'true' && loadEnvironmentFile(ENV_FILE);
const TDX_REFRESH_INTERVAL_MS = Math.max(1_000, Number(process.env.TDX_REFRESH_INTERVAL_MS) || 5_000);
const TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS = Math.max(
  TDX_REFRESH_INTERVAL_MS,
  Number(process.env.TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS) || 5 * 60 * 1000
);
const TDX_ACTIVE_CACHE_WINDOW_MS = Math.max(
  TDX_REFRESH_INTERVAL_MS * 3,
  Number(process.env.TDX_ACTIVE_CACHE_WINDOW_MS) || 30_000
);
const TDX_RATE_LIMIT_COOLDOWN_MS = Math.max(
  TDX_REFRESH_INTERVAL_MS,
  Number(process.env.TDX_RATE_LIMIT_COOLDOWN_MS) || 15 * 60 * 1000
);
const TDX_REQUEST_SPACING_MS = Math.max(0, Number(process.env.TDX_REQUEST_SPACING_MS) || 600);
const BUS_REFRESH_INTERVAL_MS = TDX_REFRESH_INTERVAL_MS;
const PORTAL_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'api_config.json'), 'utf8').replace(/^\uFEFF/, ''));
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 4174;
const LOCAL_ORIGIN = `http://127.0.0.1:${PORT}`;
const REQUEST_BASE_ORIGIN = 'http://localhost';
const DATA_GOV_ENDPOINT = 'https://data.gov.tw/api/front/dataset/list';
const CWA_DATASTORE_ROOT = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore';
const CWA_DATASET_IDS = (process.env.CWA_DATASET_IDS || 'F-D0047-093,F-D0047-091')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const CWA_WEEKLY_DATASET_BY_CITY = {
  宜蘭縣: 'F-D0047-003', 桃園市: 'F-D0047-007', 新竹縣: 'F-D0047-011', 苗栗縣: 'F-D0047-015',
  彰化縣: 'F-D0047-019', 南投縣: 'F-D0047-023', 雲林縣: 'F-D0047-027', 嘉義縣: 'F-D0047-031',
  屏東縣: 'F-D0047-035', 臺東縣: 'F-D0047-039', 花蓮縣: 'F-D0047-043', 澎湖縣: 'F-D0047-047',
  基隆市: 'F-D0047-051', 新竹市: 'F-D0047-055', 嘉義市: 'F-D0047-059', 臺北市: 'F-D0047-063',
  高雄市: 'F-D0047-067', 新北市: 'F-D0047-071', 臺中市: 'F-D0047-075', 臺南市: 'F-D0047-079',
  連江縣: 'F-D0047-083', 金門縣: 'F-D0047-087'
};
const CWA_DISTRICT_ALIASES = {
  臺北市: { 興雅: '信義區', 三張犁: '信義區', 西村里: '信義區' }
};
const TDX_API_ROOT = process.env.TDX_API_ROOT || 'https://tdx.transportdata.tw/api/basic';
const TDX_CITY_BY_PORTAL_CODE = {
  Taipei: 'Taipei', NewTaipei: 'NewTaipei', Keelung: 'Keelung', Taoyuan: 'Taoyuan',
  HsinchuCity: 'Hsinchu', HsinchuCounty: 'HsinchuCounty', Miaoli: 'MiaoliCounty', Taichung: 'Taichung',
  Changhua: 'ChanghuaCounty', Nantou: 'NantouCounty', Yunlin: 'YunlinCounty', ChiayiCity: 'Chiayi',
  ChiayiCounty: 'ChiayiCounty', Tainan: 'Tainan', Kaohsiung: 'Kaohsiung', Pingtung: 'PingtungCounty',
  Yilan: 'YilanCounty', Hualien: 'HualienCounty', Taitung: 'TaitungCounty', Penghu: 'PenghuCounty',
  Kinmen: 'KinmenCounty', Matsu: 'LienchiangCounty'
};
const TDX_TOKEN_ENDPOINT = process.env.TDX_TOKEN_ENDPOINT
  || 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const OVERPASS_FALLBACK_ENDPOINTS = [OVERPASS_ENDPOINT, 'https://overpass.kumi.systems/api/interpreter'];
const OFFICIAL_REPORT_CATEGORIES = [
  { id: 'health', name: '生育保健', tid: 291 },
  { id: 'job', name: '求職就業', tid: 261 },
  { id: 'elderly', name: '高齡照護', tid: 286 },
  { id: 'safety', name: '生活安全及品質', tid: 247 }
];
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};
const PUBLIC_STATIC_FILES = new Set([
  'index.html', 'api_config.json', 'leaflet.css', 'leaflet.js',
  'leaflet.markercluster.js', 'MarkerCluster.css', 'MarkerCluster.Default.css'
]);

const tdxCredentials = loadTdxCredentials();
let activeTdxCredentialIndex = 0;
let bikeStationDiskCache = [];
let nationwideBusSnapshot = {
  observedAt: null,
  attemptedAt: null,
  byCity: {},
  unavailableCities: [],
  updateSequence: 0,
  nextSourceIndex: 0
};
let nationwideBusRefreshPromise = null;
let nationwideBusRefreshTimer = null;
try {
  const cachedBikePayload = JSON.parse(fs.readFileSync(BIKE_STATION_CACHE_FILE, 'utf8'));
  const cachedBikeStations = Array.isArray(cachedBikePayload) ? cachedBikePayload : cachedBikePayload.data;
  if (Array.isArray(cachedBikeStations) && cachedBikeStations.length) {
    bikeStationDiskCache = cachedBikeStations.map((station) => ({
      ...station,
      availableRentBikes: null,
      availableReturnBikes: null,
      serviceStatus: null,
      updateTime: null
    }));
  }
} catch (error) {
  if (error.code !== 'ENOENT') console.error('Unable to read YouBike station cache:', error.message);
}
try {
  const cachedBusSnapshot = JSON.parse(fs.readFileSync(BUS_REALTIME_CACHE_FILE, 'utf8'));
  if (cachedBusSnapshot?.byCity && typeof cachedBusSnapshot.byCity === 'object') {
    nationwideBusSnapshot = {
      observedAt: cachedBusSnapshot.observedAt || null,
      attemptedAt: cachedBusSnapshot.attemptedAt || null,
      byCity: cachedBusSnapshot.byCity,
      unavailableCities: Array.isArray(cachedBusSnapshot.unavailableCities) ? cachedBusSnapshot.unavailableCities : [],
      updateSequence: Number(cachedBusSnapshot.updateSequence) || 0,
      nextSourceIndex: Number(cachedBusSnapshot.nextSourceIndex) || 0
    };
  }
} catch (error) {
  if (error.code !== 'ENOENT') console.error('Unable to read nationwide bus cache:', error.message);
}
const tdxResponseCache = new Map();
const roadNetworkCache = new Map();
const geocodeSearchCache = new Map();
const TDX_RESPONSE_CACHE_MS = TDX_REFRESH_INTERVAL_MS;
let tdxRequestQueue = Promise.resolve();
let lastTdxRequestAt = 0;
let tdxCacheRefreshPromise = null;
let tdxCacheRefreshTimer = null;

class UpstreamError extends Error {
  constructor(message, status = 502, details = '') {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.details = details;
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, Authorization'
  };
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function sendApiError(response, error) {
  const status = error instanceof UpstreamError ? error.status : 500;
  const message = status === 429 ? '請求過多，請稍後再試' : error.message;
  console.error('API request failed:', error);
  sendJson(response, status, {
    success: false,
    message,
    details: error instanceof UpstreamError ? error.details : undefined
  });
}

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 100_000) throw new UpstreamError('Request body is too large', 413);
  }
  try {
    return { body, parsed: JSON.parse(body) };
  } catch (error) {
    throw new UpstreamError(`Invalid JSON request body: ${error.message}`, 400);
  }
}

async function fetchJson(url, options = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      const upstreamError = new UpstreamError(
        `Official service returned HTTP ${response.status} ${response.statusText}`.trim(),
        response.status >= 400 && response.status < 500 ? response.status : 502,
        text.slice(0, 1000)
      );
      upstreamError.retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      throw upstreamError;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new UpstreamError(`Official service returned invalid JSON: ${error.message}`, 502, text.slice(0, 1000));
    }
  } catch (error) {
    if (error.name === 'AbortError') throw new UpstreamError('Official service request timed out', 504);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new UpstreamError(`Server environment variable ${name} is not configured`, 503);
  return value;
}

function parseRetryAfterMs(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function loadTdxCredentials() {
  const definitions = [];
  const addCredential = (clientId, clientSecret, label) => {
    const normalizedId = String(clientId || '').trim();
    const normalizedSecret = String(clientSecret || '').trim();
    if (!normalizedId || !normalizedSecret) return;
    if (definitions.some((item) => item.clientId === normalizedId && item.clientSecret === normalizedSecret)) return;
    definitions.push({ clientId: normalizedId, clientSecret: normalizedSecret, label });
  };

  addCredential(process.env.TDX_CLIENT_ID, process.env.TDX_CLIENT_SECRET, 'default');
  const numberedIndexes = new Set(Object.keys(process.env).flatMap((name) => {
    const match = name.match(/^TDX_CLIENT_(?:ID|SECRET)_(\d+)$/);
    return match ? [Number(match[1])] : [];
  }));
  [...numberedIndexes].sort((left, right) => left - right).forEach((index) => {
    addCredential(process.env[`TDX_CLIENT_ID_${index}`], process.env[`TDX_CLIENT_SECRET_${index}`], `credential-${index}`);
  });

  if (process.env.TDX_CREDENTIALS_JSON) {
    try {
      const parsed = JSON.parse(process.env.TDX_CREDENTIALS_JSON);
      const isSingleCredential = parsed && typeof parsed === 'object'
        && (parsed.clientId || parsed.client_id || parsed.id);
      const entries = Array.isArray(parsed) ? parsed : isSingleCredential ? [parsed] : Object.values(parsed || {});
      entries.forEach((item, index) => addCredential(
        item?.clientId || item?.client_id || item?.id,
        item?.clientSecret || item?.client_secret || item?.secret,
        `json-${index + 1}`
      ));
    } catch (error) {
      console.error('Unable to parse TDX_CREDENTIALS_JSON:', error.message);
    }
  }

  return definitions.map((definition, index) => ({
    ...definition,
    index,
    token: '',
    expiresAt: 0,
    tokenPromise: null,
    rateLimitedUntil: 0
  }));
}

async function getTdxToken(credential) {
  if (credential.token && Date.now() < credential.expiresAt - 60_000) return credential.token;
  if (credential.tokenPromise) return credential.tokenPromise;
  credential.tokenPromise = (async () => {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: credential.clientId,
      client_secret: credential.clientSecret
    });
    const payload = await fetchJson(TDX_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body
    });
    if (!payload.access_token) throw new UpstreamError('TDX token response did not include access_token', 502);
    credential.token = payload.access_token;
    credential.expiresAt = Date.now() + Number(payload.expires_in || 900) * 1000;
    return credential.token;
  })().finally(() => {
    credential.tokenPromise = null;
  });
  return credential.tokenPromise;
}

function requireTaiwanCoordinates(searchParams) {
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new UpstreamError('lat and lng must be valid numbers', 400);
  }
  if (lat < 21.5 || lat > 26 || lng < 119 || lng > 122.5) {
    throw new UpstreamError('Coordinates are outside the configured Taiwan map bounds', 400);
  }
  return { lat, lng };
}

function requireTdxCity(searchParams, lat, lng) {
  const portalCode = searchParams.get('city');
  if (TDX_CITY_BY_PORTAL_CODE[portalCode]) return TDX_CITY_BY_PORTAL_CODE[portalCode];

  let nearestPortalCode = null;
  let shortestDistance = Infinity;
  Object.entries(PORTAL_CONFIG.cities || {}).forEach(([code, config]) => {
    if (!TDX_CITY_BY_PORTAL_CODE[code] || !Array.isArray(config.mapCenter)) return;
    const distance = haversineMeters(lat, lng, Number(config.mapCenter[0]), Number(config.mapCenter[1]));
    if (distance < shortestDistance) {
      nearestPortalCode = code;
      shortestDistance = distance;
    }
  });
  if (!nearestPortalCode) throw new UpstreamError('Unable to resolve a TDX city from coordinates', 400);
  return TDX_CITY_BY_PORTAL_CODE[nearestPortalCode];
}

function tdxCityUrl(pathname, city, parameters = {}) {
  const url = new URL(`${TDX_API_ROOT}/${pathname}/${city}`);
  Object.entries(parameters).forEach(([name, value]) => {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(name, value);
  });
  url.searchParams.set('$format', 'JSON');
  return url;
}

function tdxRefreshIntervalForUrl(url) {
  return /\/v\d+\/(?:Bike|Parking|Road\/Traffic)\//.test(url.pathname)
    ? TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS
    : TDX_REFRESH_INTERVAL_MS;
}

function queueTdxRequest(task) {
  const run = tdxRequestQueue.then(async () => {
    const waitMs = Math.max(0, TDX_REQUEST_SPACING_MS - (Date.now() - lastTdxRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    try {
      return await task();
    } finally {
      lastTdxRequestAt = Date.now();
    }
  });
  tdxRequestQueue = run.catch(() => undefined);
  return run;
}

function markTdxCredentialRateLimited(credential, error) {
  const cooldownMs = error.retryAfterMs || TDX_RATE_LIMIT_COOLDOWN_MS;
  credential.rateLimitedUntil = Date.now() + Math.max(TDX_REFRESH_INTERVAL_MS, cooldownMs);
  credential.token = '';
  credential.expiresAt = 0;
  activeTdxCredentialIndex = (credential.index + 1) % tdxCredentials.length;
  console.warn(`TDX ${credential.label} reached HTTP 429; switching to the next configured credential.`);
}

function areAllTdxCredentialsRateLimited() {
  return tdxCredentials.length > 0
    && tdxCredentials.every((credential) => Date.now() < credential.rateLimitedUntil);
}

async function requestTdxUrl(url) {
  if (!tdxCredentials.length) {
    throw new UpstreamError('No complete TDX credential pair is configured', 503);
  }

  let lastError = null;
  const startingCredentialIndex = activeTdxCredentialIndex;
  for (let offset = 0; offset < tdxCredentials.length; offset += 1) {
    const index = (startingCredentialIndex + offset) % tdxCredentials.length;
    const credential = tdxCredentials[index];
    if (Date.now() < credential.rateLimitedUntil) continue;

    let token;
    try {
      token = await getTdxToken(credential);
    } catch (error) {
      lastError = error;
      if (error.status === 429) {
        markTdxCredentialRateLimited(credential, error);
        continue;
      }
      if ([400, 401, 403].includes(error.status)) {
        console.error(`TDX ${credential.label} authentication failed; trying the next credential.`);
        continue;
      }
      throw error;
    }

    try {
      const data = await queueTdxRequest(() => fetchJson(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      }, 60_000));
      activeTdxCredentialIndex = index;
      return data;
    } catch (error) {
      lastError = error;
      if (error.status === 429) {
        markTdxCredentialRateLimited(credential, error);
        continue;
      }
      if ([401, 403].includes(error.status)) {
        credential.token = '';
        credential.expiresAt = 0;
        console.error(`TDX ${credential.label} access token was rejected; trying the next credential.`);
        continue;
      }
      throw error;
    }
  }

  if (areAllTdxCredentialsRateLimited()) {
    throw new UpstreamError('All configured TDX credentials are rate limited', 429);
  }
  throw lastError || new UpstreamError('No TDX credential is currently available', 503);
}

async function refreshTdxCacheEntry(entry) {
  if (entry.pending) return entry.pending;
  entry.pending = (async () => {
    const data = await requestTdxUrl(entry.url);
    entry.data = data;
    entry.updatedAt = Date.now();
    entry.expiresAt = entry.updatedAt + entry.refreshIntervalMs;
    return data;
  })().finally(() => {
    entry.pending = null;
  });
  return entry.pending;
}

async function fetchTdxUrl(url, cacheMs = TDX_RESPONSE_CACHE_MS, options = {}) {
  const key = url.toString();
  let entry = tdxResponseCache.get(key);
  if (!entry) {
    entry = {
      url: new URL(key),
      data: null,
      pending: null,
      updatedAt: 0,
      expiresAt: 0,
      lastAccessAt: 0,
      cacheMs,
      refreshIntervalMs: options.refreshIntervalMs || tdxRefreshIntervalForUrl(url),
      backgroundRefresh: options.backgroundRefresh !== false
    };
    tdxResponseCache.set(key, entry);
  } else {
    entry.cacheMs = cacheMs;
    if (options.refreshIntervalMs) entry.refreshIntervalMs = options.refreshIntervalMs;
    if (options.backgroundRefresh !== undefined) entry.backgroundRefresh = options.backgroundRefresh;
  }
  if (options.trackActivity !== false) entry.lastAccessAt = Date.now();

  if (entry.data && options.forceRefresh !== true) {
    if (Date.now() < entry.updatedAt + entry.refreshIntervalMs) return entry.data;
    try {
      return await refreshTdxCacheEntry(entry);
    } catch (error) {
      return entry.data;
    }
  }
  try {
    return await refreshTdxCacheEntry(entry);
  } catch (error) {
    if (!entry.data) tdxResponseCache.delete(key);
    throw error;
  }
}

async function refreshActiveTdxCache() {
  if (tdxCacheRefreshPromise) return tdxCacheRefreshPromise;
  const now = Date.now();
  const entries = [...tdxResponseCache.values()]
    .filter((entry) => entry.backgroundRefresh
      && entry.lastAccessAt >= now - Math.max(
        TDX_ACTIVE_CACHE_WINDOW_MS,
        entry.refreshIntervalMs + TDX_REFRESH_INTERVAL_MS * 2
      )
      && now >= entry.updatedAt + entry.refreshIntervalMs);
  if (!entries.length) return [];

  tdxCacheRefreshPromise = Promise.allSettled(entries.map((entry) => refreshTdxCacheEntry(entry)))
    .finally(() => {
      tdxCacheRefreshPromise = null;
    });
  return tdxCacheRefreshPromise;
}

function startTdxCacheRefresh() {
  tdxCacheRefreshTimer = setInterval(() => {
    refreshActiveTdxCache().catch((error) => console.error('TDX shared cache refresh failed:', error.message));
  }, TDX_REFRESH_INTERVAL_MS);
  tdxCacheRefreshTimer.unref?.();
}

async function fetchTdxCity(pathname, city, parameters = {}, cacheMs = TDX_RESPONSE_CACHE_MS, options = {}) {
  return fetchTdxUrl(tdxCityUrl(pathname, city, parameters), cacheMs, options);
}

async function fetchTdxCityRoute(pathname, city, routeName, parameters = {}, cacheMs = TDX_RESPONSE_CACHE_MS, options = {}) {
  const url = new URL(`${TDX_API_ROOT}/${pathname}/${city}/${encodeURIComponent(routeName)}`);
  Object.entries(parameters).forEach(([name, value]) => {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(name, value);
  });
  url.searchParams.set('$format', 'JSON');
  return fetchTdxUrl(url, cacheMs, options);
}

function coordinateBoxFilter(positionField, lat, lng, radiusMeters = 600) {
  const latitudeDelta = radiusMeters / 111_320;
  const longitudeDelta = radiusMeters / (111_320 * Math.cos(lat * Math.PI / 180));
  return [
    `${positionField}/PositionLat ge ${lat - latitudeDelta}`,
    `${positionField}/PositionLat le ${lat + latitudeDelta}`,
    `${positionField}/PositionLon ge ${lng - longitudeDelta}`,
    `${positionField}/PositionLon le ${lng + longitudeDelta}`
  ].join(' and ');
}

function asArray(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function localizedText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return value.Zh_tw || value.Zh_TW || value.zh_tw || value.En || value.Other
    || Object.values(value).find((item) => typeof item === 'string') || '';
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRadians = (degree) => degree * Math.PI / 180;
  const earthRadius = 6_371_000;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function positionOf(item) {
  const position = item.StopPosition || item.StationPosition || item.CarParkPosition
    || item.ParkingPosition || item.Position || item.LinkPosition || {};
  return {
    lat: Number(position.PositionLat ?? position.Latitude),
    lng: Number(position.PositionLon ?? position.Longitude)
  };
}

async function proxyReverseGeocode(requestUrl, response) {
  try {
    const { lat, lng } = requireTaiwanCoordinates(requestUrl.searchParams);
    const endpoint = new URL(NOMINATIM_ENDPOINT);
    endpoint.search = new URLSearchParams({
      format: 'jsonv2',
      lat,
      lon: lng,
      zoom: 14,
      addressdetails: 1,
      'accept-language': 'zh-TW'
    });
    const payload = await fetchJson(endpoint, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'zh-TW',
        'User-Agent': 'TaiwanSmartLifePortal/1.0 (local development application)'
      }
    });
    const address = payload.address || {};
    const city = address.city || address.county || address.municipality || address.state;
    const districtCandidates = [
      address.city_district,
      address.district,
      address.town,
      address.township,
      address.suburb,
      address.village
    ].filter(Boolean);
    const district = districtCandidates.find((value) => /[區鄉鎮市]$/.test(normalizePlaceName(value)))
      || districtCandidates[0];
    if (!city || !district) throw new UpstreamError('Reverse geocoder did not return a city and district', 502);
    sendJson(response, 200, {
      success: true,
      source: 'OpenStreetMap Nominatim',
      observedAt: new Date().toISOString(),
      data: { city, district, displayName: payload.display_name || '', lat, lng }
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

async function proxyGeocodeSearch(requestUrl, response) {
  try {
    const query = String(requestUrl.searchParams.get('q') || '').trim();
    if (query.length < 2) throw new UpstreamError('搜尋文字至少需要 2 個字元', 400);
    if (query.length > 100) throw new UpstreamError('搜尋文字不可超過 100 個字元', 400);

    const cacheKey = query.toLocaleLowerCase('zh-TW');
    const cached = geocodeSearchCache.get(cacheKey);
    let payload;
    if (cached && Date.now() < cached.expiresAt) {
      payload = cached.data;
    } else {
      const endpoint = new URL(NOMINATIM_SEARCH_ENDPOINT);
      endpoint.search = new URLSearchParams({
        format: 'jsonv2', q: query, countrycodes: 'tw', viewbox: '119,26,122.5,21.5',
        bounded: '1', addressdetails: '1', limit: '8', 'accept-language': 'zh-TW'
      });
      payload = await fetchJson(endpoint, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'zh-TW',
          'User-Agent': 'TaiwanSmartLifePortal/1.0 (local development application)'
        }
      });
      geocodeSearchCache.set(cacheKey, { data: payload, expiresAt: Date.now() + 15 * 60 * 1000 });
    }

    const data = (Array.isArray(payload) ? payload : []).map((place) => {
      const lat = Number(place.lat);
      const lng = Number(place.lon);
      const address = place.address || {};
      return {
        placeId: String(place.place_id || `${lat},${lng}`),
        name: place.name || String(place.display_name || '').split(',')[0] || query,
        displayName: place.display_name || '',
        city: address.city || address.county || address.municipality || address.state || '',
        district: address.city_district || address.town || address.township || address.suburb || '',
        type: place.type || place.category || '',
        lat,
        lng
      };
    }).filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng)
      && place.lat >= 21.5 && place.lat <= 26 && place.lng >= 119 && place.lng <= 122.5);

    sendJson(response, 200, {
      success: true,
      source: 'OpenStreetMap Nominatim',
      observedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

function normalizePlaceName(value = '') {
  return String(value).trim().replaceAll('台', '臺').replaceAll('台灣', '臺灣');
}

function weatherElementValue(element, preferredKeys = []) {
  const time = (element?.Time || element?.time || [])[0];
  const values = time?.ElementValue || time?.elementValue || [];
  for (const value of values) {
    for (const key of preferredKeys) {
      if (value?.[key] !== undefined && value[key] !== '') return value[key];
    }
    const candidate = Object.entries(value || {}).find(([key, item]) => key !== 'Measures' && item !== '');
    if (candidate) return candidate[1];
  }
  return null;
}

async function fetchCwaForecast(authorization, city) {
  const cityDatasetId = CWA_WEEKLY_DATASET_BY_CITY[normalizePlaceName(city)];
  const datasetIds = [...new Set([cityDatasetId, ...CWA_DATASET_IDS].filter(Boolean))];
  const unavailableDatasets = [];
  for (const datasetId of datasetIds) {
    const endpoint = new URL(`${CWA_DATASTORE_ROOT}/${datasetId}`);
    endpoint.searchParams.set('Authorization', authorization);
    endpoint.searchParams.set('format', 'JSON');
    try {
      return {
        datasetId,
        payload: await fetchJson(endpoint, { headers: { Accept: 'application/json' } }, 30_000)
      };
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 404) {
        unavailableDatasets.push(datasetId);
        continue;
      }
      throw error;
    }
  }
  throw new UpstreamError(
    `CWA datasets are unavailable: ${unavailableDatasets.join(', ')}`,
    404,
    'The configured CWA authorization key cannot access any configured township forecast dataset.'
  );
}

async function proxyWeather(requestUrl, response) {
  try {
    const city = normalizePlaceName(requestUrl.searchParams.get('city'));
    const district = normalizePlaceName(requestUrl.searchParams.get('district'));
    const resolvedDistrict = CWA_DISTRICT_ALIASES[city]?.[district] || district;
    const latitude = Number(requestUrl.searchParams.get('lat'));
    const longitude = Number(requestUrl.searchParams.get('lng'));
    if (!city || !district) throw new UpstreamError('city and district are required', 400);
    const authorization = requiredEnvironment('CWA_API_KEY');
    const { datasetId, payload } = await fetchCwaForecast(authorization, city);
    const locations = payload.records?.Locations || payload.records?.locations || [];
    let match = null;
    for (const group of locations) {
      const groupName = normalizePlaceName(group.LocationsName || group.locationsName);
      if (groupName && !groupName.includes(city) && !city.includes(groupName)) continue;
      const entries = group.Location || group.location || [];
      match = entries.find((entry) => normalizePlaceName(entry.LocationName || entry.locationName) === resolvedDistrict);
      if (!match && Number.isFinite(latitude) && Number.isFinite(longitude)) {
        match = entries.map((entry) => {
          const entryLatitude = Number(entry.Latitude ?? entry.latitude);
          const entryLongitude = Number(entry.Longitude ?? entry.longitude);
          const distance = Number.isFinite(entryLatitude) && Number.isFinite(entryLongitude)
            ? haversineMeters(latitude, longitude, entryLatitude, entryLongitude)
            : Infinity;
          return { entry, distance };
        }).sort((left, right) => left.distance - right.distance)[0]?.entry || null;
      }
      if (match) break;
    }
    if (!match) throw new UpstreamError(`CWA forecast did not contain ${city}${district}`, 404);
    const elements = match.WeatherElement || match.weatherElement || [];
    const findElement = (...names) => elements.find((element) => names.includes(element.ElementName || element.elementName));
    const phenomenon = weatherElementValue(
      findElement('Wx', '天氣現象'),
      ['Weather', 'WeatherDescription', 'value']
    );
    const temperature = weatherElementValue(
      findElement('T', '平均溫度'),
      ['Temperature', 'value']
    ) ?? weatherElementValue(
      findElement('MinT', '最低溫度'),
      ['MinTemperature', 'Temperature', 'value']
    );
    const precipitation = weatherElementValue(
      findElement('PoP12h', '12小時降雨機率'),
      ['ProbabilityOfPrecipitation', 'value']
    );
    sendJson(response, 200, {
      success: true,
      source: `中央氣象署 ${datasetId}`,
      observedAt: new Date().toISOString(),
      data: {
        city,
        district: normalizePlaceName(match.LocationName || match.locationName || district),
        phenomenon,
        temperature: temperature === null ? null : Number(temperature),
        precipitationProbability: precipitation === null ? null : Number(precipitation)
      }
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

async function fetchOverpassQuery(query, timeoutMs = 35_000) {
  let lastError;
  for (const endpoint of OVERPASS_FALLBACK_ENDPOINTS) {
    try {
      return await fetchJson(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json',
          'User-Agent': 'TaiwanSmartLifePortal/1.0 (local development application)'
        },
        body: new URLSearchParams({ data: query })
      }, timeoutMs);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function proxySafetyInformation(requestUrl, response) {
  try {
    const { lat, lng } = requireTaiwanCoordinates(requestUrl.searchParams);
    const city = normalizePlaceName(requestUrl.searchParams.get('city'));
    const authorization = requiredEnvironment('CWA_API_KEY');
    const fetchCwaDataset = (datasetId) => {
      const endpoint = new URL(`${CWA_DATASTORE_ROOT}/${datasetId}`);
      endpoint.search = new URLSearchParams({ Authorization: authorization, format: 'JSON' });
      return fetchJson(endpoint, { headers: { Accept: 'application/json' } }, 30_000);
    };
    const shelterQuery = `[out:json][timeout:25];(nwr(around:5000,${lat},${lng})["amenity"="shelter"];nwr(around:5000,${lat},${lng})["emergency"="assembly_point"];nwr(around:5000,${lat},${lng})["social_facility"="shelter"];);out tags center;`;
    const [warningResult, earthquakeResult, shelterResult] = await Promise.allSettled([
      fetchCwaDataset('W-C0033-001'),
      fetchCwaDataset('E-A0015-001'),
      fetchOverpassQuery(shelterQuery, 7_000)
    ]);
    const warningRecords = warningResult.status === 'fulfilled'
      ? asArray(warningResult.value.records, ['record', 'Record', 'location'])
      : [];
    const warnings = warningRecords.map((record) => {
      const serialized = JSON.stringify(record);
      const phenomena = record.hazardConditions?.hazards?.hazard?.[0]?.info?.phenomena
        || record.datasetInfo?.datasetDescription || record.phenomena || '';
      const description = record.contents?.content?.contentText || record.contentText || record.description || phenomena;
      return {
        title: localizedText(phenomena) || String(phenomena || '氣象警特報'),
        description: localizedText(description) || String(description || ''),
        issuedAt: record.datasetInfo?.issueTime || record.issueTime || null,
        rawIncludesCity: !city || normalizePlaceName(serialized).includes(city)
      };
    }).filter((warning) => warning.rawIncludesCity).map(({ rawIncludesCity, ...warning }) => warning);
    const earthquakeRecords = earthquakeResult.status === 'fulfilled'
      ? asArray(earthquakeResult.value.records, ['Earthquake', 'earthquake'])
      : [];
    const earthquakes = earthquakeRecords.slice(0, 5).map((item) => ({
      report: item.ReportContent || item.reportContent || '中央氣象署地震報告',
      originTime: item.EarthquakeInfo?.OriginTime || item.earthquakeInfo?.originTime || null,
      location: item.EarthquakeInfo?.Epicenter?.Location || item.earthquakeInfo?.epicenter?.location || '',
      magnitude: Number(item.EarthquakeInfo?.EarthquakeMagnitude?.MagnitudeValue ?? item.earthquakeInfo?.earthquakeMagnitude?.magnitudeValue) || null
    }));
    const shelters = shelterResult.status === 'fulfilled'
      ? asArray(shelterResult.value, ['elements']).map((item) => ({
        id: item.id,
        name: item.tags?.name || item.tags?.['name:zh'] || '未命名避難場所',
        type: item.tags?.emergency === 'assembly_point' ? '緊急集合點' : '避難場所',
        lat: Number(item.lat ?? item.center?.lat),
        lng: Number(item.lon ?? item.center?.lon)
      })).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
        .sort((left, right) => haversineMeters(lat, lng, left.lat, left.lng) - haversineMeters(lat, lng, right.lat, right.lng)).slice(0, 20)
      : [];
    sendJson(response, 200, {
      success: true,
      source: '中央氣象署警特報、地震資料與 OpenStreetMap 避難場所',
      observedAt: new Date().toISOString(),
      data: { warnings, earthquakes, shelters },
      unavailable: [
        warningResult.status === 'rejected' ? '氣象警特報' : null,
        earthquakeResult.status === 'rejected' ? '地震資訊' : null,
        shelterResult.status === 'rejected' ? '避難場所' : null
      ].filter(Boolean)
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

function parseWktLines(wkt) {
  if (typeof wkt !== 'string') return [];
  const normalized = wkt.replace(/^SRID=\d+;/i, '').trim();
  const groups = normalized.toUpperCase().startsWith('MULTILINESTRING')
    ? [...normalized.matchAll(/\(([^()]+)\)/g)].map((match) => match[1])
    : [normalized.replace(/^[^(]+\(/, '').replace(/\)$/, '')];
  return groups.map((group) => group.split(',').map((pair) => {
    const [longitude, latitude] = pair.trim().split(/\s+/).map(Number);
    return [latitude, longitude];
  }).filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude)))
    .filter((line) => line.length >= 2);
}

function trafficStatus(congestionLevel, speed) {
  const level = Number(congestionLevel);
  if (level === -1) return { key: 'closed', label: '道路封閉' };
  if (level === -99 || (!Number.isFinite(level) && !Number.isFinite(speed))) return { key: 'unknown', label: '無即時監測資料' };
  if (level >= 3) return { key: 'congested', label: '塞車' };
  if (level >= 2) return { key: 'slow', label: '有點塞車' };
  return { key: 'smooth', label: '順暢行駛' };
}

function mapBusStop(stop, origin = null) {
  const position = positionOf(stop);
  const stopUid = stop.StopUID || stop.StopID || '';
  return {
    stopUid,
    stopUids: stopUid ? [stopUid] : [],
    stopName: localizedText(stop.StopName) || '未命名站牌',
    lat: position.lat,
    lng: position.lng,
    distanceMeters: origin && Number.isFinite(position.lat) && Number.isFinite(position.lng)
      ? Math.round(haversineMeters(origin.lat, origin.lng, position.lat, position.lng))
      : null
  };
}

function busArrivalLabel(estimateTime, stopStatus, nextBusTime) {
  if (Number.isFinite(estimateTime)) {
    if (estimateTime <= 60) return '即將進站';
    return `約 ${Math.ceil(estimateTime / 60)} 分鐘`;
  }
  const labels = { 1: '尚未發車', 2: '交管不停靠', 3: '末班車已過', 4: '今日未營運' };
  return labels[stopStatus] || (nextBusTime ? `預定 ${nextBusTime}` : '尚無預估時間');
}

function mapStopOfRoute(item, etaItems = [], plateNumber = '', currentStopUid = '') {
  const direction = item.Direction ?? null;
  const routeName = localizedText(item.RouteName || item.SubRouteName) || '未標示路線';
  const stops = asArray(item.Stops).map((stop) => {
    const stationEtas = etaItems.filter((eta) =>
      (eta.StopUID || eta.StopID) === (stop.StopUID || stop.StopID)
      && (direction === null || eta.Direction === direction));
    const vehicleEta = stationEtas.find((eta) => plateNumber && eta.PlateNumb === plateNumber);
    const eta = vehicleEta || stationEtas.filter((entry) => Number.isFinite(Number(entry.EstimateTime)))
      .sort((left, right) => Number(left.EstimateTime) - Number(right.EstimateTime))[0] || stationEtas[0] || {};
    const estimateTime = Number(eta.EstimateTime);
    return {
      ...mapBusStop(stop),
      sequence: Number(stop.StopSequence) || null,
      estimateSeconds: Number.isFinite(estimateTime) ? estimateTime : null,
      isVehicleEstimate: Boolean(vehicleEta),
      arrivalLabel: busArrivalLabel(Number.isFinite(estimateTime) ? estimateTime : null, eta.StopStatus, eta.NextBusTime),
      nextBusTime: eta.NextBusTime || null
    };
  });
  const nextStop = stops.find((stop) => currentStopUid && stop.stopUid === currentStopUid)
    || stops.filter((stop) => stop.isVehicleEstimate && Number.isFinite(stop.estimateSeconds) && stop.estimateSeconds >= 0)
      .sort((left, right) => left.estimateSeconds - right.estimateSeconds)[0]
    || stops.filter((stop) => Number.isFinite(stop.estimateSeconds) && stop.estimateSeconds >= 0)
    .sort((left, right) => left.estimateSeconds - right.estimateSeconds)[0] || null;
  return {
    routeUid: item.RouteUID || item.RouteID || '',
    subRouteUid: item.SubRouteUID || item.SubRouteID || '',
    routeName,
    direction,
    directionLabel: direction === 0 ? '去程' : direction === 1 ? '返程' : '方向未提供',
    nextStop,
    stops
  };
}

async function fetchBusRouteDetails(city, routeName, plateNumber = '', preferredDirection = null, currentStopUid = '') {
  const stopPath = city === 'InterCity' ? 'v2/Bus/StopOfRoute' : 'v2/Bus/StopOfRoute/City';
  const etaPath = city === 'InterCity' ? 'v2/Bus/EstimatedTimeOfArrival' : 'v2/Bus/EstimatedTimeOfArrival/City';
  const [stopPayload, etaPayload] = await Promise.all([
    fetchTdxCityRoute(stopPath, city, routeName, { '$top': 100 }, 24 * 60 * 60 * 1000),
    fetchTdxCityRoute(etaPath, city, routeName, { '$top': 1000 })
  ]);
  const etaItems = asArray(etaPayload);
  const routes = asArray(stopPayload).map((item) => mapStopOfRoute(item, etaItems, plateNumber, currentStopUid));
  routes.sort((left, right) => Number(left.direction !== preferredDirection) - Number(right.direction !== preferredDirection));
  return routes;
}

async function proxyBusDetails(requestUrl, response) {
  try {
    const { lat, lng } = requireTaiwanCoordinates(requestUrl.searchParams);
    const requestedCity = requestUrl.searchParams.get('city');
    const city = requestedCity === 'InterCity' ? 'InterCity' : requireTdxCity(requestUrl.searchParams, lat, lng);
    const routeName = String(requestUrl.searchParams.get('routeName') || '').trim();
    const plateNumber = String(requestUrl.searchParams.get('plateNumber') || '').trim();
    const directionValue = Number(requestUrl.searchParams.get('direction'));
    const currentStopUid = String(requestUrl.searchParams.get('currentStopUid') || '').trim();
    if (!routeName) throw new UpstreamError('routeName is required', 400);
    const routes = await fetchBusRouteDetails(city, routeName, plateNumber, Number.isFinite(directionValue) ? directionValue : null, currentStopUid);
    sendJson(response, 200, {
      success: true,
      source: '交通部 TDX 公車站序與預估到站',
      observedAt: new Date().toISOString(),
      data: { city, routeName, plateNumber, routes }
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

async function proxyBusStopDetails(requestUrl, response) {
  try {
    const { lat, lng } = requireTaiwanCoordinates(requestUrl.searchParams);
    const city = requireTdxCity(requestUrl.searchParams, lat, lng);
    const stopUid = String(requestUrl.searchParams.get('stopUid') || '').trim();
    const stopUids = String(requestUrl.searchParams.get('stopUids') || stopUid).split(',').map((value) => value.trim()).filter(Boolean);
    const stopName = String(requestUrl.searchParams.get('stopName') || '公車站牌').trim();
    if (!stopUids.length) throw new UpstreamError('stopUid is required', 400);
    const stopFilter = stopUids.map((uid) => `StopUID eq '${uid.replaceAll("'", "''")}'`).join(' or ');
    const etaPayload = await fetchTdxCity('v2/Bus/EstimatedTimeOfArrival/City', city, {
      '$filter': stopFilter,
      '$top': 500
    });
    const etaItems = asArray(etaPayload);
    const routeNames = [...new Set(etaItems.map((item) => localizedText(item.RouteName || item.SubRouteName)).filter(Boolean))];
    const routeNameSet = new Set(routeNames);
    const stopRoutesPayload = routeNames.length
      ? await fetchTdxCity('v2/Bus/StopOfRoute/City', city, { '$top': 10000 }, 24 * 60 * 60 * 1000)
      : [];
    const routes = asArray(stopRoutesPayload)
      .filter((item) => routeNameSet.has(localizedText(item.RouteName || item.SubRouteName)))
      .map((item) => mapStopOfRoute(item, etaItems))
      .filter((route) => route.stops.some((stop) => stopUids.includes(stop.stopUid)));
    const arrivals = etaItems.map((item) => {
      const estimateTime = Number(item.EstimateTime);
      return {
        routeName: localizedText(item.RouteName || item.SubRouteName) || '未標示路線',
        direction: item.Direction ?? null,
        plateNumber: item.PlateNumb || '',
        estimateSeconds: Number.isFinite(estimateTime) ? estimateTime : null,
        arrivalLabel: busArrivalLabel(Number.isFinite(estimateTime) ? estimateTime : null, item.StopStatus, item.NextBusTime)
      };
    }).sort((left, right) => (left.estimateSeconds ?? Infinity) - (right.estimateSeconds ?? Infinity));
    sendJson(response, 200, {
      success: true,
      source: '交通部 TDX 站牌公車與路線',
      observedAt: new Date().toISOString(),
      data: { city, stopUid: stopUids[0], stopUids, stopName, arrivals, routes }
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

const BUS_STATUS_LABELS = {
  0: '正常行駛', 1: '車禍', 2: '故障', 3: '塞車', 4: '緊急求援', 5: '加油',
  90: '狀態不明', 91: '去回程不明', 98: '偏移路線', 99: '非營運狀態', 100: '客滿',
  101: '包車出租', 255: '狀態未知'
};

function mapBusRealtime(bus, portalCityCode, tdxCity) {
  const position = bus.BusPosition || {};
  const lat = Number(position.PositionLat);
  const lng = Number(position.PositionLon);
  return {
    plateNumber: bus.PlateNumb || '',
    routeName: localizedText(bus.RouteName || bus.SubRouteName) || '未標示路線',
    portalCityCode,
    city: tdxCity,
    lat,
    lng,
    speed: Number.isFinite(Number(bus.Speed)) ? Number(bus.Speed) : null,
    azimuth: Number.isFinite(Number(bus.Azimuth)) ? Number(bus.Azimuth) : 0,
    status: BUS_STATUS_LABELS[bus.BusStatus] || '狀態未知',
    direction: bus.Direction ?? null,
    currentStopUid: bus.StopUID || bus.StopID || '',
    stopSequence: Number(bus.StopSequence) || null,
    updateTime: bus.GPSTime || bus.UpdateTime || null,
    distanceMeters: null
  };
}

function persistNationwideBusSnapshot() {
  try {
    fs.mkdirSync(path.dirname(BUS_REALTIME_CACHE_FILE), { recursive: true });
    const temporaryFile = `${BUS_REALTIME_CACHE_FILE}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(nationwideBusSnapshot));
    fs.renameSync(temporaryFile, BUS_REALTIME_CACHE_FILE);
  } catch (error) {
    console.error('Unable to persist nationwide bus cache:', error.message);
  }
}

function nationwideBusSources() {
  const citySources = Object.entries(TDX_CITY_BY_PORTAL_CODE)
    .map(([portalCityCode, tdxCity]) => ({ portalCityCode, tdxCity, interCity: false }));
  const defaultIndex = citySources.findIndex((source) => source.portalCityCode === PORTAL_CONFIG.defaultCity);
  if (defaultIndex > 0) citySources.unshift(citySources.splice(defaultIndex, 1)[0]);
  citySources.push({ portalCityCode: 'InterCity', tdxCity: 'InterCity', interCity: true });
  return citySources;
}

async function fetchNationwideBusSource(source) {
  if (!source.interCity) {
    return fetchTdxCity('v2/Bus/RealTimeByFrequency/City', source.tdxCity, { '$top': 10000 }, 0, {
      forceRefresh: true,
      backgroundRefresh: false,
      trackActivity: false
    });
  }
  const url = new URL(`${TDX_API_ROOT}/v2/Bus/RealTimeByFrequency/InterCity`);
  url.searchParams.set('$top', '10000');
  url.searchParams.set('$format', 'JSON');
  return fetchTdxUrl(url, 0, { forceRefresh: true, backgroundRefresh: false, trackActivity: false });
}

async function refreshNationwideBusSnapshot() {
  if (nationwideBusRefreshPromise) return nationwideBusRefreshPromise;
  nationwideBusRefreshPromise = (async () => {
    const attemptedAt = new Date().toISOString();
    const nextByCity = { ...nationwideBusSnapshot.byCity };
    const sources = nationwideBusSources();
    const updatedSources = new Set();
    const startIndex = nationwideBusSnapshot.nextSourceIndex % sources.length;
    let nextSourceIndex = startIndex;
    for (let offset = 0; offset < sources.length; offset += 1) {
      const sourceIndex = (startIndex + offset) % sources.length;
      const source = sources[sourceIndex];
      try {
        const payload = await fetchNationwideBusSource(source);
        nextByCity[source.portalCityCode] = asArray(payload)
          .map((bus) => mapBusRealtime(bus, source.portalCityCode, source.tdxCity))
          .filter((bus) => Number.isFinite(bus.lat) && Number.isFinite(bus.lng));
        updatedSources.add(source.portalCityCode);
        nextSourceIndex = (sourceIndex + 1) % sources.length;
      } catch (error) {
        nextSourceIndex = sourceIndex;
        if (error.status === 429) break;
        nextSourceIndex = (sourceIndex + 1) % sources.length;
      }
    }
    const unavailableCities = sources.map((source) => source.portalCityCode)
      .filter((source) => !updatedSources.has(source));
    nationwideBusSnapshot = {
      observedAt: updatedSources.size ? new Date().toISOString() : nationwideBusSnapshot.observedAt,
      attemptedAt,
      byCity: nextByCity,
      unavailableCities,
      updateSequence: nationwideBusSnapshot.updateSequence + 1,
      nextSourceIndex
    };
    persistNationwideBusSnapshot();
    const totalBuses = Object.values(nextByCity).reduce((total, buses) => total + buses.length, 0);
    console.log(`Nationwide bus snapshot: ${totalBuses} buses, ${updatedSources.size}/${sources.length} sources updated, next source ${sources[nextSourceIndex].portalCityCode}`);
    return nationwideBusSnapshot;
  })().finally(() => {
    nationwideBusRefreshPromise = null;
  });
  return nationwideBusRefreshPromise;
}

function startNationwideBusRefresh() {
  refreshNationwideBusSnapshot().catch((error) => console.error('Nationwide bus refresh failed:', error.message));
  nationwideBusRefreshTimer = setInterval(() => {
    refreshNationwideBusSnapshot().catch((error) => console.error('Nationwide bus refresh failed:', error.message));
  }, BUS_REFRESH_INTERVAL_MS);
  nationwideBusRefreshTimer.unref?.();
}

async function proxyBus(requestUrl, response) {
  const scope = requestUrl.searchParams.get('scope') || 'nearby';
  const allBuses = Object.values(nationwideBusSnapshot.byCity).flat();
  const rateLimited = areAllTdxCredentialsRateLimited();
  let data = allBuses;
  if (scope !== 'all') {
    try {
      const { lat, lng } = requireTaiwanCoordinates(requestUrl.searchParams);
      const requestedRadius = Number(requestUrl.searchParams.get('radius'));
      const radiusMeters = Number.isFinite(requestedRadius)
        ? Math.min(50_000, Math.max(1_000, requestedRadius))
        : 5_000;
      data = allBuses.map((bus) => ({
        ...bus,
        distanceMeters: Math.round(haversineMeters(lat, lng, bus.lat, bus.lng))
      })).filter((bus) => bus.distanceMeters <= radiusMeters);
    } catch (error) {
      sendApiError(response, error);
      return;
    }
  }
  sendJson(response, 200, {
    success: true,
    degraded: rateLimited || nationwideBusSnapshot.unavailableCities.length > 0,
    refreshing: Boolean(nationwideBusRefreshPromise),
    source: '交通部 TDX 全臺公車車機動態快照',
    observedAt: nationwideBusSnapshot.observedAt,
    attemptedAt: nationwideBusSnapshot.attemptedAt,
    refreshIntervalSeconds: BUS_REFRESH_INTERVAL_MS / 1000,
    updateSequence: nationwideBusSnapshot.updateSequence,
    totalBuses: allBuses.length,
    cityCounts: Object.fromEntries(Object.entries(nationwideBusSnapshot.byCity).map(([city, buses]) => [city, buses.length])),
    unavailableCities: nationwideBusSnapshot.unavailableCities,
    message: rateLimited
      ? '請求過多，請稍後再試'
      : nationwideBusSnapshot.unavailableCities.length
        ? '部分縣市本次更新失敗，保留上一次成功快照'
        : null,
    data
  });
}
async function proxyBusStops(requestUrl, response) {
  try {
    const { lat, lng } = requireTaiwanCoordinates(requestUrl.searchParams);
    const city = requireTdxCity(requestUrl.searchParams, lat, lng);
    const stopsPayload = await fetchTdxCity('v2/Bus/Stop/City', city, {
      '$top': 10000
    }, 24 * 60 * 60 * 1000);
    const stopMap = new Map();
    asArray(stopsPayload).map((stop) => mapBusStop(stop, { lat, lng }))
      .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng) && stop.distanceMeters <= 2_000)
      .forEach((stop) => {
        const key = `${stop.stopName}|${stop.lat.toFixed(4)}|${stop.lng.toFixed(4)}`;
        const existing = stopMap.get(key);
        if (existing) existing.stopUids.push(...stop.stopUids.filter((uid) => !existing.stopUids.includes(uid)));
        else stopMap.set(key, stop);
      });
    sendJson(response, 200, {
      success: true,
      source: '交通部 TDX 公車站牌長效快取',
      observedAt: new Date().toISOString(),
      data: [...stopMap.values()]
    });
  } catch (error) {
    if (error.status === 429) {
      sendJson(response, 200, {
        success: true,
        degraded: true,
        message: '請求過多，請稍後再試',
        source: '交通部 TDX 公車站牌降級模式',
        observedAt: new Date().toISOString(),
        data: []
      });
      return;
    }
    sendApiError(response, error);
  }
}

async function fetchBikeCityData(city, origin = null, includeAvailability = true) {
  const stationsPayload = await fetchTdxCity('v2/Bike/Station/City', city, {
    '$top': 5000
  }, 60 * 60 * 1000);
  let availabilityPayload = [];
  if (includeAvailability) {
    try {
      availabilityPayload = await fetchTdxCity('v2/Bike/Availability/City', city, { '$top': 5000 }, 5 * 60 * 1000);
    } catch (error) {
      console.error(`TDX ${city} YouBike availability unavailable; station locations are retained:`, error.message);
    }
  }
  const stations = asArray(stationsPayload, ['Stations']);
  const availability = asArray(availabilityPayload, ['Availabilities']);
  const availabilityByStation = new Map(availability.map((item) => [item.StationUID || item.StationID, item]));
  return stations.map((station) => {
    const position = positionOf(station);
    const current = availabilityByStation.get(station.StationUID || station.StationID) || {};
    return {
      stationName: localizedText(station.StationName),
      stationUid: station.StationUID || station.StationID,
      city,
      lat: position.lat,
      lng: position.lng,
      distanceMeters: origin
        ? Math.round(haversineMeters(origin.lat, origin.lng, position.lat, position.lng))
        : null,
      availableRentBikes: current.StationUID || current.StationID
        ? Number(current.AvailableRentBikes ?? current.AvailableRentBikesDetail?.GeneralBikes ?? 0)
        : null,
      availableReturnBikes: current.StationUID || current.StationID ? Number(current.AvailableReturnBikes ?? 0) : null,
      serviceStatus: current.ServiceStatus ?? null,
      updateTime: current.UpdateTime || station.UpdateTime || null
    };
  }).filter((item) => item.stationName && Number.isFinite(item.lat) && Number.isFinite(item.lng));
}

async function proxyBike(requestUrl, response) {
  try {
    const { lat, lng } = requireTaiwanCoordinates(requestUrl.searchParams);
    const city = requireTdxCity(requestUrl.searchParams, lat, lng);
    const data = (await fetchBikeCityData(city, { lat, lng }))
      .sort((left, right) => left.distanceMeters - right.distanceMeters);
    sendJson(response, 200, {
      success: true,
      source: '交通部 TDX 公共自行車即時動態',
      observedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    if (error.status === 429 && bikeStationDiskCache.length) {
      const { lat, lng } = requireTaiwanCoordinates(requestUrl.searchParams);
      const city = requireTdxCity(requestUrl.searchParams, lat, lng);
      const data = bikeStationDiskCache.map((station) => ({
        ...station,
        distanceMeters: Math.round(haversineMeters(lat, lng, station.lat, station.lng)),
        availableRentBikes: null,
        availableReturnBikes: null,
        serviceStatus: null,
        updateTime: null
      }))
        .filter((station) => station.distanceMeters <= 30_000)
        .sort((left, right) => left.distanceMeters - right.distanceMeters);
      sendJson(response, 200, {
        success: true,
        degraded: true,
        message: '請求過多，請稍後再試；目前顯示伺服器快取的 YouBike 站點位置',
        source: '交通部 TDX 公共自行車本機站點快取',
        observedAt: new Date().toISOString(),
        data
      });
      return;
    }
    sendApiError(response, error);
  }
}

async function proxyBikeAll(requestUrl, response) {
  try {
    const currentCity = TDX_CITY_BY_PORTAL_CODE[requestUrl.searchParams.get('city')] || null;
    if (bikeStationDiskCache.length) {
      let data = bikeStationDiskCache;
      let unavailableCities = [];
      if (currentCity) {
        try {
          const currentCityData = await fetchBikeCityData(currentCity);
          data = [...bikeStationDiskCache.filter((station) => station.city !== currentCity), ...currentCityData];
        } catch (error) {
          unavailableCities = [currentCity];
          console.error(`TDX ${currentCity} YouBike live data unavailable; disk cache is retained:`, error.message);
        }
      }
      sendJson(response, 200, {
        success: true,
        source: '交通部 TDX 全臺公共自行車站點與目前縣市即時動態',
        observedAt: new Date().toISOString(),
        data,
        unavailableCities,
        retryableCities: []
      });
      return;
    }
    const cities = [...new Set(Object.values(TDX_CITY_BY_PORTAL_CODE))];
    const results = await Promise.allSettled(cities.map((city) =>
      fetchBikeCityData(city, null, city === currentCity)));
    const data = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    const unavailableCities = results.flatMap((result, index) => result.status === 'rejected' ? [cities[index]] : []);
    const retryableCities = results.flatMap((result, index) => result.status === 'rejected'
      && (result.reason?.status === 429 || result.reason?.status >= 500)
      ? [cities[index]]
      : []);
    if (!retryableCities.length && data.length) {
      const cacheData = data.map((station) => ({
        ...station,
        availableRentBikes: null,
        availableReturnBikes: null,
        serviceStatus: null,
        updateTime: null
      }));
      const temporaryFile = `${BIKE_STATION_CACHE_FILE}.tmp`;
      fs.writeFileSync(temporaryFile, JSON.stringify(cacheData));
      fs.renameSync(temporaryFile, BIKE_STATION_CACHE_FILE);
      bikeStationDiskCache = cacheData;
    }
    sendJson(response, 200, {
      success: true,
      source: '交通部 TDX 全臺公共自行車即時動態',
      observedAt: new Date().toISOString(),
      data,
      unavailableCities,
      retryableCities
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

function finiteNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parkingSpaceTotal(entries, field) {
  if (!Array.isArray(entries) || !entries.length) return null;
  const values = entries.map((entry) => finiteNumberOrNull(entry?.[field])).filter(Number.isFinite);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

async function fetchParkingCityData(city, origin, radiusMeters) {
  const parkingLotsPayload = await fetchTdxCity('v1/Parking/OffStreet/ParkingLot/City', city, {
    '$top': 10000
  }, TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS);
  let availabilityPayload = [];
  try {
    availabilityPayload = await fetchTdxCity('v1/Parking/OffStreet/ParkingAvailability/City', city, {
      '$top': 10000
    }, TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS);
  } catch (error) {
    console.error(`TDX ${city} parking availability unavailable; parking locations are retained:`, error.message);
  }

  const parkingLots = asArray(parkingLotsPayload, ['ParkingLots', 'CarParks']);
  const availability = asArray(availabilityPayload, ['ParkingAvailabilities', 'Availabilities']);
  const availabilityById = new Map(availability.map((item) => [item.CarParkID || item.ParkingLotID, item]));
  return parkingLots.map((parkingLot) => {
    const parkingId = parkingLot.CarParkID || parkingLot.ParkingLotID || parkingLot.CarParkUID || '';
    const position = positionOf(parkingLot);
    const current = availabilityById.get(parkingId) || {};
    const spaces = asArray(current.Availabilities);
    const totalSpaces = finiteNumberOrNull(current.TotalSpaces ?? parkingLot.TotalSpaces)
      ?? parkingSpaceTotal(spaces, 'NumberOfSpaces');
    const availableSpaces = finiteNumberOrNull(current.AvailableSpaces)
      ?? parkingSpaceTotal(spaces, 'AvailableSpaces');
    const distanceMeters = Math.round(haversineMeters(origin.lat, origin.lng, position.lat, position.lng));
    return {
      parkingId,
      parkingName: localizedText(parkingLot.CarParkName || parkingLot.ParkingLotName) || '未命名停車場',
      city,
      lat: position.lat,
      lng: position.lng,
      distanceMeters,
      address: localizedText(parkingLot.Address) || String(parkingLot.Address || ''),
      telephone: String(parkingLot.Telephone || parkingLot.Phone || ''),
      fareDescription: localizedText(parkingLot.FareDescription) || String(parkingLot.FareDescription || ''),
      serviceTime: String(parkingLot.ServiceTime || ''),
      totalSpaces,
      availableSpaces,
      serviceStatus: finiteNumberOrNull(current.ServiceStatus ?? parkingLot.ServiceStatus),
      fullStatus: finiteNumberOrNull(current.FullStatus),
      updateTime: current.DataCollectTime || current.UpdateTime || parkingLot.UpdateTime || null
    };
  }).filter((parkingLot) => parkingLot.parkingId
    && Number.isFinite(parkingLot.lat)
    && Number.isFinite(parkingLot.lng)
    && parkingLot.distanceMeters <= radiusMeters)
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
}

async function proxyParking(requestUrl, response) {
  try {
    const { lat, lng } = requireTaiwanCoordinates(requestUrl.searchParams);
    const city = requireTdxCity(requestUrl.searchParams, lat, lng);
    const requestedRadius = Number(requestUrl.searchParams.get('radius'));
    const radiusMeters = Number.isFinite(requestedRadius)
      ? Math.min(50_000, Math.max(1_000, requestedRadius))
      : 10_000;
    const data = await fetchParkingCityData(city, { lat, lng }, radiusMeters);
    sendJson(response, 200, {
      success: true,
      source: '交通部 TDX 路外停車場與剩餘車位',
      observedAt: new Date().toISOString(),
      refreshIntervalSeconds: TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS / 1000,
      data
    });
  } catch (error) {
    if (error.status === 429) {
      sendJson(response, 200, {
        success: true,
        degraded: true,
        message: '請求過多，請稍後再試；目前暫無停車場即時資料',
        source: '交通部 TDX 停車場降級模式',
        observedAt: new Date().toISOString(),
        refreshIntervalSeconds: TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS / 1000,
        data: []
      });
      return;
    }
    sendApiError(response, error);
  }
}

async function proxyRoadNetwork(requestUrl, response) {
  try {
    const south = Number(requestUrl.searchParams.get('south'));
    const west = Number(requestUrl.searchParams.get('west'));
    const north = Number(requestUrl.searchParams.get('north'));
    const east = Number(requestUrl.searchParams.get('east'));
    const zoom = Number(requestUrl.searchParams.get('zoom'));
    if (![south, west, north, east].every(Number.isFinite)
      || south < 21.5 || north > 26 || west < 119 || east > 122.5
      || south >= north || west >= east) {
      throw new UpstreamError('Valid Taiwan viewport bounds are required', 400);
    }
    const highwayClasses = zoom >= 15
      ? 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service'
      : zoom >= 13
        ? 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street'
        : zoom >= 11
          ? 'motorway|trunk|primary|secondary|tertiary'
          : 'motorway|trunk|primary';
    const roundedBounds = [south, west, north, east].map((value) => value.toFixed(4));
    const cacheKey = `${roundedBounds.join(',')}|${highwayClasses}`;
    const cached = roadNetworkCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      sendJson(response, 200, cached.payload);
      return;
    }
    const selectors = zoom >= 14
      ? `way["highway"](${roundedBounds.join(',')});`
      : highwayClasses.split('|')
        .map((highway) => `way["highway"="${highway}"](${roundedBounds.join(',')});`)
        .join('');
    const query = `[out:json][timeout:35];(${selectors});out tags geom;`;
    let payload = null;
    let lastError = null;
    for (const overpassEndpoint of OVERPASS_FALLBACK_ENDPOINTS) {
      try {
        payload = await fetchJson(overpassEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Accept: 'application/json',
            'User-Agent': 'TaiwanSmartLifePortal/1.0 (local development application)'
          },
          body: new URLSearchParams({ data: query })
        }, 50_000);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!payload) throw lastError || new UpstreamError('Road network service is unavailable', 502);
    const allowedHighways = new Set(highwayClasses.split('|'));
    const roads = asArray(payload, ['elements']).filter((way) => allowedHighways.has(way.tags?.highway)).map((way) => ({
      id: way.id,
      roadName: way.tags?.name || way.tags?.ref || '未命名道路',
      highway: way.tags?.highway || '',
      line: (way.geometry || []).map((point) => [Number(point.lat), Number(point.lon)])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
    })).filter((road) => road.line.length >= 2);
    const result = {
      success: true,
      source: 'OpenStreetMap Overpass 道路線形',
      observedAt: new Date().toISOString(),
      data: { roads }
    };
    roadNetworkCache.set(cacheKey, { payload: result, expiresAt: Date.now() + 5 * 60 * 1000 });
    sendJson(response, 200, result);
  } catch (error) {
    sendApiError(response, error);
  }
}

async function proxyTraffic(requestUrl, response) {
  try {
    const { lat, lng } = requireTaiwanCoordinates(requestUrl.searchParams);
    const city = requireTdxCity(requestUrl.searchParams, lat, lng);
    const requestedRadius = Number(requestUrl.searchParams.get('radius'));
    const radiusMeters = Number.isFinite(requestedRadius) ? Math.min(30_000, Math.max(1000, requestedRadius)) : 5000;
    const sectionsPayload = await fetchTdxCity('v2/Road/Traffic/Section/City', city, {}, 60 * 60 * 1000);
    const shapesPayload = await fetchTdxCity('v2/Road/Traffic/SectionShape/City', city, {}, 60 * 60 * 1000);
    const livePayload = await fetchTdxCity('v2/Road/Traffic/Live/City', city);
    const sections = asArray(sectionsPayload, ['Sections']);
    const shapes = asArray(shapesPayload, ['SectionShapes']);
    const liveItems = asArray(livePayload, ['LiveTraffics']);
    const sectionById = new Map(sections.map((section) => [section.SectionID, section]));
    const liveById = new Map(liveItems.map((item) => [item.SectionID, item]));
    const roads = shapes.map((shape) => {
      const lines = parseWktLines(shape.Geometry);
      const isNearby = lines.some((line) => line.some(([roadLat, roadLng]) =>
        haversineMeters(lat, lng, roadLat, roadLng) <= radiusMeters));
      if (!isNearby) return null;
      const section = sectionById.get(shape.SectionID) || {};
      const live = liveById.get(shape.SectionID) || {};
      const speed = Number(live.TravelSpeed);
      const status = trafficStatus(live.CongestionLevel, speed);
      return {
        sectionId: shape.SectionID,
        roadName: section.RoadName || section.SectionName || shape.SectionID,
        sectionName: section.SectionName || '',
        lines,
        speed: Number.isFinite(speed) && speed >= 0 ? speed : null,
        congestionLevel: live.CongestionLevel ?? null,
        status: status.key,
        statusLabel: status.label,
        updateTime: live.DataCollectTime || livePayload.UpdateTime || null
      };
    }).filter(Boolean);
    sendJson(response, 200, {
      success: true,
      source: '交通部 TDX 道路交通即時資訊',
      observedAt: new Date().toISOString(),
      data: { roads }
    });
  } catch (error) {
    if (error.status === 429) {
      sendJson(response, 200, {
        success: true,
        degraded: true,
        message: '請求過多，請稍後再試；目前暫無即時壅塞資料',
        source: '交通部 TDX 道路交通降級模式',
        observedAt: new Date().toISOString(),
        data: { roads: [] }
      });
      return;
    }
    sendApiError(response, error);
  }
}

async function fetchDataGovCategory(cityTid, category) {
  const requestBody = {
    bool: [{ 'local_government_level_1.tid': { value: [cityTid] } }],
    filter: [{ fields: 'category_tid', query: category.tid }],
    page_num: 1,
    page_limit: 3,
    tids: [],
    sort: 'resource_download_times_desc'
  };
  const payload = await fetchJson(DATA_GOV_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(requestBody)
  }, 30_000);
  const results = payload.payload?.search_result || [];
  return {
    ...category,
    datasets: results.map((dataset) => ({
      nid: dataset.nid,
      title: dataset.title || '',
      agencyName: dataset.agency_name || '',
      summary: String(dataset.content || dataset.dataset_resource_note || dataset.dataset_resource_description || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 600),
      updatedAt: dataset.changed?.date || dataset.metadata_changed?.date || null,
      sourceUrl: dataset.nid ? `https://data.gov.tw/dataset/${dataset.nid}` : null
    }))
  };
}

async function proxyOfficialReports(requestUrl, response) {
  try {
    const cityTid = Number(requestUrl.searchParams.get('cityTid'));
    if (!Number.isInteger(cityTid) || cityTid <= 0) throw new UpstreamError('cityTid must be a positive integer', 400);
    const results = await Promise.allSettled(
      OFFICIAL_REPORT_CATEGORIES.map((category) => fetchDataGovCategory(cityTid, category))
    );
    const data = results.map((result, index) => result.status === 'fulfilled'
      ? result.value
      : { ...OFFICIAL_REPORT_CATEGORIES[index], datasets: [], error: result.reason.message });
    sendJson(response, 200, {
      success: true,
      source: '政府資料開放平臺 data.gov.tw',
      observedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

async function proxyDatasetSearch(request, response) {
  try {
    const { body } = await readJsonBody(request);
    const upstream = await fetch(DATA_GOV_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body
    });
    const content = await upstream.text();
    response.writeHead(upstream.status, {
      ...corsHeaders(),
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(content);
  } catch (error) {
    sendApiError(response, error);
  }
}

function serveStatic(request, response) {
  const requestPath = request.url === '/' ? '/index.html' : new URL(request.url, REQUEST_BASE_ORIGIN).pathname;
  const relativePath = decodeURIComponent(requestPath).replace(/^[/\\]+/, '');
  const isPublicFile = PUBLIC_STATIC_FILES.has(relativePath) || relativePath.startsWith('images/');
  if (!isPublicFile) {
    response.writeHead(404).end('Not found');
    return;
  }
  const filePath = path.resolve(ROOT, relativePath);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      ...corsHeaders(),
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, REQUEST_BASE_ORIGIN);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders()).end();
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/status') {
    sendJson(response, 200, {
      success: true,
      environmentFileLoaded,
      cwaDatasetCandidates: CWA_DATASET_IDS,
      credentials: {
        cwa: Boolean(process.env.CWA_API_KEY),
        tdxClientId: Boolean(process.env.TDX_CLIENT_ID),
        tdxClientSecret: Boolean(process.env.TDX_CLIENT_SECRET),
        tdxConfigured: tdxCredentials.length > 0,
        tdxCredentialCount: tdxCredentials.length,
        tdxAvailableCredentialCount: tdxCredentials
          .filter((credential) => Date.now() >= credential.rateLimitedUntil).length
      },
      tdxRefreshIntervalSeconds: TDX_REFRESH_INTERVAL_MS / 1000,
      tdxTrafficBikeRefreshIntervalSeconds: TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS / 1000,
      tdxParkingRefreshIntervalSeconds: TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS / 1000
    });
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/data-gov/datasets') {
    await proxyDatasetSearch(request, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/geocode/reverse') {
    await proxyReverseGeocode(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/geocode/search') {
    await proxyGeocodeSearch(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/weather') {
    await proxyWeather(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/safety') {
    await proxySafetyInformation(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/tdx/bus') {
    await proxyBus(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/tdx/bus-stops') {
    await proxyBusStops(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/tdx/bus-details') {
    await proxyBusDetails(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/tdx/bus-stop-details') {
    await proxyBusStopDetails(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/tdx/bike') {
    await proxyBike(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/tdx/bike-all') {
    await proxyBikeAll(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/tdx/parking') {
    await proxyParking(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/map/roads') {
    await proxyRoadNetwork(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/tdx/traffic') {
    await proxyTraffic(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/data-gov/reports') {
    await proxyOfficialReports(requestUrl, response);
    return;
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    serveStatic(request, response);
    return;
  }
  response.writeHead(405, { ...corsHeaders(), Allow: 'GET, HEAD, POST, OPTIONS' }).end('Method not allowed');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Start with another port, for example: $env:PORT=4175; node server.js`);
  } else {
    console.error('Server startup failed:', error);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`Taiwan Smart Life portal: ${LOCAL_ORIGIN}`);
  console.log(`Environment file: ${environmentFileLoaded ? 'loaded .env' : 'no .env file'}`);
  console.log(`CWA datasets: ${CWA_DATASET_IDS.join(', ')}`);
  console.log(`CWA weather: ${process.env.CWA_API_KEY ? 'configured' : 'missing CWA_API_KEY'}`);
  console.log(`TDX transport: ${tdxCredentials.length ? `${tdxCredentials.length} credential pair(s) configured` : 'missing TDX credentials'}`);
  startTdxCacheRefresh();
  startNationwideBusRefresh();
});
