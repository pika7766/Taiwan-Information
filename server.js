

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

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
const PORTAL_CONTENT_FILE = process.env.PORTAL_CONTENT_FILE
  || path.join(ROOT, 'data', 'portal-content.json');
const CWA_EMERGENCY_REFRESH_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.CWA_EMERGENCY_REFRESH_INTERVAL_MS) || 60_000
);
const CWA_EMERGENCY_DATASET_IDS = (process.env.CWA_EMERGENCY_DATASET_IDS
  || 'W-C0033-001,E-A0015-001')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const FCM_TOPIC = String(process.env.FCM_TOPIC || 'taiwan-smart-life-information')
  .trim().replace(/[^a-zA-Z0-9-_.~%]/g, '-').slice(0, 900);
const FCM_TOKEN_ENDPOINT = process.env.FCM_TOKEN_ENDPOINT || 'https://oauth2.googleapis.com/token';
const FCM_API_ROOT = String(process.env.FCM_API_ROOT || 'https://fcm.googleapis.com').replace(/\/$/, '');
const JOURNEY_GRAPH_CACHE_FILE = process.env.JOURNEY_GRAPH_CACHE_FILE
  || path.join(ROOT, 'journey_graph_cache.json');
const JOURNEY_GRAPH_CACHE_VERSION = 2;
const JOURNEY_GRAPH_MAX_STALE_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.JOURNEY_GRAPH_MAX_STALE_MS) || 24 * 60 * 60 * 1000
);
const TDX_REFRESH_INTERVAL_MS = Math.max(1_000, Number(process.env.TDX_REFRESH_INTERVAL_MS) || 5_000);
const TDX_DYNAMIC_REFRESH_INTERVAL_MS = Math.max(
  1_000,
  Number(process.env.TDX_DYNAMIC_REFRESH_INTERVAL_MS) || 12 * 1000
);
const TDX_STATIC_REFRESH_INTERVAL_MS = Math.max(
  TDX_DYNAMIC_REFRESH_INTERVAL_MS,
  Number(process.env.TDX_STATIC_REFRESH_INTERVAL_MS) || 5 * 60 * 1000
);
const JOURNEY_STATIC_REFRESH_INTERVAL_MS = TDX_STATIC_REFRESH_INTERVAL_MS;
const JOURNEY_LIVE_REFRESH_INTERVAL_MS = TDX_DYNAMIC_REFRESH_INTERVAL_MS;
const JOURNEY_GRAPH_ACTIVE_WINDOW_MS = Math.max(
  JOURNEY_STATIC_REFRESH_INTERVAL_MS * 3,
  Number(process.env.JOURNEY_GRAPH_ACTIVE_WINDOW_MS) || 30 * 60 * 1000
);
const JOURNEY_BOOKING_WINDOW_DAYS = Math.min(
  60,
  Math.max(1, Number(process.env.JOURNEY_BOOKING_WINDOW_DAYS) || 28)
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
const BUS_REFRESH_INTERVAL_MS = TDX_DYNAMIC_REFRESH_INTERVAL_MS;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '7766';
const ADMIN_SESSION_TTL_MS = Math.max(60_000, Number(process.env.ADMIN_SESSION_TTL_MS) || 12 * 60 * 60 * 1000);
const PORTAL_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'api_config.json'), 'utf8').replace(/^\uFEFF/, ''));
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 4174;
const LOCAL_ORIGIN = `http://127.0.0.1:${PORT}`;
const REQUEST_BASE_ORIGIN = 'http://localhost';
const DATA_GOV_ENDPOINT = 'https://data.gov.tw/api/front/dataset/list';
const CWA_DATASTORE_ROOT = process.env.CWA_DATASTORE_ROOT
  || 'https://opendata.cwa.gov.tw/api/v1/rest/datastore';
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
const METRO_SYSTEM_LABELS = {
  TRTC: '臺北捷運', KRTC: '高雄捷運', KLRT: '高雄輕軌', TYMC: '桃園捷運',
  TMRT: '臺中捷運', NTMC: '新北捷運', NTDLRT: '淡海輕軌', NTALRT: '安坑輕軌'
};
const METRO_SYSTEMS_BY_CITY = {
  Taipei: ['TRTC'],
  NewTaipei: ['TRTC', 'NTMC', 'NTDLRT', 'NTALRT'],
  Taoyuan: ['TYMC'],
  Taichung: ['TMRT'],
  Kaohsiung: ['KRTC', 'KLRT']
};
const TRA_CITY_ORDER = [
  '基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市',
  '彰化縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '臺東縣',
  '花蓮縣', '宜蘭縣'
];
const EASTERN_TRA_CITIES = new Set(['臺東縣', '花蓮縣', '宜蘭縣']);
const OFFICIAL_TAIWAN_CITY_NAMES = [...new Set(
  Object.values(PORTAL_CONFIG.cities || {}).map((city) => normalizePlaceName(city.cityName)).filter(Boolean)
)];
const TAIWAN_CITY_NAME_ALIASES = new Map([
  ['臺北縣', '新北市'], ['桃園縣', '桃園市'], ['臺中縣', '臺中市'],
  ['臺南縣', '臺南市'], ['高雄縣', '高雄市']
]);
const TDX_TOKEN_ENDPOINT = process.env.TDX_TOKEN_ENDPOINT
  || 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const NOMINATIM_ENDPOINT = process.env.NOMINATIM_ENDPOINT || 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const OVERPASS_FALLBACK_ENDPOINTS = [OVERPASS_ENDPOINT, 'https://overpass.kumi.systems/api/interpreter'];
const GRAPHHOPPER_API_ROOT = String(
  process.env.GRAPHHOPPER_API_ROOT || 'https://graphhopper.com/api/1/route'
).replace(/\/$/, '');
const GRAPHHOPPER_RATE_LIMIT_COOLDOWN_MS = Math.max(
  60_000,
  Number(process.env.GRAPHHOPPER_RATE_LIMIT_COOLDOWN_MS) || 15 * 60 * 1000
);
const ROUTING_CACHE_MS = Math.max(60_000, Number(process.env.ROUTING_CACHE_MS) || 5 * 60 * 1000);
const ROUTE_PLANNER_RESULT_CACHE_MS = Math.max(
  5_000,
  Number(process.env.ROUTE_PLANNER_RESULT_CACHE_MS) || JOURNEY_LIVE_REFRESH_INTERVAL_MS
);
const ROUTE_PLANNER_TIMEOUT_MS = Math.min(
  25_000,
  Math.max(5_000, Number(process.env.ROUTE_PLANNER_TIMEOUT_MS) || 20_000)
);
const ROUTE_PLANNER_MULTIMODAL_SPEC_LIMIT = Math.min(
  24,
  Math.max(6, Number(process.env.ROUTE_PLANNER_MULTIMODAL_SPEC_LIMIT) || 16)
);
const JOURNEY_FARE_INITIAL_WAIT_MS = Math.min(
  5_000,
  Math.max(250, Number(process.env.JOURNEY_FARE_INITIAL_WAIT_MS) || 1_500)
);
const ETA_TRACE_LOG_FILE = path.join(ROOT, 'test-eta-trace.log');

function normalizeStopFilter(stopFilter) {
  const raw = String(stopFilter || '');
  const uidMatches = Array.from(raw.matchAll(/StopUID eq '([^']+)'/g)).map((m) => m[1]);
  const uniqueSorted = Array.from(new Set(uidMatches)).sort();
  const normalized = uniqueSorted.length
    ? uniqueSorted.map((uid) => `StopUID eq '${String(uid).replaceAll("'", "''")}'`).join(' or ')
    : raw;
  return { raw, normalized, uids: uniqueSorted };
}

function appendEtaTrace(line) {
  try {
    fs.appendFileSync(ETA_TRACE_LOG_FILE, `${line}\n`, 'utf8');
  } catch (error) {
    /* ignore logging failures */
  }
}

function etaTrace(event) {
  const stack = new Error().stack || '';
  const caller = stack.split('\n').slice(2, 6).map((line) => line.trim()).join(' | ');
  const payload = {
    timestamp: new Date().toISOString(),
    caller,
    ...event
  };
  appendEtaTrace(JSON.stringify(payload));
}

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
const tdxCredentialPools = {
  primary: tdxCredentials.filter((credential) => credential.pool === 'primary'),
  reserve: tdxCredentials.filter((credential) => credential.pool === 'reserve')
};
const activeTdxCredentialIndexes = { primary: 0, reserve: 0 };
let lastCredentialSwitchAt = 0;
let backgroundPoolPausedUntil = 0; // when set, background tasks should pause using primary pool
function isBackgroundPoolPaused() {
  return Date.now() < backgroundPoolPausedUntil;
}
const graphHopperApiKeys = loadGraphHopperApiKeys();
let activeGraphHopperApiKeyIndex = 0;
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
const routePlannerCache = new Map();
const routePlannerResultCache = new Map();
const roadRoutingPayloadCache = new Map();
const journeyBusEtaOverlayCache = new Map();
const busJourneyDerivedCache = new WeakMap();
const journeyStationDerivedCache = new WeakMap();
const railJourneyDerivedCache = new WeakMap();
const busJourneyNetworkCache = new Map();
const railJourneyNetworkCache = new Map();
const metroJourneyNetworkCache = new Map();
let journeyGraphDiskCache = {
  version: JOURNEY_GRAPH_CACHE_VERSION,
  savedAt: null,
  bus: {},
  rail: {},
  metro: {}
};
let journeyGraphPersistTimer = null;
let journeyGraphPersistPromise = null;
let journeyGraphRefreshTimer = null;
const TDX_RESPONSE_CACHE_MS = TDX_DYNAMIC_REFRESH_INTERVAL_MS;
let tdxRequestQueue = Promise.resolve();
let lastTdxRequestAt = 0;
const createTdxQueue = require('./tdxQueue');
const tdxQueue = createTdxQueue({
  maxConcurrency: Math.max(2, Math.min(3, Number(process.env.TDX_MAX_CONCURRENCY) || 3)),
  spacingMs: Math.max(150, Math.min(200, Number(process.env.TDX_REQUEST_SPACING_MS) || 180))
});
const tdxPriorityStorage = new AsyncLocalStorage();

function resolveTdxPriority(options = {}) {
  if (options.priority) return options.priority;
  const storePriority = tdxPriorityStorage.getStore();
  if (storePriority) return storePriority;
  return options.backgroundRefresh === false ? 'high' : 'low';
}

function runWithTdxPriority(priority, task) {
  return tdxPriorityStorage.run(priority, task);
}
let tdxCacheRefreshPromise = null;
let tdxCacheRefreshTimer = null;
const adminSessions = new Map();
const adminLoginAttempts = new Map();
let portalContent = loadPortalContent();
let portalContentPersistQueue = Promise.resolve();
let cwaEmergencyRefreshTimer = null;
let cwaEmergencyRefreshPromise = null;
const defaultServiceSettings = {
  tdxFetchingEnabled: !/^(?:0|false|off)$/i.test(process.env.TDX_FETCH_ENABLED || 'true'),
  cwaFetchingEnabled: !/^(?:0|false|off)$/i.test(process.env.CWA_FETCH_ENABLED || 'true'),
  dataGovFetchingEnabled: !/^(?:0|false|off)$/i.test(process.env.DATA_GOV_FETCH_ENABLED || 'true')
};
const initialServiceSettings = portalContent.settings || {};
let tdxFetchingEnabled = typeof initialServiceSettings.tdxFetchingEnabled === 'boolean'
  ? initialServiceSettings.tdxFetchingEnabled : defaultServiceSettings.tdxFetchingEnabled;
let tdxFetchingChangedAt = initialServiceSettings.tdxFetchingChangedAt || new Date().toISOString();
let cwaFetchingEnabled = typeof initialServiceSettings.cwaFetchingEnabled === 'boolean'
  ? initialServiceSettings.cwaFetchingEnabled : defaultServiceSettings.cwaFetchingEnabled;
let cwaFetchingChangedAt = initialServiceSettings.cwaFetchingChangedAt || new Date().toISOString();
let dataGovFetchingEnabled = typeof initialServiceSettings.dataGovFetchingEnabled === 'boolean'
  ? initialServiceSettings.dataGovFetchingEnabled : defaultServiceSettings.dataGovFetchingEnabled;
let dataGovFetchingChangedAt = initialServiceSettings.dataGovFetchingChangedAt || new Date().toISOString();
const fcmServiceAccount = loadFcmServiceAccount();
const fcmProjectId = String(process.env.FCM_PROJECT_ID || fcmServiceAccount?.project_id || '').trim();
let fcmAccessToken = null;
let portalNotificationQueue = Promise.resolve();
let lastFcmNotification = null;

function loadPortalContent() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PORTAL_CONTENT_FILE, 'utf8'));
    return {
      version: 2,
      announcements: Array.isArray(parsed?.announcements) ? parsed.announcements : [],
      emergencies: Array.isArray(parsed?.emergencies) ? parsed.emergencies : [],
      emergencyObservedAt: parsed?.emergencyObservedAt || null,
      settings: parsed?.settings && typeof parsed.settings === 'object' ? parsed.settings : {}
    };
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Unable to read portal content:', error.message);
    return { version: 2, announcements: [], emergencies: [], emergencyObservedAt: null, settings: {} };
  }
}

function loadFcmServiceAccount() {
  try {
    if (process.env.FCM_SERVICE_ACCOUNT_FILE) {
      return JSON.parse(fs.readFileSync(process.env.FCM_SERVICE_ACCOUNT_FILE, 'utf8'));
    }
    if (process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64) {
      return JSON.parse(Buffer.from(process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf8'));
    }
    if (process.env.FCM_SERVICE_ACCOUNT_JSON) {
      return JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON);
    }
    if (process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY) {
      return {
        project_id: process.env.FCM_PROJECT_ID,
        client_email: process.env.FCM_CLIENT_EMAIL,
        private_key: process.env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n')
      };
    }
  } catch (error) {
    console.error('Unable to load FCM service account:', error.message);
  }
  return null;
}

function serviceSettingsSnapshot() {
  return {
    tdxFetchingEnabled,
    tdxFetchingChangedAt,
    cwaFetchingEnabled,
    cwaFetchingChangedAt,
    dataGovFetchingEnabled,
    dataGovFetchingChangedAt
  };
}

function syncServiceSettingsToPortalContent() {
  portalContent.settings = serviceSettingsSnapshot();
}

function persistPortalContent() {
  const snapshot = JSON.stringify(portalContent, null, 2);
  const operation = portalContentPersistQueue.catch(() => undefined).then(async () => {
    await fs.promises.mkdir(path.dirname(PORTAL_CONTENT_FILE), { recursive: true });
    const temporaryFile = `${PORTAL_CONTENT_FILE}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(temporaryFile, snapshot, 'utf8');
    await fs.promises.rename(temporaryFile, PORTAL_CONTENT_FILE);
  });
  portalContentPersistQueue = operation.catch((error) => {
    console.error('Unable to persist portal content:', error.message);
  });
  return operation;
}

try {
  const snapshot = JSON.parse(fs.readFileSync(JOURNEY_GRAPH_CACHE_FILE, 'utf8'));
  if (snapshot?.version === JOURNEY_GRAPH_CACHE_VERSION) {
    journeyGraphDiskCache = {
      version: JOURNEY_GRAPH_CACHE_VERSION,
      savedAt: snapshot.savedAt || null,
      bus: snapshot.bus && typeof snapshot.bus === 'object' ? snapshot.bus : {},
      rail: snapshot.rail && typeof snapshot.rail === 'object' ? snapshot.rail : {},
      metro: snapshot.metro && typeof snapshot.metro === 'object' ? snapshot.metro : {}
    };
  }
} catch (error) {
  if (error.code !== 'ENOENT') console.error('Unable to read journey graph cache:', error.message);
}

function pruneJourneyGraphDiskCache() {
  const trim = (records, limit) => Object.fromEntries(
    Object.entries(records || {})
      .sort(([, left], [, right]) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0))
      .slice(0, limit)
  );
  journeyGraphDiskCache.bus = trim(journeyGraphDiskCache.bus, 8);
  journeyGraphDiskCache.rail = trim(journeyGraphDiskCache.rail, 12);
  journeyGraphDiskCache.metro = trim(journeyGraphDiskCache.metro, 6);
}

async function persistJourneyGraphDiskCache() {
  if (journeyGraphPersistPromise) return journeyGraphPersistPromise;
  journeyGraphDiskCache.savedAt = new Date().toISOString();
  pruneJourneyGraphDiskCache();
  const temporaryFile = `${JOURNEY_GRAPH_CACHE_FILE}.tmp`;
  const contents = JSON.stringify(journeyGraphDiskCache);
  journeyGraphPersistPromise = (async () => {
    await fs.promises.mkdir(path.dirname(JOURNEY_GRAPH_CACHE_FILE), { recursive: true });
    await fs.promises.writeFile(temporaryFile, contents, 'utf8');
    await fs.promises.rename(temporaryFile, JOURNEY_GRAPH_CACHE_FILE);
  })().catch((error) => {
    console.error('Unable to persist journey graph cache:', error.message);
  }).finally(() => {
    journeyGraphPersistPromise = null;
  });
  return journeyGraphPersistPromise;
}

function scheduleJourneyGraphPersistence() {
  clearTimeout(journeyGraphPersistTimer);
  journeyGraphPersistTimer = setTimeout(() => {
    persistJourneyGraphDiskCache().catch(() => undefined);
  }, 1_000);
  journeyGraphPersistTimer.unref?.();
}

function usableJourneyGraphSnapshot(section, key) {
  const snapshot = journeyGraphDiskCache[section]?.[key];
  const updatedAt = Date.parse(snapshot?.updatedAt || '');
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= JOURNEY_GRAPH_MAX_STALE_MS
    ? snapshot
    : null;
}

function pruneJourneyNetworkMemory(cache, limit) {
  if (cache.size <= limit) return;
  [...cache.entries()]
    .filter(([, entry]) => !entry.pending)
    .sort(([, left], [, right]) => left.lastAccessAt - right.lastAccessAt)
    .slice(0, Math.max(0, cache.size - limit))
    .forEach(([key]) => cache.delete(key));
}

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
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
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
  try {
    fs.appendFileSync(path.join(ROOT, 'server-error.log'), `${new Date().toISOString()} API request failed: ${error.stack || error.message}\n`);
  } catch (e) {
    // ignore
  }
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

function constantTimeEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function requestIp(request) {
  return String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || '')
    .split(',')[0].trim();
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || '').split(';').flatMap((part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return [];
    const rawValue = part.slice(separator + 1).trim();
    try {
      return [[part.slice(0, separator).trim(), decodeURIComponent(rawValue)]];
    } catch (error) {
      return [[part.slice(0, separator).trim(), rawValue]];
    }
  }));
}

function adminSessionFor(request) {
  const token = parseCookies(request).tdx_admin_session;
  if (!token) return null;
  const session = adminSessions.get(token);
  if (!session || Date.now() >= session.expiresAt) {
    adminSessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function adminSessionCookie(request, token, maxAgeSeconds) {
  const forwardedProtocol = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = forwardedProtocol === 'https' || request.socket.encrypted;
  return `tdx_admin_session=${encodeURIComponent(token)}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

function sendAdminUnauthorized(response) {
  sendJson(response, 401, { success: false, message: '管理員登入已失效，請重新登入' });
}

function adminStatusPayload() {
  return {
    success: true,
    authenticated: true,
    tdxFetchingEnabled,
    tdxFetchingChangedAt,
    cwaFetchingEnabled,
    cwaFetchingChangedAt,
    dataGovFetchingEnabled,
    dataGovFetchingChangedAt,
    tdxCredentialCount: tdxCredentials.length,
    tdxAvailableCredentialCount: tdxCredentials
      .filter((credential) => Date.now() >= credential.rateLimitedUntil).length,
    tdxPrimaryCredentialCount: tdxCredentialPools.primary.length,
    tdxPrimaryAvailableCredentialCount: availableTdxCredentialCount('primary'),
    tdxReserveCredentialCount: tdxCredentialPools.reserve.length,
    tdxReserveAvailableCredentialCount: availableTdxCredentialCount('reserve'),
    graphHopperApiKeyCount: graphHopperApiKeys.length,
    graphHopperAvailableApiKeyCount: graphHopperApiKeys
      .filter((apiKey) => Date.now() >= apiKey.rateLimitedUntil).length,
    queueStatus: tdxQueue.status(),
    fcmConfigured: Boolean(fcmProjectId && fcmServiceAccount?.client_email && fcmServiceAccount?.private_key),
    fcmProjectId,
    fcmTopic: FCM_TOPIC,
    lastFcmNotification,
    cachedTdxQueries: [...tdxResponseCache.values()].filter((entry) => entry.data).length,
    announcementCount: portalContent.announcements.length,
    announcements: portalContent.announcements,
    emergencyCount: portalContent.emergencies.length,
    nationwideBusObservedAt: nationwideBusSnapshot.observedAt,
    acquisitionScope: {
      cityDataIsCityScopedByTdx: true,
      nationwideSingleRequestAvailable: false,
      strategy: '完整縣市資料共用快取；全臺公車使用伺服器快照'
    }
  };
}

async function handleAdminLogin(request, response) {
  const ip = requestIp(request);
  const attempt = adminLoginAttempts.get(ip);
  if (attempt?.blockedUntil > Date.now()) {
    sendJson(response, 429, { success: false, message: '登入失敗次數過多，請稍後再試' });
    return;
  }

  try {
    const { parsed } = await readJsonBody(request);
    const valid = constantTimeEqual(parsed?.username, ADMIN_USERNAME)
      && constantTimeEqual(parsed?.password, ADMIN_PASSWORD);
    if (!valid) {
      const failures = (attempt?.failures || 0) + 1;
      adminLoginAttempts.set(ip, {
        failures: failures >= 5 ? 0 : failures,
        blockedUntil: failures >= 5 ? Date.now() + 15 * 60 * 1000 : 0
      });
      sendJson(response, 401, { success: false, message: '帳號或密碼錯誤' });
      return;
    }

    adminLoginAttempts.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    adminSessions.set(token, { username: ADMIN_USERNAME, expiresAt: Date.now() + ADMIN_SESSION_TTL_MS });
    sendJson(response, 200, adminStatusPayload(), {
      'Set-Cookie': adminSessionCookie(request, token, Math.floor(ADMIN_SESSION_TTL_MS / 1000))
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

function handleAdminStatus(request, response) {
  if (!adminSessionFor(request)) {
    sendAdminUnauthorized(response);
    return;
  }
  sendJson(response, 200, adminStatusPayload());
}

async function handleAdminTdxSetting(request, response) {
  if (!adminSessionFor(request)) {
    sendAdminUnauthorized(response);
    return;
  }
  try {
    const { parsed } = await readJsonBody(request);
    if (typeof parsed?.enabled !== 'boolean') {
      throw new UpstreamError('enabled must be a boolean', 400);
    }
    const previous = { enabled: tdxFetchingEnabled, changedAt: tdxFetchingChangedAt };
    tdxFetchingEnabled = parsed.enabled;
    tdxFetchingChangedAt = new Date().toISOString();
    syncServiceSettingsToPortalContent();
    try {
      await persistPortalContent();
    } catch (error) {
      tdxFetchingEnabled = previous.enabled;
      tdxFetchingChangedAt = previous.changedAt;
      syncServiceSettingsToPortalContent();
      throw error;
    }
    sendJson(response, 200, adminStatusPayload());
    if (tdxFetchingEnabled) {
      refreshActiveTdxCache().catch((error) => console.error('TDX cache resume failed:', error.message));
      refreshNationwideBusSnapshot().catch((error) => console.error('Nationwide bus resume failed:', error.message));
      refreshActiveJourneyGraphs().catch((error) => console.error('Journey graph resume failed:', error.message));
    }
  } catch (error) {
    sendApiError(response, error);
  }
}

async function handleAdminCwaSetting(request, response) {
  if (!adminSessionFor(request)) {
    sendAdminUnauthorized(response);
    return;
  }
  try {
    const { parsed } = await readJsonBody(request);
    if (typeof parsed?.enabled !== 'boolean') {
      throw new UpstreamError('enabled must be a boolean', 400);
    }
    const previous = { enabled: cwaFetchingEnabled, changedAt: cwaFetchingChangedAt };
    cwaFetchingEnabled = parsed.enabled;
    cwaFetchingChangedAt = new Date().toISOString();
    syncServiceSettingsToPortalContent();
    try {
      await persistPortalContent();
    } catch (error) {
      cwaFetchingEnabled = previous.enabled;
      cwaFetchingChangedAt = previous.changedAt;
      syncServiceSettingsToPortalContent();
      throw error;
    }
    sendJson(response, 200, adminStatusPayload());
    if (cwaFetchingEnabled) {
      refreshCwaEmergencyInformation().catch((error) => {
        console.error('CWA emergency refresh resume failed:', error.message);
      });
    }
  } catch (error) {
    sendApiError(response, error);
  }
}

async function handleAdminDataGovSetting(request, response) {
  if (!adminSessionFor(request)) {
    sendAdminUnauthorized(response);
    return;
  }
  try {
    const { parsed } = await readJsonBody(request);
    if (typeof parsed?.enabled !== 'boolean') {
      throw new UpstreamError('enabled must be a boolean', 400);
    }
    const previous = { enabled: dataGovFetchingEnabled, changedAt: dataGovFetchingChangedAt };
    dataGovFetchingEnabled = parsed.enabled;
    dataGovFetchingChangedAt = new Date().toISOString();
    syncServiceSettingsToPortalContent();
    try {
      await persistPortalContent();
    } catch (error) {
      dataGovFetchingEnabled = previous.enabled;
      dataGovFetchingChangedAt = previous.changedAt;
      syncServiceSettingsToPortalContent();
      throw error;
    }
    sendJson(response, 200, adminStatusPayload());
  } catch (error) {
    sendApiError(response, error);
  }
}

function handleAdminLogout(request, response) {
  const session = adminSessionFor(request);
  if (session) adminSessions.delete(session.token);
  sendJson(response, 200, { success: true }, {
    'Set-Cookie': adminSessionCookie(request, '', 0)
  });
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
  const addCredential = (clientId, clientSecret, label, pool) => {
    const normalizedId = String(clientId || '').trim();
    const normalizedSecret = String(clientSecret || '').trim();
    if (!normalizedId || !normalizedSecret) return;
    const existing = definitions.find((item) => (
      item.clientId === normalizedId && item.clientSecret === normalizedSecret
    ));
    if (existing) return;
    definitions.push({ clientId: normalizedId, clientSecret: normalizedSecret, label, pool });
  };

  for (let index = 1; index <= 8; index += 1) {
    const clientId = process.env[`TDX_CLIENT_ID_${index}`]
      || (index === 1 ? process.env.TDX_CLIENT_ID : '');
    const clientSecret = process.env[`TDX_CLIENT_SECRET_${index}`]
      || (index === 1 ? process.env.TDX_CLIENT_SECRET : '');
    addCredential(
      clientId,
      clientSecret,
      `credential-${index}`,
      index === 8 ? 'reserve' : 'primary'
    );
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

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function fcmIsConfigured() {
  return Boolean(fcmProjectId && fcmServiceAccount?.client_email && fcmServiceAccount?.private_key);
}

async function fcmOAuthAccessToken(forceRefresh = false) {
  if (!fcmIsConfigured()) throw new UpstreamError('FCM service account is not configured', 503);
  if (!forceRefresh && fcmAccessToken?.token && Date.now() < fcmAccessToken.expiresAt - 60_000) {
    return fcmAccessToken.token;
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsignedToken = [
    base64UrlJson({ alg: 'RS256', typ: 'JWT' }),
    base64UrlJson({
      iss: fcmServiceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: FCM_TOKEN_ENDPOINT,
      iat: issuedAt,
      exp: issuedAt + 3600
    })
  ].join('.');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsignedToken), {
    key: String(fcmServiceAccount.private_key).replace(/\\n/g, '\n')
  }).toString('base64url');
  const assertion = `${unsignedToken}.${signature}`;
  const tokenPayload = await fetchJson(FCM_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion
    }).toString()
  }, 15_000);
  if (!tokenPayload?.access_token) throw new UpstreamError('FCM OAuth did not return an access token', 502);
  fcmAccessToken = {
    token: tokenPayload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(tokenPayload.expires_in) || 3600) * 1000
  };
  return fcmAccessToken.token;
}

function fcmMessageFor(item, type) {
  const emergency = type === 'emergency';
  const title = String(item?.title || (emergency ? '緊急即時資訊' : '新的系統公告')).slice(0, 200);
  const body = String(item?.summary || item?.details || '請開啟台灣智慧生活查看完整內容').slice(0, 500);
  return {
    message: {
      topic: FCM_TOPIC,
      notification: { title, body },
      data: {
        type,
        section: emergency ? 'emergencies' : 'announcements',
        itemId: String(item?.id || ''),
        category: String(item?.category || (emergency ? '緊急即時資訊' : '系統公告')).slice(0, 100),
        publishedAt: String(item?.publishedAt || item?.issuedAt || item?.receivedAt || '')
      },
      android: {
        priority: 'high',
        notification: {
          channel_id: 'portal-information',
          icon: 'ic_stat_smart_life',
          color: '#0f766e',
          sound: 'default',
          tag: `${type}-${String(item?.id || '').slice(0, 80)}`
        }
      },
      apns: {
        payload: { aps: { sound: 'default' } }
      }
    }
  };
}

async function sendFcmTopicNotification(item, type, retryAuthentication = true) {
  if (!fcmIsConfigured()) return { sent: false, skipped: true };
  const accessToken = await fcmOAuthAccessToken();
  try {
    const result = await fetchJson(
      `${FCM_API_ROOT}/v1/projects/${encodeURIComponent(fcmProjectId)}/messages:send`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fcmMessageFor(item, type))
      },
      20_000
    );
    return { sent: true, messageName: result?.name || null };
  } catch (error) {
    if (retryAuthentication && error.status === 401) {
      fcmAccessToken = null;
      await fcmOAuthAccessToken(true);
      return sendFcmTopicNotification(item, type, false);
    }
    throw error;
  }
}

function queuePortalNotification(item, type) {
  const queuedAt = new Date().toISOString();
  portalNotificationQueue = portalNotificationQueue.catch(() => undefined)
    .then(() => sendFcmTopicNotification(item, type))
    .then((result) => {
      lastFcmNotification = {
        type,
        itemId: String(item?.id || ''),
        queuedAt,
        completedAt: new Date().toISOString(),
        sent: result?.sent === true,
        skipped: result?.skipped === true,
        messageName: result?.messageName || null,
        error: null
      };
      return result;
    })
    .catch((error) => {
      console.error(`FCM ${type} notification failed:`, error.message);
      lastFcmNotification = {
        type,
        itemId: String(item?.id || ''),
        queuedAt,
        completedAt: new Date().toISOString(),
        sent: false,
        skipped: false,
        messageName: null,
        error: error.message
      };
      return { sent: false, error: error.message };
    });
  return portalNotificationQueue;
}

function announcementText(value, fieldName, maximumLength, required = true) {
  const text = String(value ?? '').trim().replace(/\r\n?/g, '\n');
  if (required && !text) throw new UpstreamError(`${fieldName} 不可空白`, 400);
  if (text.length > maximumLength) {
    throw new UpstreamError(`${fieldName} 不可超過 ${maximumLength} 個字`, 400);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
    throw new UpstreamError(`${fieldName} 含有不支援的控制字元`, 400);
  }
  if (/<\/?[a-z][^>]*>/i.test(text)) {
    throw new UpstreamError(`${fieldName} 僅能使用純文字`, 400);
  }
  return text;
}

async function handleAdminAnnouncementPublish(request, response) {
  const session = adminSessionFor(request);
  if (!session) {
    sendAdminUnauthorized(response);
    return;
  }
  try {
    const { parsed } = await readJsonBody(request);
    const severityOptions = new Set(['一般', '重要', '緊急']);
    const severity = announcementText(parsed?.severity || '一般', '重要程度', 10);
    if (!severityOptions.has(severity)) throw new UpstreamError('重要程度不正確', 400);
    const publishedAt = new Date().toISOString();
    const announcement = {
      id: crypto.randomUUID(),
      title: announcementText(parsed?.title, '標題', 120),
      summary: announcementText(parsed?.summary, '摘要', 300),
      details: announcementText(parsed?.details, '詳細內容', 5_000),
      category: announcementText(parsed?.category || '系統公告', '分類', 50),
      severity,
      publisher: announcementText(parsed?.publisher || session.username, '發布單位', 80),
      publishedAt
    };
    portalContent.announcements.unshift(announcement);
    try {
      await persistPortalContent();
    } catch (error) {
      portalContent.announcements = portalContent.announcements
        .filter((item) => item.id !== announcement.id);
      throw error;
    }
    const notificationResult = await queuePortalNotification(announcement, 'announcement');
    sendJson(response, 201, {
      success: true,
      message: '系統公告已發布',
      data: announcement,
      announcementCount: portalContent.announcements.length,
      announcements: portalContent.announcements,
      notificationQueued: fcmIsConfigured(),
      notificationSent: notificationResult?.sent === true,
      notificationError: notificationResult?.error || null
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

async function handleAdminAnnouncementDelete(request, response, announcementId) {
  if (!adminSessionFor(request)) {
    sendAdminUnauthorized(response);
    return;
  }
  const decodedId = String(announcementId || '').trim();
  const index = portalContent.announcements.findIndex((item) => item.id === decodedId);
  if (index < 0) {
    sendJson(response, 404, { success: false, message: '找不到要刪除的系統公告' });
    return;
  }
  const previous = portalContent.announcements;
  const removed = previous[index];
  portalContent.announcements = previous.filter((item) => item.id !== decodedId);
  try {
    await persistPortalContent();
    sendJson(response, 200, {
      success: true,
      message: '系統公告已刪除',
      data: removed,
      announcementCount: portalContent.announcements.length,
      announcements: portalContent.announcements
    });
  } catch (error) {
    portalContent.announcements = previous;
    sendApiError(response, error);
  }
}

async function handleAdminAnnouncementOrder(request, response) {
  if (!adminSessionFor(request)) {
    sendAdminUnauthorized(response);
    return;
  }
  try {
    const { parsed } = await readJsonBody(request);
    const ids = Array.isArray(parsed?.ids) ? parsed.ids.map((id) => String(id)) : [];
    const existingIds = portalContent.announcements.map((item) => item.id);
    if (ids.length !== existingIds.length || new Set(ids).size !== ids.length
      || ids.some((id) => !existingIds.includes(id))) {
      throw new UpstreamError('公告排序資料與目前公告不一致，請重新整理後再試', 409);
    }
    const previous = portalContent.announcements;
    const byId = new Map(previous.map((item) => [item.id, item]));
    portalContent.announcements = ids.map((id) => byId.get(id));
    try {
      await persistPortalContent();
    } catch (error) {
      portalContent.announcements = previous;
      throw error;
    }
    sendJson(response, 200, {
      success: true,
      message: '公告順序已儲存',
      announcementCount: portalContent.announcements.length,
      announcements: portalContent.announcements
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

function handlePortalInformation(response) {
  sendJson(response, 200, {
    success: true,
    observedAt: new Date().toISOString(),
    cwaFetchingEnabled,
    fcmEnabled: fcmIsConfigured(),
    fcmTopic: FCM_TOPIC,
    emergencyObservedAt: portalContent.emergencyObservedAt,
    data: {
      announcements: portalContent.announcements,
      emergencies: portalContent.emergencies
    }
  });
}

function loadGraphHopperApiKeys() {
  const values = [
    process.env.GRAPHHOPPER_API_KEY_1 || process.env.GRAPHHOPPER_API_KEY,
    process.env.GRAPHHOPPER_API_KEY_2
  ];
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
    .map((apiKey, index) => ({
      apiKey,
      label: `key-${index + 1}`,
      rateLimitedUntil: 0
    }));
}

async function getTdxToken(credential) {
  // Preserve token if it has more than 5 minutes remaining to avoid unnecessary token churn
  if (credential.token && Date.now() < credential.expiresAt - 300_000) return credential.token;
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
  const dynamicPath = [
    /\/Bus\/(?:RealTimeByFrequency|RealTimeNearStop|EstimatedTimeOfArrival)\//,
    /\/Bike\/Availability\//,
    /\/Parking\/.*ParkingAvailability\//,
    /\/Road\/Traffic\/Live\//,
    /\/Rail\/TRA\/TrainLiveBoard(?:\/|$)/,
    /\/Rail\/Metro\/(?:LiveBoard|LivePosition)\//
  ].some((pattern) => pattern.test(url.pathname));
  return dynamicPath ? TDX_DYNAMIC_REFRESH_INTERVAL_MS : TDX_STATIC_REFRESH_INTERVAL_MS;
}

function queueTdxRequest(task, options = {}) {
  const priority = resolveTdxPriority(options);
  return tdxQueue.enqueue(async () => {
    const waitMs = Math.max(0, TDX_REQUEST_SPACING_MS - (Date.now() - lastTdxRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastTdxRequestAt = Date.now();
    return task();
  }, { priority, maxAttempts: options.maxAttempts });
}

function tdxCredentialPool(poolName = 'primary') {
  return poolName === 'reserve' ? tdxCredentialPools.reserve : tdxCredentialPools.primary;
}

function availableCredentialCount(credentials) {
  return credentials.filter((credential) => Date.now() >= credential.rateLimitedUntil).length;
}

function availableTdxCredentialCount(poolName = 'primary') {
  return availableCredentialCount(tdxCredentialPool(poolName));
}

function markTdxCredentialRateLimited(credential, error, poolName, poolIndex, pool) {
  // When a credential hits rate limit or auth failure, put it into a 3 minute cooldown
  const cooldownMs = Math.max(180_000, error?.retryAfterMs || 180_000);
  credential.rateLimitedUntil = Date.now() + cooldownMs;
  credential.token = '';
  credential.expiresAt = 0;
  activeTdxCredentialIndexes[poolName] = (poolIndex + 1) % pool.length;
  lastCredentialSwitchAt = Date.now();
  console.warn(`TDX ${credential.label} in ${poolName} pool reached HTTP 429; switching within that pool.`);
}

function areAllTdxCredentialsRateLimited(poolName = 'primary') {
  const pool = tdxCredentialPool(poolName);
  return pool.length > 0
    && pool.every((credential) => Date.now() < credential.rateLimitedUntil);
}

function pauseBackgroundPoolIfNecessary() {
  const now = Date.now();
  const primaryPool = tdxCredentialPools.primary;
  if (!primaryPool.length) return;
  if (primaryPool.every((c) => now < c.rateLimitedUntil)) {
    // Pause background usage for 3 minutes
    backgroundPoolPausedUntil = now + 180_000;
    console.warn('All primary credentials are rate-limited; pausing background TDX jobs for 3 minutes.');
  }
}

async function requestTdxUrlFromPool(url, poolName, options = {}) {
  const pool = tdxCredentialPool(poolName);
  if (!pool.length) {
    throw new UpstreamError(`No TDX credential is configured for the ${poolName} pool`, 503);
  }

  let lastError = null;
  const startingCredentialIndex = activeTdxCredentialIndexes[poolName] % pool.length;
  for (let offset = 0; offset < pool.length; offset += 1) {
    const index = (startingCredentialIndex + offset) % pool.length;
    const credential = pool[index];
    if (Date.now() < credential.rateLimitedUntil) continue;
    // Avoid rapid switching through many credentials in under 1s
    if (Date.now() - lastCredentialSwitchAt < 1000 && offset > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    let token;
    try {
      token = await getTdxToken(credential);
    } catch (error) {
      lastError = error;
      if (error.status === 429) {
        markTdxCredentialRateLimited(credential, error, poolName, index, pool);
        if (poolName === 'primary') pauseBackgroundPoolIfNecessary();
        continue;
      }
      if ([400, 401, 403].includes(error.status)) {
        // Treat authentication failures as a temporary outage for this credential
        markTdxCredentialRateLimited(credential, error, poolName, index, pool);
        if (poolName === 'primary') pauseBackgroundPoolIfNecessary();
        console.error(`TDX ${credential.label} authentication failed; marking cooled and trying the next credential.`);
        continue;
      }
      if (!error.status || [502, 503, 504].includes(error.status)) {
        console.warn(`TDX ${credential.label} could not authenticate temporarily; trying the next credential.`);
        continue;
      }
      throw error;
    }

    try {
      if (/EstimatedTimeOfArrival/.test(String(url.pathname))) {
        etaTrace({
          source: 'requestTdxUrlFromPool',
          url: url.toString(),
          poolName,
          priority: resolveTdxPriority(options),
          event: 'outgoingRequest'
        });
      }
      if (/Parking\/OffStreet\/CarPark\/City/.test(String(url.pathname))) {
        console.error('DEBUG parkingCarPark outgoingRequest', url.toString(), poolName, resolveTdxPriority(options));
      }
      if (/Parking\/OffStreet\/ParkingAvailability\/City/.test(String(url.pathname))) {
        console.error('DEBUG parkingAvailability outgoingRequest', url.toString(), poolName, resolveTdxPriority(options));
      }

      const data = await queueTdxRequest(() => {
        if (!tdxFetchingEnabled) {
          throw new UpstreamError('管理員已關閉運輸資訊', 503);
        }
        return fetchJson(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
        }, 60_000);
      }, { priority: resolveTdxPriority(options) });
      activeTdxCredentialIndexes[poolName] = index;
      return data;
    } catch (error) {
      lastError = error;
      if (error.status === 429) {
        markTdxCredentialRateLimited(credential, error, poolName, index, pool);
        continue;
      }
      if ([401, 403].includes(error.status)) {
        credential.token = '';
        credential.expiresAt = 0;
        console.error(`TDX ${credential.label} access token was rejected; trying the next credential.`);
        continue;
      }
      if (!error.status || [502, 503, 504].includes(error.status)) {
        console.warn(`TDX ${credential.label} request failed temporarily; trying the next credential.`);
        continue;
      }
      throw error;
    }
  }

  if (areAllTdxCredentialsRateLimited(poolName)) {
    throw new UpstreamError(`All TDX credentials in the ${poolName} pool are rate limited`, 429);
  }
  throw lastError || new UpstreamError('No TDX credential is currently available', 503);
}

async function requestTdxUrl(url, options = {}) {
  if (!tdxFetchingEnabled) throw new UpstreamError('管理員已關閉運輸資訊', 503);
  const priority = resolveTdxPriority(options);

  // Background requests must not use the reserve (credential 8). If primary pool
  // is entirely rate-limited, pause background pool for 3 minutes and fail fast.
  if (priority === 'low') {
    const now = Date.now();
    if (now < backgroundPoolPausedUntil) throw new UpstreamError('Background TDX pool paused due to rate limits', 503);
    if (areAllTdxCredentialsRateLimited('primary')) {
      pauseBackgroundPoolIfNecessary();
      throw new UpstreamError('Background TDX pool paused due to rate limits', 503);
    }
    return await requestTdxUrlFromPool(url, 'primary', options);
  }

  // High priority: prefer reserve (credential 8) first, fallback to primary only on retryable errors
  let reserveError = null;
  if (tdxCredentialPools.reserve.length) {
    try {
      return await requestTdxUrlFromPool(url, 'reserve', options);
    } catch (error) {
      reserveError = error;
      if (!(error?.status && [429, 502, 503, 504].includes(error.status))) {
        throw error;
      }
      // otherwise fallthrough to try primary
    }
  }

  // Try primary pool
  try {
    return await requestTdxUrlFromPool(url, 'primary', options);
  } catch (primaryError) {
    if (!tdxCredentialPools.reserve.length) throw primaryError;
    // If reserve previously errored with 429 and primary also 429, surface a combined error
    if (reserveError?.status === 429 && primaryError?.status === 429) {
      throw new UpstreamError('All eligible TDX credentials are rate limited', 429);
    }
    throw primaryError;
  }
}

async function refreshTdxCacheEntry(entry, options = {}) {
  if (entry.pending) return entry.pending;
  entry.pending = (async () => {
    const priority = resolveTdxPriority({ ...options, backgroundRefresh: entry.backgroundRefresh });
    const data = await requestTdxUrl(entry.url, { priority });
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
  const key = `primary:${url}`;
  let entry = tdxResponseCache.get(key);
  if (!entry) {
    entry = {
      url: new URL(url.toString()),
      data: null,
      pending: null,
      updatedAt: 0,
      expiresAt: 0,
      lastAccessAt: 0,
      cacheMs,
      refreshIntervalMs: Math.max(options.refreshIntervalMs ?? cacheMs ?? tdxRefreshIntervalForUrl(url), 1000),
      backgroundRefresh: options.backgroundRefresh !== false
    };
    tdxResponseCache.set(key, entry);
  } else {
    entry.cacheMs = cacheMs;
    if (options.refreshIntervalMs) entry.refreshIntervalMs = options.refreshIntervalMs;
    if (options.backgroundRefresh !== undefined) entry.backgroundRefresh = options.backgroundRefresh;
  }
  if (options.trackActivity !== false) entry.lastAccessAt = Date.now();

  const priority = resolveTdxPriority({ ...options, backgroundRefresh: entry.backgroundRefresh });
  if (entry.data && options.forceRefresh !== true) {
    if (Date.now() < entry.updatedAt + entry.refreshIntervalMs) {
      return entry.data;
    }
    try {
      return await refreshTdxCacheEntry(entry, { priority });
    } catch (error) {
      return entry.data;
    }
  }
  try {
    return await refreshTdxCacheEntry(entry, { priority });
  } catch (error) {
    if (!entry.data) tdxResponseCache.delete(key);
    throw error;
  }
}

async function refreshActiveTdxCache() {
  if (!tdxFetchingEnabled) return [];
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
    if (isBackgroundPoolPaused()) {
      console.warn('Skipping TDX shared cache refresh; background pool is paused');
      return;
    }
    // If we just resumed from a pause, stagger the refresh to avoid thundering herd
    if (backgroundPoolPausedUntil && Date.now() - backgroundPoolPausedUntil < 30_000) {
      const jitter = Math.floor(Math.random() * 30_000);
      setTimeout(() => refreshActiveTdxCache().catch((error) => console.error('TDX shared cache refresh failed:', error.message)), jitter);
      return;
    }
    refreshActiveTdxCache().catch((error) => console.error('TDX shared cache refresh failed:', error.message));
  }, TDX_REFRESH_INTERVAL_MS);
  tdxCacheRefreshTimer.unref?.();
}

async function fetchTdxCity(pathname, city, parameters = {}, cacheMs = TDX_RESPONSE_CACHE_MS, options = {}) {
  // Special-case EstimatedTimeOfArrival to populate/observe the journey overlay cache
  if (pathname === 'v2/Bus/EstimatedTimeOfArrival/City') {
    const normalized = normalizeStopFilter(parameters['$filter']);
    const cacheKey = normalized.normalized;
    const cached = journeyBusEtaOverlayCache.get(cacheKey);
    etaTrace({
      source: 'fetchTdxCity',
      city,
      pathname,
      rawFilter: normalized.raw,
      normalizedFilter: normalized.normalized,
      cacheKey,
      cacheState: cached ? {
        hasData: Boolean(cached.data), hasPending: Boolean(cached.pending), expiresAt: cached.expiresAt
      } : null,
      requestedUids: normalized.uids,
      event: 'lookup'
    });
    if (cached?.data && cached.expiresAt > Date.now()) {
      etaTrace({ source: 'fetchTdxCity', cacheKey, event: 'exactHit' });
      return cached.data;
    }
    if (cached?.data) {
      etaTrace({ source: 'fetchTdxCity', cacheKey, event: 'staleReturn' });
      if (!cached.pending) {
        const url = tdxCityUrl(pathname, city, parameters);
        const pending = fetchTdxUrl(url, cacheMs, {
          ...options,
          refreshIntervalMs: Math.max(JOURNEY_LIVE_REFRESH_INTERVAL_MS, 15_000),
          backgroundRefresh: false
        }).then((payload) => {
          const entry = journeyBusEtaOverlayCache.get(cacheKey);
          if (entry) {
            entry.data = payload;
            entry.expiresAt = Date.now() + JOURNEY_LIVE_REFRESH_INTERVAL_MS;
          }
          return payload;
        }).finally(() => {
          const entry = journeyBusEtaOverlayCache.get(cacheKey);
          if (entry?.pending === pending) entry.pending = null;
        });
        cached.pending = pending;
      }
      return cached.data;
    }
    if (cached?.pending) {
      etaTrace({ source: 'fetchTdxCity', cacheKey, event: 'pendingHit' });
      return cached.pending;
    }

    etaTrace({ source: 'fetchTdxCity', cacheKey, event: 'miss' });
    const url = tdxCityUrl(pathname, city, parameters);
    const pending = fetchTdxUrl(url, cacheMs, {
      ...options,
      backgroundRefresh: false
    }).then((payload) => {
      const entry = journeyBusEtaOverlayCache.get(cacheKey);
      if (entry) {
        entry.data = payload;
        entry.expiresAt = Date.now() + JOURNEY_LIVE_REFRESH_INTERVAL_MS;
      }
      return payload;
    }).finally(() => {
      const entry = journeyBusEtaOverlayCache.get(cacheKey);
      if (entry?.pending === pending) entry.pending = null;
    });

    journeyBusEtaOverlayCache.set(cacheKey, {
      data: null,
      pending,
      expiresAt: Date.now() + JOURNEY_LIVE_REFRESH_INTERVAL_MS
    });
    return pending;
  }

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

function cwaEmergencyRecords(datasetId, payload) {
  const records = payload?.records || payload?.Records || {};
  const preferredKeys = /E-A0015/i.test(datasetId)
    ? ['Earthquake', 'earthquake']
    : ['record', 'Record', 'warning', 'Warning', 'location', 'Location'];
  const list = asArray(records, preferredKeys);
  if (list.length) return list;
  const direct = preferredKeys.map((key) => records?.[key]).find((value) => value && typeof value === 'object');
  return direct ? [direct] : [];
}

function compactCwaText(value, maximumLength = 4_000) {
  const values = [];
  const visit = (item, depth = 0) => {
    if (values.join(' ').length >= maximumLength || depth > 8 || item === null || item === undefined) return;
    if (typeof item === 'string' || typeof item === 'number') {
      const text = String(item).replace(/\s+/g, ' ').trim();
      if (text && !values.includes(text)) values.push(text);
      return;
    }
    if (Array.isArray(item)) {
      item.slice(0, 80).forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (typeof item === 'object') Object.values(item).slice(0, 100).forEach((entry) => visit(entry, depth + 1));
  };
  visit(value);
  return values.join('；').slice(0, maximumLength);
}

function cwaEmergencyCategory(text, datasetId) {
  const value = `${datasetId} ${text}`;
  if (/地震|Earthquake/i.test(value)) return '地震';
  if (/颱風|typhoon/i.test(value)) return '颱風警報';
  if (/龍捲風|tornado/i.test(value)) return '龍捲風';
  if (/土石流|debris\s*flow/i.test(value)) return '土石流警報';
  if (/淹水|flood/i.test(value)) return '淹水警報';
  return '氣象警特報';
}

function normalizeCwaEmergency(datasetId, record) {
  const isEarthquake = /E-A0015/i.test(datasetId)
    || Boolean(record?.EarthquakeInfo || record?.earthquakeInfo);
  if (isEarthquake) {
    const info = record.EarthquakeInfo || record.earthquakeInfo || {};
    const magnitude = Number(
      info.EarthquakeMagnitude?.MagnitudeValue ?? info.earthquakeMagnitude?.magnitudeValue
    );
    const issuedAt = info.OriginTime || info.originTime || record.ReportTime || record.reportTime || null;
    const location = info.Epicenter?.Location || info.epicenter?.location || '';
    const report = record.ReportContent || record.reportContent || compactCwaText(record);
    const title = `地震資訊${Number.isFinite(magnitude) ? `：規模 ${magnitude}` : ''}`;
    const stableKey = [datasetId, record.EarthquakeNo || record.earthquakeNo || '', issuedAt, magnitude, location];
    return {
      id: crypto.createHash('sha256').update(JSON.stringify(stableKey)).digest('hex'),
      category: '地震', severity: '緊急', title,
      summary: String(report || '中央氣象署地震資訊').slice(0, 500),
      details: compactCwaText(record),
      affectedAreas: location ? [String(location)] : [],
      issuedAt,
      source: '中央氣象署',
      sourceDatasetId: datasetId,
      receivedAt: new Date().toISOString()
    };
  }

  const hazards = asArray(record?.hazardConditions?.hazards, ['hazard', 'Hazard']);
  const firstHazard = hazards[0] || {};
  const phenomena = firstHazard?.info?.phenomena || firstHazard?.Info?.Phenomena
    || record?.datasetInfo?.datasetDescription || record?.DatasetInfo?.DatasetDescription
    || record?.phenomena || record?.Phenomena || '';
  const content = record?.contents?.content?.contentText || record?.Contents?.Content?.ContentText
    || record?.contentText || record?.ContentText || record?.description || record?.Description || '';
  const details = compactCwaText(content || record);
  const category = cwaEmergencyCategory(`${localizedText(phenomena)} ${details}`, datasetId);
  const title = localizedText(phenomena) || category;
  const issuedAt = record?.datasetInfo?.issueTime || record?.DatasetInfo?.IssueTime
    || record?.issueTime || record?.IssueTime || null;
  const locations = asArray(firstHazard?.info?.affectedAreas, ['location', 'Location'])
    .map((location) => localizedText(location?.locationName || location?.LocationName || location))
    .filter(Boolean);
  const officialId = record?.identifier || record?.Identifier || record?.id || record?.ID || '';
  const stableKey = [datasetId, officialId, issuedAt, title, officialId || details];
  return {
    id: crypto.createHash('sha256').update(JSON.stringify(stableKey)).digest('hex'),
    category, severity: '緊急', title: String(title).slice(0, 200),
    summary: String(details || `${title}，請留意中央氣象署最新資訊`).slice(0, 500),
    details,
    affectedAreas: [...new Set(locations)].slice(0, 100),
    issuedAt,
    source: '中央氣象署',
    sourceDatasetId: datasetId,
    receivedAt: new Date().toISOString()
  };
}

async function refreshCwaEmergencyInformation() {
  if (!cwaFetchingEnabled || !process.env.CWA_API_KEY) return { added: 0, skipped: true };
  if (cwaEmergencyRefreshPromise) return cwaEmergencyRefreshPromise;
  cwaEmergencyRefreshPromise = (async () => {
    const authorization = requiredEnvironment('CWA_API_KEY');
    const results = await Promise.allSettled(CWA_EMERGENCY_DATASET_IDS.map(async (datasetId) => {
      const endpoint = new URL(`${CWA_DATASTORE_ROOT}/${datasetId}`);
      endpoint.search = new URLSearchParams({ Authorization: authorization, format: 'JSON' });
      const payload = await fetchJson(endpoint, { headers: { Accept: 'application/json' } }, 30_000);
      return cwaEmergencyRecords(datasetId, payload)
        .map((record) => normalizeCwaEmergency(datasetId, record));
    }));
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    if (!fulfilled.length) {
      const firstFailure = results.find((result) => result.status === 'rejected');
      throw firstFailure?.reason || new UpstreamError('中央氣象署緊急資訊目前無法讀取', 502);
    }
    const existingIds = new Set(portalContent.emergencies.map((item) => item.id));
    const additions = [];
    fulfilled.flatMap((result) => result.value).forEach((item) => {
      if (!item?.id || existingIds.has(item.id)) return;
      existingIds.add(item.id);
      additions.push(item);
    });
    if (additions.length) {
      portalContent.emergencies.push(...additions);
      portalContent.emergencies.sort((left, right) => (
        Date.parse(right.issuedAt || right.receivedAt || 0) - Date.parse(left.issuedAt || left.receivedAt || 0)
      ));
    }
    portalContent.emergencyObservedAt = new Date().toISOString();
    await persistPortalContent();
    additions.forEach((item) => queuePortalNotification(item, 'emergency'));
    results.filter((result) => result.status === 'rejected').forEach((result) => {
      console.warn('One CWA emergency dataset could not be refreshed:', result.reason?.message || result.reason);
    });
    return { added: additions.length, skipped: false };
  })().finally(() => {
    cwaEmergencyRefreshPromise = null;
  });
  return cwaEmergencyRefreshPromise;
}

function startCwaEmergencyRefresh() {
  clearInterval(cwaEmergencyRefreshTimer);
  refreshCwaEmergencyInformation().catch((error) => {
    console.error('Initial CWA emergency refresh failed:', error.message);
  });
  cwaEmergencyRefreshTimer = setInterval(() => {
    refreshCwaEmergencyInformation().catch((error) => {
      console.error('CWA emergency refresh failed:', error.message);
    });
  }, CWA_EMERGENCY_REFRESH_INTERVAL_MS);
  cwaEmergencyRefreshTimer.unref?.();
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
    || item.ParkingPosition || item.TrainPosition || item.Position || item.LinkPosition || {};
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
    const city = address.county || address.municipality || address.city || address.state;
    const countyTown = address.county && address.city
      && normalizePlaceName(address.city) !== normalizePlaceName(city)
      ? address.city
      : null;
    const districtCandidates = [
      address.city_district,
      address.borough,
      countyTown,
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

function canonicalTaiwanCityName(value = '', address = '') {
  const candidates = [value, address].map((candidate) => (
    normalizePlaceName(candidate).replace(/^臺灣省/, '').replace(/\s+/g, '')
  )).filter(Boolean);
  for (const candidate of candidates) {
    const official = OFFICIAL_TAIWAN_CITY_NAMES.find((city) => candidate.includes(city));
    if (official) return official;
    const alias = [...TAIWAN_CITY_NAME_ALIASES].find(([name]) => candidate.includes(name));
    if (alias) return alias[1];
  }
  const normalized = candidates[0] || '';
  const baseMatches = OFFICIAL_TAIWAN_CITY_NAMES.filter((city) => city.slice(0, -1) === normalized);
  return baseMatches.length === 1 ? baseMatches[0] : normalized;
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
    if (!cwaFetchingEnabled) throw new UpstreamError('管理員已關閉天氣資訊', 503);
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
    if (!cwaFetchingEnabled) throw new UpstreamError('管理員已關閉天氣資訊', 503);
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
    const cwaEnabledForRequest = cwaFetchingEnabled;
    const authorization = cwaEnabledForRequest ? requiredEnvironment('CWA_API_KEY') : null;
    const fetchCwaDataset = (datasetId) => {
      const endpoint = new URL(`${CWA_DATASTORE_ROOT}/${datasetId}`);
      endpoint.search = new URLSearchParams({ Authorization: authorization, format: 'JSON' });
      return fetchJson(endpoint, { headers: { Accept: 'application/json' } }, 30_000);
    };
    const shelterQuery = `[out:json][timeout:25];(nwr(around:5000,${lat},${lng})["amenity"="shelter"];nwr(around:5000,${lat},${lng})["emergency"="assembly_point"];nwr(around:5000,${lat},${lng})["social_facility"="shelter"];);out tags center;`;
    const [warningResult, earthquakeResult, shelterResult] = await Promise.allSettled([
      cwaEnabledForRequest ? fetchCwaDataset('W-C0033-001') : Promise.resolve(null),
      cwaEnabledForRequest ? fetchCwaDataset('E-A0015-001') : Promise.resolve(null),
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
      source: cwaEnabledForRequest
        ? '中央氣象署警特報、地震資料與 OpenStreetMap 避難場所'
        : 'OpenStreetMap 避難場所',
      observedAt: new Date().toISOString(),
      data: { warnings, earthquakes, shelters, cwaFetchingEnabled: cwaEnabledForRequest },
      unavailable: [
        !cwaEnabledForRequest ? '氣象警特報（管理員已關閉）' : warningResult.status === 'rejected' ? '氣象警特報' : null,
        !cwaEnabledForRequest ? '地震資訊（管理員已關閉）' : earthquakeResult.status === 'rejected' ? '地震資訊' : null,
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
  }).sort((left, right) => (left.sequence || Infinity) - (right.sequence || Infinity));
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
    fetchTdxCityRoute(stopPath, city, routeName, { '$top': 100 }, TDX_STATIC_REFRESH_INTERVAL_MS),
    fetchTdxCityRoute(etaPath, city, routeName, { '$top': 1000 }, TDX_DYNAMIC_REFRESH_INTERVAL_MS)
  ]);
  const etaItems = asArray(etaPayload);
  const routes = asArray(stopPayload).map((item) => mapStopOfRoute(item, etaItems, plateNumber, currentStopUid));
  const matchingRoutes = Number.isFinite(preferredDirection)
    ? routes.filter((route) => route.direction === preferredDirection)
    : routes;
  const selectedRoutes = matchingRoutes.length ? matchingRoutes : routes;
  selectedRoutes.sort((left, right) => Number(left.direction !== preferredDirection) - Number(right.direction !== preferredDirection));
  return selectedRoutes;
}

async function proxyBusDetails(requestUrl, response) {
  try {
    await runWithTdxPriority('high', async () => {
      const { lat, lng } = requireTaiwanCoordinates(requestUrl.searchParams);
      const requestedCity = requestUrl.searchParams.get('city');
      const city = requestedCity === 'InterCity' ? 'InterCity' : requireTdxCity(requestUrl.searchParams, lat, lng);
      const routeName = String(requestUrl.searchParams.get('routeName') || '').trim();
      const plateNumber = String(requestUrl.searchParams.get('plateNumber') || '').trim();
      const rawDirection = requestUrl.searchParams.get('direction');
      const directionValue = rawDirection === null || rawDirection === '' ? NaN : Number(rawDirection);
      const currentStopUid = String(requestUrl.searchParams.get('currentStopUid') || '').trim();
      if (!routeName) throw new UpstreamError('routeName is required', 400);
      const routes = await fetchBusRouteDetails(city, routeName, plateNumber, Number.isFinite(directionValue) ? directionValue : null, currentStopUid);
      sendJson(response, 200, {
        success: true,
        source: '交通部 TDX 公車站序與預估到站',
        observedAt: new Date().toISOString(),
        data: { city, routeName, plateNumber, routes }
      });
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
      ? await fetchTdxCity('v2/Bus/StopOfRoute/City', city, { '$top': 10000 }, TDX_STATIC_REFRESH_INTERVAL_MS)
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
    routeUid: bus.RouteUID || bus.RouteID || '',
    subRouteUid: bus.SubRouteUID || bus.SubRouteID || '',
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
  const realtimeOptions = {
    forceRefresh: true,
    backgroundRefresh: false,
    trackActivity: false,
    priority: 'low'
  };
  if (!source.interCity) {
    return fetchTdxCity(
      'v2/Bus/RealTimeByFrequency/City',
      source.tdxCity,
      { '$top': 10000 },
      0,
      realtimeOptions
    );
  }
  const url = new URL(`${TDX_API_ROOT}/v2/Bus/RealTimeByFrequency/InterCity`);
  url.searchParams.set('$top', '10000');
  url.searchParams.set('$format', 'JSON');
  return fetchTdxUrl(url, 0, realtimeOptions);
}

async function refreshNationwideBusSnapshot() {
  if (!tdxFetchingEnabled) return nationwideBusSnapshot;
  if (isBackgroundPoolPaused()) {
    console.warn('refreshNationwideBusSnapshot: skipped because background pool is paused');
    return nationwideBusSnapshot;
  }
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
  // Initial run respects background pause and staggers immediate resume
  if (!isBackgroundPoolPaused()) {
    refreshNationwideBusSnapshot().catch((error) => console.error('Nationwide bus refresh failed:', error.message));
  } else {
    console.warn('Initial nationwide bus refresh skipped; background pool paused');
  }
  nationwideBusRefreshTimer = setInterval(() => {
    if (isBackgroundPoolPaused()) {
      console.warn('Skipping nationwide bus refresh; background pool paused');
      return;
    }
    if (backgroundPoolPausedUntil && Date.now() - backgroundPoolPausedUntil < 30_000) {
      const jitter = Math.floor(Math.random() * 30_000);
      setTimeout(() => refreshNationwideBusSnapshot().catch((error) => console.error('Nationwide bus refresh failed:', error.message)), jitter);
      return;
    }
    refreshNationwideBusSnapshot().catch((error) => console.error('Nationwide bus refresh failed:', error.message));
  }, BUS_REFRESH_INTERVAL_MS);
  nationwideBusRefreshTimer.unref?.();
}

async function proxyBus(requestUrl, response) {
  const scope = requestUrl.searchParams.get('scope') || 'nearby';
  const allBuses = Object.values(nationwideBusSnapshot.byCity).flat();
  const rateLimited = areAllTdxCredentialsRateLimited('primary')
    && (!tdxCredentialPools.reserve.length || areAllTdxCredentialsRateLimited('reserve'));
  const paused = !tdxFetchingEnabled;
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
    degraded: paused || rateLimited || nationwideBusSnapshot.unavailableCities.length > 0,
    refreshing: Boolean(nationwideBusRefreshPromise),
    source: '交通部 TDX 全臺公車車機動態快照',
    observedAt: nationwideBusSnapshot.observedAt,
    attemptedAt: nationwideBusSnapshot.attemptedAt,
    refreshIntervalSeconds: BUS_REFRESH_INTERVAL_MS / 1000,
    updateSequence: nationwideBusSnapshot.updateSequence,
    totalBuses: allBuses.length,
    cityCounts: Object.fromEntries(Object.entries(nationwideBusSnapshot.byCity).map(([city, buses]) => [city, buses.length])),
    unavailableCities: nationwideBusSnapshot.unavailableCities,
    message: paused
      ? '管理員已關閉運輸資訊'
      : rateLimited
        ? '請求過多，請稍後再試'
        : nationwideBusSnapshot.unavailableCities.length
          ? '部分縣市本次更新失敗，保留上一次成功快照'
          : null,
    data
  });
}
async function proxyBusStops(requestUrl, response) {
  try {
    await runWithTdxPriority('high', async () => {
      const { lat, lng } = requireTaiwanCoordinates(requestUrl.searchParams);
      const city = requireTdxCity(requestUrl.searchParams, lat, lng);
      const stopsPayload = await fetchTdxCity('v2/Bus/Stop/City', city, {
        '$top': 10000
      }, TDX_STATIC_REFRESH_INTERVAL_MS);
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
    });
  } catch (error) {
    // On rate limit or upstream failure, attempt to return stale cache instead of 503
    if ((error.status === 429 || (error.status && error.status >= 500))) {
      try {
        const { lat, lng } = (() => {
          try { return requireTaiwanCoordinates(requestUrl.searchParams); } catch (_) { return { lat: null, lng: null }; }
        })();
        const city = (() => { try { return requireTdxCity(requestUrl.searchParams, lat, lng); } catch (_) { return null; } })();
        const url = city ? tdxCityUrl('v2/Bus/Stop/City', city, { '$top': 10000 }) : null;
        const cache = url ? tdxResponseCache.get(`primary:${url.toString()}`) : null;
        const cachedData = cache?.data || [];
        const mapped = Array.isArray(cachedData) ? cachedData.map((stop) => mapBusStop(stop, { lat, lng })).filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng) && stop.distanceMeters <= 2_000) : [];
        sendJson(response, 200, {
          success: true,
          degraded: true,
          source: '交通部 TDX 公車站牌降級快取',
          observedAt: new Date().toISOString(),
          data: mapped
        });
        return;
      } catch (e) {
        // fallthrough
      }
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
  }, TDX_STATIC_REFRESH_INTERVAL_MS);
  let availabilityPayload = [];
  if (includeAvailability) {
    try {
      availabilityPayload = await fetchTdxCity(
        'v2/Bike/Availability/City', city, { '$top': 5000 }, TDX_DYNAMIC_REFRESH_INTERVAL_MS
      );
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
    await runWithTdxPriority('high', async () => {
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
    });
  } catch (error) {
    if ((error.status === 429 || (error.status && error.status >= 500)) && bikeStationDiskCache.length) {
      try {
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
      } catch (e) {
        // Fallthrough to sendApiError
      }
    }
    sendApiError(response, error);
  }
}
    sendApiError(response, error);
  }
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
          await runWithTdxPriority('high', async () => {
            const currentCityData = await fetchBikeCityData(currentCity);
            data = [...bikeStationDiskCache.filter((station) => station.city !== currentCity), ...currentCityData];
          });
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
    const results = await runWithTdxPriority('high', async () => Promise.allSettled(cities.map((city) =>
      fetchBikeCityData(city, null, city === currentCity))));
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
  const parkingLotsPromise = fetchTdxCity('v1/Parking/OffStreet/CarPark/City', city, {
    '$top': 10000
  }, TDX_STATIC_REFRESH_INTERVAL_MS);
  const availabilityPromise = fetchTdxCity('v1/Parking/OffStreet/ParkingAvailability/City', city, {
    '$top': 10000
  }, TDX_DYNAMIC_REFRESH_INTERVAL_MS).catch((error) => {
    console.error(`TDX ${city} parking availability unavailable; parking locations are retained:`, error.message);
    return [];
  });

  const parkingLotsPayload = await parkingLotsPromise;
  const availabilityPayload = await availabilityPromise;

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
      refreshIntervalSeconds: TDX_DYNAMIC_REFRESH_INTERVAL_MS / 1000,
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
        refreshIntervalSeconds: TDX_DYNAMIC_REFRESH_INTERVAL_MS / 1000,
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
    const fullCityParameters = { '$top': 10000 };
    const sectionsPayload = await fetchTdxCity(
      'v2/Road/Traffic/Section/City', city, fullCityParameters, TDX_STATIC_REFRESH_INTERVAL_MS
    );
    const shapesPayload = await fetchTdxCity(
      'v2/Road/Traffic/SectionShape/City', city, fullCityParameters, TDX_STATIC_REFRESH_INTERVAL_MS
    );
    const livePayload = await fetchTdxCity(
      'v2/Road/Traffic/Live/City', city, fullCityParameters, TDX_DYNAMIC_REFRESH_INTERVAL_MS
    );
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

const JOURNEY_MODE_LABELS = { bus: '公車', tra: '臺鐵', thsr: '高鐵', metro: '捷運' };

function journeyTdxUrl(pathname, parameters = {}) {
  const url = new URL(`${TDX_API_ROOT}/${pathname}`);
  Object.entries(parameters).forEach(([name, value]) => {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(name, value);
  });
  url.searchParams.set('$format', 'JSON');
  return url;
}

function fetchJourneyTdx(pathname, parameters = {}, live = false, options = {}) {
  const refreshIntervalMs = live
    ? JOURNEY_LIVE_REFRESH_INTERVAL_MS
    : JOURNEY_STATIC_REFRESH_INTERVAL_MS;
  // If this is an EstimatedTimeOfArrival journey path, populate/observe the overlay cache
  if (/EstimatedTimeOfArrival/.test(pathname)) {
    const normalized = normalizeStopFilter(parameters['$filter']);
    const cacheKey = normalized.normalized;
    const cached = journeyBusEtaOverlayCache.get(cacheKey);
    etaTrace({
      source: 'fetchJourneyTdx',
      pathname,
      rawFilter: normalized.raw,
      normalizedFilter: normalized.normalized,
      cacheKey,
      cacheState: cached ? {
        hasData: Boolean(cached.data), hasPending: Boolean(cached.pending), expiresAt: cached.expiresAt
      } : null,
      requestedUids: normalized.uids,
      event: 'lookup'
    });
    if (cached?.data && cached.expiresAt > Date.now()) {
      etaTrace({ source: 'fetchJourneyTdx', cacheKey, event: 'exactHit' });
      return cached.data;
    }
    if (cached?.data) {
      etaTrace({ source: 'fetchJourneyTdx', cacheKey, event: 'staleReturn' });
      if (!cached.pending) {
        const url = journeyTdxUrl(pathname, parameters);
        const pending = fetchTdxUrl(url, refreshIntervalMs, {
          ...options,
          refreshIntervalMs: Math.max(JOURNEY_LIVE_REFRESH_INTERVAL_MS, 15_000),
          backgroundRefresh: false
        }).then((payload) => {
          const entry = journeyBusEtaOverlayCache.get(cacheKey);
          if (entry) {
            entry.data = payload;
            entry.expiresAt = Date.now() + JOURNEY_LIVE_REFRESH_INTERVAL_MS;
          }
          return payload;
        }).finally(() => {
          const entry = journeyBusEtaOverlayCache.get(cacheKey);
          if (entry?.pending === pending) entry.pending = null;
        });
        cached.pending = pending;
      }
      return cached.data;
    }
    if (cached?.pending) {
      etaTrace({ source: 'fetchJourneyTdx', cacheKey, event: 'pendingHit' });
      return cached.pending;
    }
    etaTrace({ source: 'fetchJourneyTdx', cacheKey, event: 'miss' });

    const url = journeyTdxUrl(pathname, parameters);
    const pending = fetchTdxUrl(url, refreshIntervalMs, {
      ...options,
      refreshIntervalMs,
      backgroundRefresh: false
    }).then((payload) => {
      const entry = journeyBusEtaOverlayCache.get(cacheKey);
      if (entry) {
        entry.data = payload;
        entry.expiresAt = Date.now() + JOURNEY_LIVE_REFRESH_INTERVAL_MS;
      }
      return payload;
    }).finally(() => {
      const entry = journeyBusEtaOverlayCache.get(cacheKey);
      if (entry?.pending === pending) entry.pending = null;
    });

    journeyBusEtaOverlayCache.set(cacheKey, {
      data: null,
      pending,
      expiresAt: Date.now() + JOURNEY_LIVE_REFRESH_INTERVAL_MS
    });
    return pending;
  }

  return fetchTdxUrl(journeyTdxUrl(pathname, parameters), refreshIntervalMs, { ...options, refreshIntervalMs });
}

function releaseJourneyTdxResponse(pathname, parameters = {}, live = false) {
  const key = `primary:${journeyTdxUrl(pathname, parameters)}`;
  const entry = tdxResponseCache.get(key);
  if (entry && !entry.pending) tdxResponseCache.delete(key);
}

function requireJourneyMode(searchParams) {
  const mode = String(searchParams.get('mode') || '').trim().toLowerCase();
  if (!JOURNEY_MODE_LABELS[mode]) throw new UpstreamError('不支援的交通運具', 400);
  return mode;
}

function requireJourneyCity(searchParams) {
  const portalCityCode = String(searchParams.get('city') || '').trim();
  if (portalCityCode === 'InterCity') return { portalCityCode, tdxCity: 'InterCity' };
  const tdxCity = TDX_CITY_BY_PORTAL_CODE[portalCityCode];
  if (!tdxCity) throw new UpstreamError('請選擇有效縣市', 400);
  return { portalCityCode, tdxCity };
}

function requireMetroSystem(searchParams, portalCityCode) {
  const system = String(searchParams.get('system') || '').trim().toUpperCase();
  const allowedSystems = METRO_SYSTEMS_BY_CITY[portalCityCode] || [];
  if (!allowedSystems.includes(system)) throw new UpstreamError('請選擇該縣市可用的捷運系統', 400);
  return system;
}

function busJourneyPath(resource, tdxCity) {
  return tdxCity === 'InterCity'
    ? `v2/Bus/${resource}/InterCity`
    : `v2/Bus/${resource}/City/${tdxCity}`;
}

function mapJourneyStation(item, mode) {
  const position = positionOf(item);
  const stops = asArray(item.Stops);
  const address = String(item.StationAddress || item.StationAddressZh || item.Address || '');
  const city = canonicalTaiwanCityName(
    item.LocationCity || item.City || address.match(/(?:臺|台)?[^\s,]{1,4}[縣市]/)?.[0] || '',
    address
  );
  return {
    id: String(item.StationUID || item.StationID || item.StopUID || item.StopID || ''),
    stationId: String(item.StationID || item.StationUID || ''),
    name: localizedText(item.StationName || item.StopName) || '未命名站點',
    address,
    city,
    lat: Number.isFinite(position.lat) ? position.lat : null,
    lng: Number.isFinite(position.lng) ? position.lng : null,
    stopUids: mode === 'bus'
      ? [...new Set(stops.map((stop) => String(stop.StopUID || stop.StopID || '')).filter(Boolean))]
      : []
  };
}

function compareJourneyStations(left, right, mode) {
  if (mode === 'thsr') {
    return (Number(right.lat) || -Infinity) - (Number(left.lat) || -Infinity)
      || left.name.localeCompare(right.name, 'zh-Hant');
  }
  if (mode === 'tra') {
    const leftRank = TRA_CITY_ORDER.indexOf(left.city);
    const rightRank = TRA_CITY_ORDER.indexOf(right.city);
    const normalizedLeftRank = leftRank < 0 ? TRA_CITY_ORDER.length : leftRank;
    const normalizedRightRank = rightRank < 0 ? TRA_CITY_ORDER.length : rightRank;
    if (normalizedLeftRank !== normalizedRightRank) return normalizedLeftRank - normalizedRightRank;
    const latitudeOrder = EASTERN_TRA_CITIES.has(left.city)
      ? (Number(left.lat) || Infinity) - (Number(right.lat) || Infinity)
      : (Number(right.lat) || -Infinity) - (Number(left.lat) || -Infinity);
    if (latitudeOrder) return latitudeOrder;
  }
  return left.name.localeCompare(right.name, 'zh-Hant');
}

async function fetchJourneyStationData(mode, scope = {}) {
  let payload;
  let entries;
  if (mode === 'bus') {
    payload = await fetchJourneyTdx(busJourneyPath('Station', scope.tdxCity), {
      '$top': 10000,
      '$select': 'StationUID,StationID,StationName,StationAddress,StationPosition,Stops'
    });
    entries = asArray(payload);
  } else if (mode === 'tra') {
    payload = await fetchJourneyTdx('v3/Rail/TRA/Station', { '$top': 10000 });
    entries = asArray(payload, ['Stations']);
  } else if (mode === 'thsr') {
    payload = await fetchJourneyTdx('v2/Rail/THSR/Station', { '$top': 1000 });
    entries = asArray(payload);
  } else {
    payload = await fetchJourneyTdx(`v2/Rail/Metro/Station/${scope.system}`, { '$top': 10000 });
    entries = asArray(payload);
  }
  const derivedKey = `${mode}:${scope.tdxCity || scope.system || ''}`;
  let derivedByMode = journeyStationDerivedCache.get(entries);
  if (derivedByMode?.has(derivedKey)) return derivedByMode.get(derivedKey);
  const stations = entries.map((entry) => mapJourneyStation(entry, mode))
    .filter((station) => station.id && station.name)
    .sort((left, right) => compareJourneyStations(left, right, mode));
  const data = { raw: entries, stations };
  if (!derivedByMode) {
    derivedByMode = new Map();
    journeyStationDerivedCache.set(entries, derivedByMode);
  }
  derivedByMode.set(derivedKey, data);
  return data;
}

function requireJourneyStation(stations, stationId, fieldName) {
  const normalizedId = String(stationId || '').trim();
  const station = stations.find((entry) => entry.id === normalizedId || entry.stationId === normalizedId);
  if (!station) throw new UpstreamError(`${fieldName}不存在於目前選擇的運輸系統`, 400);
  return station;
}

function parseJourneyDeparture(value) {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (!match) throw new UpstreamError('搭乘時間格式不正確', 400);
  const timestamp = Date.parse(`${match[1]}T${match[2]}:00+08:00`);
  if (!Number.isFinite(timestamp)) throw new UpstreamError('搭乘時間格式不正確', 400);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const maximumDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(Date.parse(`${today}T12:00:00+08:00`)
    + (JOURNEY_BOOKING_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000));
  if (timestamp < Date.now() - 60_000) {
    throw new UpstreamError('搭乘時間已經過去，請選擇目前時間之後', 400);
  }
  if (match[1] > maximumDate) {
    throw new UpstreamError(`TDX 目前僅提供今天起 ${JOURNEY_BOOKING_WINDOW_DAYS} 天內可查詢的班表`, 400);
  }
  return { date: match[1], time: match[2], timestamp };
}

function taipeiTimestamp(date, time, referenceTimestamp = null) {
  if (!/^\d{2}:\d{2}$/.test(String(time || ''))) return null;
  let timestamp = Date.parse(`${date}T${time}:00+08:00`);
  if (!Number.isFinite(timestamp)) return null;
  if (Number.isFinite(referenceTimestamp) && timestamp < referenceTimestamp - 12 * 60 * 60 * 1000) {
    timestamp += 24 * 60 * 60 * 1000;
  }
  return timestamp;
}

function formatJourneyClock(timestamp) {
  if (!Number.isFinite(timestamp)) return '-';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(timestamp));
}

function serviceDayMatches(serviceDay, timestamp) {
  if (!serviceDay || typeof serviceDay !== 'object') return true;
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei', weekday: 'long'
  }).format(new Date(timestamp));
  const value = serviceDay[weekday];
  return value === undefined ? true : value === true || value === 1;
}

function compactJourneyFareEntries(entries) {
  return entries.flatMap((entry) => {
    const originId = String(entry.OriginStationID || '');
    const destinationId = String(entry.DestinationStationID || '');
    const prices = asArray(entry.Fares).map((fare) => Number(fare.Price))
      .filter((price) => Number.isFinite(price) && price >= 0);
    if (!originId || !destinationId || !prices.length) return [];
    return [{
      OriginStationID: originId,
      DestinationStationID: destinationId,
      Fares: [...new Set(prices)].map((Price) => ({ Price }))
    }];
  });
}

function journeyFareSummary(fareEntries, originId, destinationId) {
  const record = fareEntries.find((entry) => (
    String(entry.OriginStationID || '') === String(originId)
    && String(entry.DestinationStationID || '') === String(destinationId)
  )) || fareEntries.find((entry) => (
    String(entry.OriginStationID || '') === String(destinationId)
    && String(entry.DestinationStationID || '') === String(originId)
  ));
  const prices = asArray(record?.Fares).map((fare) => Number(fare.Price))
    .filter((price) => Number.isFinite(price) && price >= 0);
  if (!prices.length) return { label: 'TDX 未提供票價', prices: [] };
  const uniquePrices = [...new Set(prices)].sort((left, right) => left - right);
  return {
    label: uniquePrices.length === 1
      ? `${uniquePrices[0]} 元`
      : `${uniquePrices[0]}～${uniquePrices[uniquePrices.length - 1]} 元`,
    prices: uniquePrices.slice(0, 8)
  };
}

function combineJourneyFares(fares) {
  const pricedFares = fares.filter((fare) => Array.isArray(fare?.prices) && fare.prices.length);
  if (pricedFares.length !== fares.length) {
    return { label: fares.map((fare) => fare?.label).filter(Boolean).join(' + ') || 'TDX 未提供票價', prices: [] };
  }
  const minimum = pricedFares.reduce((total, fare) => total + Math.min(...fare.prices), 0);
  const maximum = pricedFares.reduce((total, fare) => total + Math.max(...fare.prices), 0);
  return {
    label: minimum === maximum ? `合計約 ${minimum} 元` : `合計約 ${minimum}～${maximum} 元`,
    prices: minimum === maximum ? [minimum] : [minimum, maximum]
  };
}

function mapJourneyStop(stop, stationMap, date, previousTimestamp = null) {
  const stationId = String(stop.StationID || stop.StopUID || stop.StopID || '');
  const station = stationMap.get(stationId);
  const arrivalTimestamp = taipeiTimestamp(date, stop.ArrivalTime || stop.DepartureTime, previousTimestamp);
  const departureTimestamp = taipeiTimestamp(
    date, stop.DepartureTime || stop.ArrivalTime, arrivalTimestamp ?? previousTimestamp
  );
  return {
    id: stationId,
    name: localizedText(stop.StationName || stop.StopName) || station?.name || stationId,
    lat: station?.lat ?? null,
    lng: station?.lng ?? null,
    sequence: Number(stop.StopSequence) || null,
    arrivalTime: stop.ArrivalTime || '',
    departureTime: stop.DepartureTime || '',
    arrivalTimestamp,
    departureTimestamp
  };
}

function segmentJourneyStops(rawStops, stations, date, originId, destinationId) {
  const stationMap = new Map();
  stations.forEach((station) => {
    stationMap.set(station.id, station);
    stationMap.set(station.stationId, station);
  });
  let previousTimestamp = null;
  const stops = rawStops.map((stop) => {
    const mapped = mapJourneyStop(stop, stationMap, date, previousTimestamp);
    previousTimestamp = mapped.departureTimestamp ?? mapped.arrivalTimestamp ?? previousTimestamp;
    return mapped;
  });
  const originIndex = stops.findIndex((stop) => stop.id === String(originId));
  const destinationIndex = stops.findIndex((stop, index) => index > originIndex && stop.id === String(destinationId));
  if (originIndex < 0 || destinationIndex < 0) return null;
  return stops.slice(originIndex, destinationIndex + 1);
}

function journeySearchWindow(departure) {
  const now = Date.now();
  const nearNow = Math.abs(departure.timestamp - now) <= 2 * 60 * 60 * 1000;
  return {
    start: Math.max(departure.timestamp, now) - 30_000,
    end: departure.timestamp + 8 * 60 * 60 * 1000,
    now,
    nearNow
  };
}

function mapRailTrips(entries, stations, date, mode) {
  const stationMap = new Map();
  stations.forEach((station) => {
    stationMap.set(station.id, station);
    stationMap.set(station.stationId, station);
  });
  return entries.map((entry) => {
    const trainInfo = entry.TrainInfo || entry.DailyTrainInfo || {};
    let previousTimestamp = null;
    const stops = asArray(entry.StopTimes).map((stop) => {
      const mapped = mapJourneyStop(stop, stationMap, date, previousTimestamp);
      previousTimestamp = mapped.departureTimestamp ?? mapped.arrivalTimestamp ?? previousTimestamp;
      return mapped;
    });
    const trainNo = String(trainInfo.TrainNo || '');
    return {
      mode,
      trainInfo,
      trainNo,
      title: `${mode === 'tra' ? localizedText(trainInfo.TrainTypeName) || '臺鐵' : '高鐵'} ${trainNo} 次`,
      stops
    };
  }).filter((trip) => trip.trainNo && trip.stops.length >= 2);
}

function cachedRailTrips(entries, stationData, date, mode) {
  let byStationPayload = railJourneyDerivedCache.get(entries);
  if (!byStationPayload) {
    byStationPayload = new WeakMap();
    railJourneyDerivedCache.set(entries, byStationPayload);
  }
  let byDateAndMode = byStationPayload.get(stationData.raw);
  if (!byDateAndMode) {
    byDateAndMode = new Map();
    byStationPayload.set(stationData.raw, byDateAndMode);
  }
  const key = `${mode}:${date}`;
  if (!byDateAndMode.has(key)) {
    byDateAndMode.set(key, mapRailTrips(entries, stationData.stations, date, mode));
  }
  return byDateAndMode.get(key);
}

function buildRailJourneyNetwork(mode, date, stations, trips, fareEntries) {
  const occurrences = new Map();
  trips.forEach((trip) => {
    trip.stops.forEach((stop, index) => {
      if (!occurrences.has(stop.id)) occurrences.set(stop.id, []);
      occurrences.get(stop.id).push({ trip, index });
    });
  });
  return { mode, date, stations, trips, fareEntries, occurrences };
}

function railJourneyNetworkSnapshot(network, updatedAt = Date.now()) {
  return {
    updatedAt: new Date(updatedAt).toISOString(),
    mode: network.mode,
    date: network.date,
    stations: network.stations,
    trips: network.trips,
    fareEntries: network.fareEntries
  };
}

function hydrateRailJourneyNetwork(snapshot) {
  if (!Array.isArray(snapshot?.stations) || !Array.isArray(snapshot?.trips)
    || !Array.isArray(snapshot?.fareEntries)) return null;
  return buildRailJourneyNetwork(
    snapshot.mode, snapshot.date, snapshot.stations, snapshot.trips, snapshot.fareEntries
  );
}

async function refreshRailJourneyNetwork(mode, date, cacheKey) {
  const entry = railJourneyNetworkCache.get(cacheKey) || {
    network: null, updatedAt: 0, lastAccessAt: 0, pending: null, mode, date
  };
  if (entry.pending) return entry.pending;
  entry.pending = (async () => {
    const timetablePath = mode === 'tra'
      ? `v3/Rail/TRA/DailyTrainTimetable/TrainDate/${date}`
      : `v2/Rail/THSR/DailyTimetable/TrainDate/${date}`;
    const farePath = mode === 'tra' ? 'v2/Rail/TRA/ODFare' : 'v2/Rail/THSR/ODFare';
    const timetableParameters = { '$top': 10000 };
    const fareParameters = {
      '$top': 10000,
      '$select': 'OriginStationID,DestinationStationID,Fares'
    };
    const fareRequest = fetchJourneyTdx(farePath, fareParameters);
    let fareTimer;
    const fareOutcomePromise = Promise.race([
      fareRequest.then((payload) => ({ payload })).catch((error) => ({ error })),
      new Promise((resolve) => {
        fareTimer = setTimeout(() => resolve({ pending: true }), JOURNEY_FARE_INITIAL_WAIT_MS);
        fareTimer.unref?.();
      })
    ]).finally(() => clearTimeout(fareTimer));
    const [stationData, timetablePayload, fareOutcome] = await Promise.all([
      fetchJourneyStationData(mode),
      fetchJourneyTdx(timetablePath, timetableParameters),
      fareOutcomePromise
    ]);
    const timetableEntries = asArray(timetablePayload, ['TrainTimetables']);
    const trips = cachedRailTrips(timetableEntries, stationData, date, mode);
    const initialFareEntries = fareOutcome.payload
      ? compactJourneyFareEntries(asArray(fareOutcome.payload))
      : asArray(entry.network?.fareEntries);
    const network = buildRailJourneyNetwork(
      mode, date, stationData.stations, trips, initialFareEntries
    );
    entry.network = network;
    entry.updatedAt = Date.now();
    journeyGraphDiskCache.rail[cacheKey] = railJourneyNetworkSnapshot(network, entry.updatedAt);
    releaseJourneyTdxResponse(timetablePath, timetableParameters);
    if (fareOutcome.pending) {
      fareRequest.then((payload) => {
        if (entry.network !== network) return;
        network.fareEntries = compactJourneyFareEntries(asArray(payload));
        journeyGraphDiskCache.rail[cacheKey] = railJourneyNetworkSnapshot(network, entry.updatedAt);
        scheduleJourneyGraphPersistence();
      }).catch((error) => {
        console.error(`Unable to finish ${cacheKey} rail fares:`, error.message);
      }).finally(() => releaseJourneyTdxResponse(farePath, fareParameters));
    } else {
      if (fareOutcome.error) {
        console.error(`Unable to load ${cacheKey} rail fares:`, fareOutcome.error.message);
      }
      releaseJourneyTdxResponse(farePath, fareParameters);
    }
    pruneJourneyNetworkMemory(railJourneyNetworkCache, 6);
    scheduleJourneyGraphPersistence();
    return network;
  })().finally(() => {
    entry.pending = null;
  });
  railJourneyNetworkCache.set(cacheKey, entry);
  return entry.pending;
}

async function fetchRailJourneyNetwork(mode, date) {
  if (!tdxFetchingEnabled) throw new UpstreamError('管理員已關閉運輸資訊', 503);
  const cacheKey = `${mode}:${date}`;
  let entry = railJourneyNetworkCache.get(cacheKey);
  if (!entry) {
    const snapshot = usableJourneyGraphSnapshot('rail', cacheKey);
    const network = hydrateRailJourneyNetwork(snapshot);
    entry = {
      network,
      updatedAt: network ? Date.parse(snapshot.updatedAt) : 0,
      lastAccessAt: Date.now(),
      pending: null,
      mode,
      date
    };
    railJourneyNetworkCache.set(cacheKey, entry);
  }
  entry.lastAccessAt = Date.now();
  if (entry.network) {
    if (Date.now() - entry.updatedAt >= JOURNEY_STATIC_REFRESH_INTERVAL_MS) {
      refreshRailJourneyNetwork(mode, date, cacheKey).catch((error) => {
        console.error(`Unable to refresh ${cacheKey} rail graph:`, error.message);
      });
    }
    return entry.network;
  }
  try {
    return await refreshRailJourneyNetwork(mode, date, cacheKey);
  } catch (error) {
    if (error.status === 400) {
      throw new UpstreamError(`TDX 尚未提供 ${date} 的${JOURNEY_MODE_LABELS[mode]}班表`, 422);
    }
    throw error;
  }
}

function railTripSegment(trip, fromIndex, toIndex, fare) {
  const stops = trip.stops.slice(fromIndex, toIndex + 1);
  const departureTimestamp = stops[0]?.departureTimestamp ?? stops[0]?.arrivalTimestamp;
  const arrivalTimestamp = stops.at(-1)?.arrivalTimestamp ?? stops.at(-1)?.departureTimestamp;
  return {
    mode: trip.mode,
    title: trip.title,
    trainNo: trip.trainNo,
    origin: stops[0]?.name || '',
    destination: stops.at(-1)?.name || '',
    departureTime: formatJourneyClock(departureTimestamp),
    arrivalTime: formatJourneyClock(arrivalTimestamp),
    departureTimestamp,
    arrivalTimestamp,
    durationMinutes: Number.isFinite(departureTimestamp) && Number.isFinite(arrivalTimestamp)
      ? Math.max(1, Math.round((arrivalTimestamp - departureTimestamp) / 60_000))
      : null,
    fareLabel: fare.label,
    stops
  };
}

async function applyRailRealtimeOverlay(mode, results, window) {
  if (mode !== 'tra' || !window.nearNow || !results.length) return results;
  try {
    const livePayload = await fetchJourneyTdx(
      'v3/Rail/TRA/TrainLiveBoard', { '$top': 10000 }, true
    );
    const liveByTrain = new Map(asArray(livePayload, ['TrainLiveBoards']).map((entry) => [
      String(entry.TrainNo || ''), entry
    ]));
    return results.map((result, index) => {
      if (index >= 5 || !result.tracking?.trainNo) return result;
      const live = liveByTrain.get(String(result.tracking.trainNo));
      if (!live) return result;
      const delayMinutes = Number(live.DelayTime);
      const stationName = localizedText(live.StationName) || '沿線車站';
      return {
        ...result,
        isActive: true,
        canTrack: true,
        statusLabel: `列車已行駛至 ${stationName}${Number.isFinite(delayMinutes) ? `，延誤 ${delayMinutes} 分鐘` : ''}`,
        realtime: {
          stationId: String(live.StationID || ''),
          stationName,
          delayMinutes: Number.isFinite(delayMinutes) ? delayMinutes : null,
          observedAt: live.UpdateTime || livePayload?.UpdateTime || new Date().toISOString()
        }
      };
    });
  } catch (error) {
    console.error('Unable to apply TRA realtime overlay:', error.message);
    return results;
  }
}

async function searchRailJourneys(mode, originId, destinationId, departure, options = {}) {
  const network = await fetchRailJourneyNetwork(mode, departure.date);
  const origin = requireJourneyStation(network.stations, originId, '起始站');
  const destination = requireJourneyStation(network.stations, destinationId, '終點站');
  if (origin.id === destination.id) throw new UpstreamError('起始站與終點站不可相同', 400);
  const fareEntries = network.fareEntries;
  const directFare = journeyFareSummary(fareEntries, origin.stationId, destination.stationId);
  const window = journeySearchWindow(departure);
  const candidateLimit = Math.max(1, Math.min(24, Number(options.candidateLimit) || 24));
  const directResults = (network.occurrences.get(origin.stationId) || []).flatMap((occurrence) => {
    const { trip, index: originIndex } = occurrence;
    const destinationIndex = trip.stops.findIndex((stop, index) => (
      index > originIndex && stop.id === destination.stationId
    ));
    if (originIndex < 0 || destinationIndex < 0) return [];
    const leg = railTripSegment(trip, originIndex, destinationIndex, directFare);
    if (!Number.isFinite(leg.departureTimestamp) || !Number.isFinite(leg.arrivalTimestamp)
      || leg.departureTimestamp < window.start || leg.departureTimestamp > window.end) return [];
    const tripDepartureTimestamp = trip.stops[0]?.departureTimestamp ?? trip.stops[0]?.arrivalTimestamp;
    const tripArrivalTimestamp = trip.stops.at(-1)?.arrivalTimestamp
      ?? trip.stops.at(-1)?.departureTimestamp;
    const isActive = window.nearNow
      && Number.isFinite(tripDepartureTimestamp) && Number.isFinite(tripArrivalTimestamp)
      && window.now >= tripDepartureTimestamp && window.now <= tripArrivalTimestamp
      && Number(trip.trainInfo.SuspendedFlag || 0) !== 1;
    return [{
      id: `${mode}:${departure.date}:${trip.trainNo}:${origin.stationId}:${destination.stationId}`,
      mode,
      title: trip.title,
      subtitle: `${origin.name} → ${destination.name}`,
      departureTime: leg.departureTime,
      arrivalTime: leg.arrivalTime,
      durationMinutes: leg.durationMinutes,
      fareLabel: directFare.label,
      farePrices: directFare.prices,
      transferCount: 0,
      transfers: [],
      legs: [leg],
      isActive,
      canTrack: isActive,
      statusLabel: isActive ? '目前行駛中，可追蹤' : '直達班次',
      sortTimestamp: leg.departureTimestamp,
      boardingTimestamp: leg.departureTimestamp,
      tracking: {
        mode, date: departure.date, trainNo: trip.trainNo,
        originId: origin.stationId, destinationId: destination.stationId
      }
    }];
  });

  const transferResults = [];
  if (!directResults.length) {
    const inboundByStation = new Map();
    (network.occurrences.get(destination.stationId) || []).forEach(({ trip, index: destinationIndex }) => {
      for (let index = 0; index < destinationIndex; index += 1) {
        const stationId = trip.stops[index].id;
        if (!inboundByStation.has(stationId)) inboundByStation.set(stationId, []);
        inboundByStation.get(stationId).push({ trip, fromIndex: index, toIndex: destinationIndex });
      }
    });
    (network.occurrences.get(origin.stationId) || []).forEach(({ trip: firstTrip, index: originIndex }) => {
      const firstDeparture = firstTrip.stops[originIndex].departureTimestamp
        ?? firstTrip.stops[originIndex].arrivalTimestamp;
      if (!Number.isFinite(firstDeparture) || firstDeparture < window.start || firstDeparture > window.end) return;
      for (let transferIndex = originIndex + 1; transferIndex < firstTrip.stops.length; transferIndex += 1) {
        const transferStop = firstTrip.stops[transferIndex];
        if (transferStop.id === destination.stationId) break;
        const arrival = transferStop.arrivalTimestamp ?? transferStop.departureTimestamp;
        if (!Number.isFinite(arrival)) continue;
        const connections = (inboundByStation.get(transferStop.id) || [])
          .filter(({ trip, fromIndex }) => {
            if (trip.trainNo === firstTrip.trainNo) return false;
            const nextDeparture = trip.stops[fromIndex].departureTimestamp ?? trip.stops[fromIndex].arrivalTimestamp;
            return Number.isFinite(nextDeparture)
              && nextDeparture >= arrival + 5 * 60_000
              && nextDeparture <= arrival + 120 * 60_000;
          })
          .sort((left, right) => (
            (left.trip.stops[left.fromIndex].departureTimestamp || Infinity)
            - (right.trip.stops[right.fromIndex].departureTimestamp || Infinity)
          ));
        const connection = connections[0];
        if (!connection) continue;
        const firstFare = journeyFareSummary(fareEntries, origin.stationId, transferStop.id);
        const secondFare = journeyFareSummary(fareEntries, transferStop.id, destination.stationId);
        const combinedFare = combineJourneyFares([firstFare, secondFare]);
        const firstLeg = railTripSegment(firstTrip, originIndex, transferIndex, firstFare);
        const secondLeg = railTripSegment(
          connection.trip, connection.fromIndex, connection.toIndex, secondFare
        );
        const waitMinutes = Math.max(0, Math.round(
          (secondLeg.departureTimestamp - firstLeg.arrivalTimestamp) / 60_000
        ));
        transferResults.push({
          id: `${mode}:${departure.date}:${firstTrip.trainNo}:${connection.trip.trainNo}:${transferStop.id}`,
          mode,
          title: `${firstTrip.title} → ${connection.trip.title}`,
          subtitle: `${origin.name} → ${transferStop.name} 轉乘 → ${destination.name}`,
          departureTime: firstLeg.departureTime,
          arrivalTime: secondLeg.arrivalTime,
          durationMinutes: Math.max(1, Math.round(
            (secondLeg.arrivalTimestamp - firstLeg.departureTimestamp) / 60_000
          )),
          fareLabel: combinedFare.label,
          farePrices: combinedFare.prices,
          transferCount: 1,
          transfers: [{
            stationId: transferStop.id,
            stationName: transferStop.name,
            waitMinutes,
            lat: transferStop.lat,
            lng: transferStop.lng
          }],
          legs: [firstLeg, secondLeg],
          isActive: false,
          canTrack: false,
          statusLabel: `於 ${transferStop.name} 轉乘，預留 ${waitMinutes} 分鐘`,
          sortTimestamp: firstLeg.departureTimestamp,
          boardingTimestamp: firstLeg.departureTimestamp
        });
      }
    });
  }
  let results = [...directResults, ...transferResults]
    .sort((left, right) => Number(right.isActive) - Number(left.isActive)
      || left.transferCount - right.transferCount
      || left.sortTimestamp - right.sortTimestamp)
    .filter((result, index, all) => all.findIndex((entry) => entry.id === result.id) === index)
    .slice(0, candidateLimit)
    .map(({ sortTimestamp, ...result }) => result);
  if (options.includeRealtime !== false) {
    results = await applyRailRealtimeOverlay(mode, results, window);
  }
  return { origin, destination, results };
}

function activeBusScheduleLabel(schedule, timestamp) {
  const minutes = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(timestamp)).replace(':', ''));
  const frequency = asArray(schedule?.Frequencys).find((entry) => {
    if (!serviceDayMatches(entry.ServiceDay, timestamp)) return false;
    const start = Number(String(entry.StartTime || '').replace(':', ''));
    let end = Number(String(entry.EndTime || '').replace(':', ''));
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    if (end === 0) end = 2400;
    return minutes >= start && minutes <= end;
  });
  if (!frequency) return 'TDX 未提供此時段班距';
  const min = Number(frequency.MinHeadwayMins);
  const max = Number(frequency.MaxHeadwayMins);
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return min === max ? `約每 ${min} 分鐘一班` : `約每 ${min}～${max} 分鐘一班`;
  }
  return '依現場班表行駛';
}

function busFareSummary(description) {
  const label = String(description || 'TDX 未提供明確票價').trim();
  const prices = [...label.matchAll(/(?:^|\D)(\d{1,3})(?=\D|$)/g)]
    .map((match) => Number(match[1]))
    .filter((price) => price > 0 && price <= 500);
  return { label, prices: [...new Set(prices)] };
}

function compactBusScheduleEntries(entries) {
  return entries.map((entry) => ({
    RouteUID: entry.RouteUID,
    RouteID: entry.RouteID,
    Direction: entry.Direction ?? null,
    Frequencys: asArray(entry.Frequencys).map((frequency) => ({
      ServiceDay: frequency.ServiceDay,
      StartTime: frequency.StartTime,
      EndTime: frequency.EndTime,
      MinHeadwayMins: frequency.MinHeadwayMins,
      MaxHeadwayMins: frequency.MaxHeadwayMins
    }))
  }));
}

function mapBusJourneyRoutes(stopOfRoutePayload, stationData, routeDefinitions, schedules, departureTimestamp) {
  const cacheKey = stopOfRoutePayload && typeof stopOfRoutePayload === 'object'
    ? stopOfRoutePayload
    : null;
  const cached = cacheKey ? busJourneyDerivedCache.get(cacheKey) : null;
  if (cached
    && cached.stationEntries === stationData.raw
    && cached.routeDefinitions === routeDefinitions
    && cached.schedules === schedules) {
    return cached.routes.map((route) => ({
      ...route,
      scheduleLabel: activeBusScheduleLabel(route.schedule, departureTimestamp)
    }));
  }
  const stopToStation = new Map();
  stationData.raw.forEach((station) => {
    const stationId = String(station.StationUID || station.StationID || '');
    asArray(station.Stops).forEach((stop) => {
      const stopUid = String(stop.StopUID || stop.StopID || '');
      if (stopUid && stationId) stopToStation.set(stopUid, stationId);
    });
  });
  const definitionsByExactRoute = new Map();
  const definitionsWithoutSubRoute = new Map();
  const firstDefinitionByRoute = new Map();
  routeDefinitions.forEach((route) => {
    const routeUid = String(route.RouteUID || route.RouteID || '');
    if (!routeUid) return;
    const subRouteUid = String(route.SubRouteUID || route.SubRouteID || '');
    if (subRouteUid) definitionsByExactRoute.set(`${routeUid}|${subRouteUid}`, route);
    else definitionsWithoutSubRoute.set(routeUid, route);
    if (!firstDefinitionByRoute.has(routeUid)) firstDefinitionByRoute.set(routeUid, route);
  });
  const schedulesByRoute = new Map();
  const firstScheduleByRoute = new Map();
  schedules.forEach((schedule) => {
    const routeUid = String(schedule.RouteUID || schedule.RouteID || '');
    const direction = schedule.Direction ?? null;
    if (routeUid && !schedulesByRoute.has(`${routeUid}|${direction ?? ''}`)) {
      schedulesByRoute.set(`${routeUid}|${direction ?? ''}`, schedule);
    }
    if (routeUid && !firstScheduleByRoute.has(routeUid)) firstScheduleByRoute.set(routeUid, schedule);
  });
  const routes = asArray(stopOfRoutePayload).map((item) => {
    const routeUid = String(item.RouteUID || item.RouteID || '');
    const subRouteUid = String(item.SubRouteUID || item.SubRouteID || '');
    const direction = item.Direction ?? null;
    const routeName = localizedText(item.RouteName || item.SubRouteName) || '未標示路線';
    const definition = definitionsByExactRoute.get(`${routeUid}|${subRouteUid}`)
      || definitionsWithoutSubRoute.get(routeUid)
      || (!subRouteUid ? firstDefinitionByRoute.get(routeUid) : null);
    const schedule = schedulesByRoute.get(`${routeUid}|${direction ?? ''}`)
      || (direction === null ? firstScheduleByRoute.get(routeUid) : null);
    const fare = busFareSummary(definition?.TicketPriceDescriptionZh);
    const stops = asArray(item.Stops).map((stop, index) => {
      const stopUid = String(stop.StopUID || stop.StopID || '');
      const position = positionOf(stop);
      return {
        id: stopToStation.get(stopUid) || `stop:${stopUid}`,
        stopUid,
        name: localizedText(stop.StopName) || stopUid,
        sequence: Number(stop.StopSequence) || index + 1,
        lat: Number.isFinite(position.lat) ? position.lat : null,
        lng: Number.isFinite(position.lng) ? position.lng : null
      };
    });
    return {
      routeUid,
      subRouteUid,
      routeName,
      direction,
      fare,
      schedule,
      stops,
      key: `${routeUid}|${subRouteUid}|${direction}`
    };
  }).filter((route) => route.routeUid && route.stops.length >= 2);
  if (cacheKey) {
    busJourneyDerivedCache.set(cacheKey, {
      stationEntries: stationData.raw,
      routeDefinitions,
      schedules,
      routes,
      network: buildBusJourneyNetwork(stationData.stations, routes)
    });
  }
  return routes.map((route) => ({
    ...route,
    scheduleLabel: activeBusScheduleLabel(route.schedule, departureTimestamp)
  }));
}

function buildBusJourneyNetwork(stations, routes) {
  const occurrences = new Map();
  routes.forEach((route) => {
    route.stops.forEach((stop, index) => {
      if (!occurrences.has(stop.id)) occurrences.set(stop.id, []);
      occurrences.get(stop.id).push({ route, index });
    });
  });
  const transferStations = new Set([...occurrences].flatMap(([stationId, entries]) => (
    new Set(entries.map((entry) => entry.route.key)).size > 1 ? [stationId] : []
  )));
  return {
    stations,
    stationById: new Map(stations.flatMap((station) => [
      [station.id, station],
      ...(station.stationId && station.stationId !== station.id ? [[station.stationId, station]] : [])
    ])),
    routes,
    occurrences,
    transferStations
  };
}

function busJourneyNetworkSnapshot(network, updatedAt = Date.now()) {
  return {
    updatedAt: new Date(updatedAt).toISOString(),
    stations: network.stations,
    routes: network.routes
  };
}

function hydrateBusJourneyNetwork(snapshot) {
  if (!Array.isArray(snapshot?.stations) || !Array.isArray(snapshot?.routes)) return null;
  return buildBusJourneyNetwork(snapshot.stations, snapshot.routes);
}

async function refreshBusJourneyNetwork(scope, cacheKey) {
  const entry = busJourneyNetworkCache.get(cacheKey) || {
    network: null, updatedAt: 0, lastAccessAt: 0, pending: null, scope
  };
  if (entry.pending) return entry.pending;
  entry.pending = (async () => {
    const stopOfRoutePath = busJourneyPath('StopOfRoute', scope.tdxCity);
    const routePath = busJourneyPath('Route', scope.tdxCity);
    const schedulePath = busJourneyPath('Schedule', scope.tdxCity);
    const stopOfRouteParameters = { '$top': 10000 };
    const routeParameters = { '$top': 10000 };
    const scheduleParameters = {
      '$top': 10000,
      '$select': 'RouteUID,RouteID,Direction,Frequencys'
    };
    const [stationData, stopOfRoutePayload, routePayload, schedulePayload] = await Promise.all([
      fetchJourneyStationData('bus', scope),
      fetchJourneyTdx(stopOfRoutePath, stopOfRouteParameters),
      fetchJourneyTdx(routePath, routeParameters),
      fetchJourneyTdx(schedulePath, scheduleParameters).catch((error) => {
        console.error(`Unable to load compact ${scope.tdxCity} bus schedules:`, error.message);
        return [];
      })
    ]);
    const compactSchedules = compactBusScheduleEntries(asArray(schedulePayload));
    mapBusJourneyRoutes(
      stopOfRoutePayload, stationData, asArray(routePayload), compactSchedules, Date.now()
    );
    const derived = busJourneyDerivedCache.get(stopOfRoutePayload);
    const network = derived?.network || buildBusJourneyNetwork(
      stationData.stations, derived?.routes || []
    );
    entry.network = network;
    entry.updatedAt = Date.now();
    journeyGraphDiskCache.bus[cacheKey] = busJourneyNetworkSnapshot(network, entry.updatedAt);
    releaseJourneyTdxResponse(stopOfRoutePath, stopOfRouteParameters);
    releaseJourneyTdxResponse(routePath, routeParameters);
    releaseJourneyTdxResponse(schedulePath, scheduleParameters);
    pruneJourneyNetworkMemory(busJourneyNetworkCache, 4);
    scheduleJourneyGraphPersistence();
    return network;
  })().finally(() => {
    entry.pending = null;
  });
  busJourneyNetworkCache.set(cacheKey, entry);
  return entry.pending;
}

async function fetchBusJourneyNetwork(scope) {
  if (!tdxFetchingEnabled) throw new UpstreamError('管理員已關閉運輸資訊', 503);
  const cacheKey = scope.tdxCity;
  let entry = busJourneyNetworkCache.get(cacheKey);
  if (!entry) {
    const snapshot = usableJourneyGraphSnapshot('bus', cacheKey);
    const network = hydrateBusJourneyNetwork(snapshot);
    entry = {
      network,
      updatedAt: network ? Date.parse(snapshot.updatedAt) : 0,
      lastAccessAt: Date.now(),
      pending: null,
      scope
    };
    busJourneyNetworkCache.set(cacheKey, entry);
  }
  entry.lastAccessAt = Date.now();
  if (entry.network) {
    if (Date.now() - entry.updatedAt >= JOURNEY_STATIC_REFRESH_INTERVAL_MS) {
      refreshBusJourneyNetwork(scope, cacheKey).catch((error) => {
        console.error(`Unable to refresh ${cacheKey} bus graph:`, error.message);
      });
    }
    return entry.network;
  }
  return refreshBusJourneyNetwork(scope, cacheKey);
}

function busJourneyLeg(route, fromIndex, toIndex, departureTimestamp = Date.now()) {
  const stops = route.stops.slice(fromIndex, toIndex + 1);
  const scheduleLabel = activeBusScheduleLabel(route.schedule, departureTimestamp);
  return {
    mode: 'bus',
    routeUid: route.routeUid,
    routeName: route.routeName,
    direction: route.direction,
    title: `${route.routeName}・${route.direction === 0 ? '去程' : route.direction === 1 ? '返程' : '指定方向'}`,
    origin: stops[0]?.name || '',
    destination: stops.at(-1)?.name || '',
    departureTime: scheduleLabel,
    arrivalTime: '依路況與到站預估',
    durationMinutes: null,
    fareLabel: route.fare.label,
    stops
  };
}

function busBoardingTimestamp(estimate, referenceTimestamp = Date.now()) {
  const rawEstimateSeconds = estimate?.EstimateTime;
  const estimateSeconds = rawEstimateSeconds === null || rawEstimateSeconds === ''
    ? NaN
    : Number(rawEstimateSeconds);
  if (Number.isFinite(estimateSeconds) && estimateSeconds >= 0) {
    return referenceTimestamp + estimateSeconds * 1000;
  }
  const nextBusTimestamp = Date.parse(String(estimate?.NextBusTime || ''));
  return Number.isFinite(nextBusTimestamp) ? nextBusTimestamp : null;
}

function busBoardingEstimates(etaItems, route, origin, departure, referenceTimestamp = Date.now()) {
  const originStopUids = new Set(origin.stopUids || []);
  const earliestAllowed = Math.max(departure.timestamp, referenceTimestamp) - 30_000;
  const latestAllowed = departure.timestamp + 8 * 60 * 60 * 1000;
  const matching = etaItems.flatMap((estimate) => {
    const routeUid = String(estimate.RouteUID || estimate.RouteID || '');
    const routeName = localizedText(estimate.RouteName || estimate.SubRouteName);
    const stopUid = String(estimate.StopUID || estimate.StopID || '');
    const sameRoute = routeUid ? routeUid === route.routeUid : routeName === route.routeName;
    if (!sameRoute || !originStopUids.has(stopUid)
      || (route.direction !== null && estimate.Direction !== route.direction)
      || [2, 3, 4].includes(Number(estimate.StopStatus))) return [];
    const boardingTimestamp = busBoardingTimestamp(estimate, referenceTimestamp);
    if (!Number.isFinite(boardingTimestamp)
      || boardingTimestamp < earliestAllowed || boardingTimestamp > latestAllowed) return [];
    return [{
      boardingTimestamp,
      estimateSeconds: estimate.EstimateTime !== null && estimate.EstimateTime !== ''
        && Number.isFinite(Number(estimate.EstimateTime))
        ? Number(estimate.EstimateTime)
        : null,
      plateNumber: String(estimate.PlateNumb || ''),
      stopUid
    }];
  }).sort((left, right) => left.boardingTimestamp - right.boardingTimestamp);
  return matching.filter((estimate, index, all) => {
    const key = estimate.plateNumber || `${route.key}:${Math.round(estimate.boardingTimestamp / 60_000)}`;
    return all.findIndex((candidate) => (
      candidate.plateNumber || `${route.key}:${Math.round(candidate.boardingTimestamp / 60_000)}`
    ) === key) === index;
  });
}

function busScheduledBoardingEstimates(route, origin, departure, allowUnverified = false) {
  const originStopUids = new Set(origin.stopUids || []);
  const earliestAllowed = Math.max(departure.timestamp, Date.now()) - 30_000;
  const latestAllowed = departure.timestamp + 8 * 60 * 60 * 1000;
  const exactTimes = asArray(route.schedule?.Timetables).flatMap((timetable) => {
    if (!serviceDayMatches(timetable.ServiceDay || route.schedule?.ServiceDay, departure.timestamp)) return [];
    const stopTime = asArray(timetable.StopTimes).find((stop) => (
      originStopUids.has(String(stop.StopUID || stop.StopID || ''))
    ));
    const boardingTimestamp = taipeiTimestamp(
      departure.date,
      stopTime?.DepartureTime || stopTime?.ArrivalTime
    );
    if (!Number.isFinite(boardingTimestamp)
      || boardingTimestamp < earliestAllowed || boardingTimestamp > latestAllowed) return [];
    return [{ boardingTimestamp, estimateSeconds: null, plateNumber: '', scheduled: true }];
  }).sort((left, right) => left.boardingTimestamp - right.boardingTimestamp);
  if (exactTimes.length) return exactTimes.slice(0, 4);
  if (activeBusScheduleLabel(route.schedule, departure.timestamp).startsWith('TDX 未提供此時段班距')) {
    return allowUnverified ? [{
      boardingTimestamp: Math.max(departure.timestamp, Date.now()),
      estimateSeconds: null,
      plateNumber: '',
      scheduled: true,
      unverified: true
    }] : [];
  }
  return [{
    boardingTimestamp: Math.max(departure.timestamp, Date.now()),
    estimateSeconds: null,
    plateNumber: '',
    scheduled: true
  }];
}

function findDirectBusPaths(network, originId, destinationId, limit = 40) {
  return (network.occurrences.get(originId) || []).flatMap(({ route, index: originIndex }) => {
    const destinationIndex = route.stops.findIndex((stop, index) => (
      index > originIndex && stop.id === destinationId
    ));
    return destinationIndex > originIndex ? [{ route, originIndex, destinationIndex }] : [];
  }).slice(0, limit);
}

function findBusTransferPaths(
  network, originId, destinationId, maximumTransfers = 2, maximumPaths = 40
) {
  const { occurrences, transferStations } = network;
  const queue = [{ stationId: originId, legs: [], visited: new Set([originId]) }];
  const paths = [];
  let processed = 0;
  let queueIndex = 0;
  while (queueIndex < queue.length && paths.length < maximumPaths && processed < 1800) {
    const current = queue[queueIndex];
    queueIndex += 1;
    processed += 1;
    for (const occurrence of occurrences.get(current.stationId) || []) {
      if (current.legs.at(-1)?.route.key === occurrence.route.key) continue;
      for (let toIndex = occurrence.index + 1; toIndex < occurrence.route.stops.length; toIndex += 1) {
        const stop = occurrence.route.stops[toIndex];
        if (stop.id === destinationId) {
          const legs = [...current.legs, { route: occurrence.route, fromIndex: occurrence.index, toIndex }];
          if (legs.length > 1) paths.push(legs);
          continue;
        }
        if (!transferStations.has(stop.id)) continue;
        const legs = [...current.legs, { route: occurrence.route, fromIndex: occurrence.index, toIndex }];
        if (legs.length > maximumTransfers || current.visited.has(stop.id)) continue;
        queue.push({ stationId: stop.id, legs, visited: new Set([...current.visited, stop.id]) });
      }
    }
  }
  return paths.filter((legs, index, all) => {
    const signature = legs.map((leg) => `${leg.route.key}:${leg.route.stops[leg.toIndex].id}`).join('|');
    return all.findIndex((candidate) => candidate.map((leg) => (
      `${leg.route.key}:${leg.route.stops[leg.toIndex].id}`
    )).join('|') === signature) === index;
  });
}

async function fetchBusEtaOverlayPayload(stopFilter, scope) {
  if (!stopFilter) return [];
  const normalized = normalizeStopFilter(stopFilter);
  const cacheKey = normalized.normalized;
  const cached = journeyBusEtaOverlayCache.get(cacheKey);
  etaTrace({
    source: 'fetchBusEtaOverlayPayload',
    city: scope?.tdxCity,
    rawFilter: normalized.raw,
    normalizedFilter: normalized.normalized,
    cacheKey,
    cacheState: cached ? {
      hasData: Boolean(cached.data), hasPending: Boolean(cached.pending), expiresAt: cached.expiresAt
    } : null,
    requestedUids: normalized.uids,
    event: 'lookup'
  });
  if (cached?.data && cached.expiresAt > Date.now()) {
    etaTrace({ source: 'fetchBusEtaOverlayPayload', cacheKey, event: 'exactHit' });
    return cached.data;
  }

  const requestedSet = new Set(normalized.uids);
  for (const [existingKey, entry] of journeyBusEtaOverlayCache.entries()) {
    if (!entry) continue;
    const existingUids = Array.from(String(existingKey).matchAll(/StopUID eq '([^']+)'/g)).map((m) => m[1]);
    if (!existingUids.length) continue;
    const existingSet = new Set(existingUids);
    let isSuperset = true;
    for (const uid of requestedSet) if (!existingSet.has(uid)) { isSuperset = false; break; }
    if (isSuperset && entry.expiresAt > Date.now()) {
      etaTrace({
        source: 'fetchBusEtaOverlayPayload',
        cacheKey,
        usedSupersetKey: existingKey,
        existingUids,
        event: 'supersetHit'
      });
      if (entry.data) return entry.data;
      if (entry.pending) return entry.pending;
    }
  }

  if (cached?.data) {
    etaTrace({ source: 'fetchBusEtaOverlayPayload', cacheKey, event: 'staleReturn' });
    if (!cached.pending) {
      const pending = fetchJourneyTdx(busJourneyPath('EstimatedTimeOfArrival', scope.tdxCity), {
        '$filter': stopFilter,
        '$top': 1000
      }, true, { refreshIntervalMs: Math.max(JOURNEY_LIVE_REFRESH_INTERVAL_MS, 15_000), backgroundRefresh: false })
        .then((payload) => {
          const entry = journeyBusEtaOverlayCache.get(cacheKey);
          if (entry) {
            entry.data = payload;
            entry.expiresAt = Date.now() + JOURNEY_LIVE_REFRESH_INTERVAL_MS;
          }
          return payload;
        }).finally(() => {
          const entry = journeyBusEtaOverlayCache.get(cacheKey);
          if (entry?.pending === pending) entry.pending = null;
        });

      cached.pending = pending;
    }
    return cached.data;
  }

  if (cached?.pending) {
    etaTrace({ source: 'fetchBusEtaOverlayPayload', cacheKey, event: 'pendingHit' });
    return cached.pending;
  }

  etaTrace({ source: 'fetchBusEtaOverlayPayload', cacheKey, event: 'miss' });
  const pending = fetchJourneyTdx(busJourneyPath('EstimatedTimeOfArrival', scope.tdxCity), {
    '$filter': stopFilter,
    '$top': 1000
  }, true, { refreshIntervalMs: Math.max(JOURNEY_LIVE_REFRESH_INTERVAL_MS, 15_000), backgroundRefresh: false }).then((payload) => {
    const entry = journeyBusEtaOverlayCache.get(cacheKey);
    if (entry) {
      entry.data = payload;
      entry.expiresAt = Date.now() + JOURNEY_LIVE_REFRESH_INTERVAL_MS;
    }
    return payload;
  }).finally(() => {
    const entry = journeyBusEtaOverlayCache.get(cacheKey);
    if (entry?.pending === pending) entry.pending = null;
  });

  journeyBusEtaOverlayCache.set(cacheKey, {
    data: null,
    pending,
    expiresAt: Date.now() + JOURNEY_LIVE_REFRESH_INTERVAL_MS
  });
  return pending;
}

async function searchBusJourneys(scope, originId, destinationId, departure, options = {}) {
  const network = await fetchBusJourneyNetwork(scope);
  const origin = requireJourneyStation(network.stations, originId, '起始站');
  const destination = requireJourneyStation(network.stations, destinationId, '終點站');
  if (origin.id === destination.id) throw new UpstreamError('起始站與終點站不可相同', 400);
  const candidateLimit = Math.max(1, Math.min(40, Number(options.candidateLimit) || 40));
  const directMatches = findDirectBusPaths(network, origin.id, destination.id, candidateLimit);
  const stopFilter = (origin.stopUids || [])
    .map((stopUid) => `StopUID eq '${String(stopUid).replaceAll("'", "''")}'`)
    .join(' or ');
  let etaUnavailable = false;
  const etaPayload = options.includeRealtime !== false && stopFilter
    ? await fetchBusEtaOverlayPayload(stopFilter, scope).catch((error) => {
      if (!tdxFetchingEnabled || error.message === '管理員已關閉運輸資訊') throw error;
      etaUnavailable = true;
      console.error(`Unable to apply ${scope.tdxCity} bus ETA overlay:`, error.message);
      return [];
    })
    : [];
  const etaItems = asArray(etaPayload);
  const allowUnverifiedSchedule = options.includeRealtime === false
    || etaUnavailable
    || Math.abs(departure.timestamp - Date.now()) > 2 * 60 * 60 * 1000;
  const currentVehicles = nationwideBusSnapshot.byCity[scope.portalCityCode] || [];
  const vehicleByPlate = new Map(currentVehicles
    .filter((vehicle) => vehicle.plateNumber)
    .map((vehicle) => [vehicle.plateNumber, vehicle]));
  const results = [];
  directMatches.forEach(({ route, originIndex, destinationIndex }) => {
    const leg = busJourneyLeg(route, originIndex, destinationIndex, departure.timestamp);
    const realtimeEstimates = busBoardingEstimates(etaItems, route, origin, departure);
    const boardingEstimates = realtimeEstimates.length
      ? realtimeEstimates
      : busScheduledBoardingEstimates(route, origin, departure, allowUnverifiedSchedule);
    const base = {
      mode: 'bus',
      subtitle: `${origin.name} → ${destination.name}`,
      durationMinutes: null,
      fareLabel: route.fare.label,
      farePrices: route.fare.prices,
      transferCount: 0,
      transfers: [],
      legs: [leg]
    };
    boardingEstimates.forEach((estimate) => {
      const vehicle = estimate.plateNumber ? vehicleByPlate.get(estimate.plateNumber) : null;
      const arrivalMinutes = Number.isFinite(estimate.estimateSeconds)
        ? Math.max(0, Math.ceil(estimate.estimateSeconds / 60))
        : null;
      results.push({
        ...base,
        id: `bus:${scope.portalCityCode}:${estimate.plateNumber || estimate.boardingTimestamp}:${route.routeUid}:${route.direction}`,
        title: `${route.routeName}・${estimate.plateNumber || (estimate.unverified ? '班表待確認' : estimate.scheduled ? '表定班次' : '預估班次')}`,
        departureTime: formatJourneyClock(estimate.boardingTimestamp),
        arrivalTime: '依即時路況與沿線停靠更新',
        boardingTimestamp: estimate.boardingTimestamp,
        boardingEstimateMinutes: arrivalMinutes,
        isActive: Boolean(vehicle),
        canTrack: Boolean(vehicle),
        statusLabel: arrivalMinutes === null
          ? estimate.unverified
            ? '路線可銜接，實際班次請以站牌即時資訊為準'
            : '此時段有表定班次，請以站牌即時資訊為準'
          : arrivalMinutes <= 1 ? '即將抵達起點' : `約 ${arrivalMinutes} 分鐘後抵達起點`,
        ...(vehicle ? {
          tracking: {
            mode: 'bus', city: scope.portalCityCode, routeUid: route.routeUid,
            routeName: route.routeName, direction: route.direction ?? '', plateNumber: vehicle.plateNumber,
            originId: origin.id, destinationId: destination.id
          }
        } : {})
      });
    });
  });

  if (!results.length) {
    findBusTransferPaths(network, origin.id, destination.id, 4, candidateLimit).forEach((path) => {
        const realtimeEstimates = busBoardingEstimates(
          etaItems, path[0].route, origin, departure
        );
        const boardingEstimates = (realtimeEstimates.length
          ? realtimeEstimates
          : busScheduledBoardingEstimates(
            path[0].route, origin, departure, allowUnverifiedSchedule
          )).slice(0, 2);
        if (!boardingEstimates.length) return;
        const legs = path.map((pathLeg) => busJourneyLeg(
          pathLeg.route, pathLeg.fromIndex, pathLeg.toIndex, departure.timestamp
        ));
        const transfers = legs.slice(0, -1).map((leg) => ({
          stationId: leg.stops.at(-1)?.id || '',
          stationName: leg.destination,
          waitMinutes: null,
          lat: leg.stops.at(-1)?.lat ?? null,
          lng: leg.stops.at(-1)?.lng ?? null
        }));
        const combinedFare = combineJourneyFares(path.map((pathLeg) => pathLeg.route.fare));
        boardingEstimates.forEach((estimate) => {
          const arrivalMinutes = Number.isFinite(estimate.estimateSeconds)
            ? Math.max(0, Math.ceil(estimate.estimateSeconds / 60))
            : null;
          results.push({
            id: `bus:${scope.portalCityCode}:${estimate.plateNumber || estimate.boardingTimestamp}:${path.map((pathLeg) => pathLeg.route.key).join(':')}:${transfers.map((item) => item.stationId).join(':')}`,
            mode: 'bus',
            title: path.map((pathLeg) => pathLeg.route.routeName).join(' → '),
            subtitle: `${origin.name} → ${transfers.map((item) => `${item.stationName} 轉乘`).join(' → ')} → ${destination.name}`,
            departureTime: formatJourneyClock(estimate.boardingTimestamp),
            arrivalTime: '依班距、轉乘等待與路況估算',
            boardingTimestamp: estimate.boardingTimestamp,
            boardingEstimateMinutes: arrivalMinutes,
            durationMinutes: null,
            fareLabel: combinedFare.label,
            farePrices: combinedFare.prices,
            transferCount: transfers.length,
            transfers,
            legs,
            isActive: false,
            canTrack: false,
            statusLabel: arrivalMinutes === null
              ? estimate.unverified
                ? `路線可銜接，班次待確認，轉乘 ${transfers.length} 次`
                : `可搭乘，轉乘 ${transfers.length} 次`
              : `約 ${arrivalMinutes} 分鐘後抵達起點，轉乘 ${transfers.length} 次`
          });
        });
    });
  }
  const uniqueResults = results
    .filter((result, index, all) => all.findIndex((entry) => entry.id === result.id) === index)
    .sort((left, right) => left.boardingTimestamp - right.boardingTimestamp
      || left.transferCount - right.transferCount);
  return { origin, destination, results: uniqueResults.slice(0, Math.min(30, candidateLimit)) };
}

function metroRouteStops(route, stations) {
  const stationMap = new Map();
  stations.forEach((station) => {
    stationMap.set(station.id, station);
    stationMap.set(station.stationId, station);
  });
  return asArray(route?.Stations).map((stop, index) => {
    const stationId = String(stop.StationID || stop.StationUID || '');
    const station = stationMap.get(stationId);
    return {
      id: stationId,
      name: localizedText(stop.StationName) || station?.name || stationId,
      lat: station?.lat ?? null,
      lng: station?.lng ?? null,
      sequence: Number(stop.StopSequence) || index + 1
    };
  });
}

function metroStationKey(name) {
  return String(name || '').normalize('NFKC').replace(/\s+/g, '').replaceAll('台', '臺');
}

function compactMetroRouteEntries(entries) {
  return entries.map((entry) => ({
    RouteID: entry.RouteID,
    LineID: entry.LineID,
    LineNo: entry.LineNo,
    Direction: entry.Direction ?? null,
    RouteName: entry.RouteName,
    Stations: asArray(entry.Stations).map((station) => ({
      StationID: station.StationID,
      StationUID: station.StationUID,
      StationName: station.StationName,
      StopSequence: station.StopSequence
    }))
  }));
}

function compactMetroTimetableEntries(entries) {
  return entries.map((entry) => ({
    StationID: entry.StationID,
    RouteID: entry.RouteID,
    Direction: entry.Direction ?? null,
    ServiceDay: entry.ServiceDay,
    Timetables: asArray(entry.Timetables).map((timetable) => ({
      DepartureTime: timetable.DepartureTime
    }))
  }));
}

function compactMetroTravelEntries(entries) {
  return entries.map((entry) => ({
    RouteID: entry.RouteID,
    TravelTimes: asArray(entry.TravelTimes).map((travelTime) => ({
      FromStationID: travelTime.FromStationID,
      ToStationID: travelTime.ToStationID,
      RunTime: travelTime.RunTime,
      StopTime: travelTime.StopTime
    }))
  }));
}

function buildMetroJourneyNetwork(
  system, stations, routeEntries, timetableEntries, fareEntries, travelEntries
) {
  const routeRecords = routeEntries.map((route) => ({
    route,
    routeId: String(route.RouteID || ''),
    lineId: String(route.LineID || route.LineNo || route.RouteID || ''),
    direction: route.Direction ?? null,
    routeName: localizedText(route.RouteName) || String(route.RouteID || '未命名路線'),
    stops: metroRouteStops(route, stations),
    key: `${route.RouteID || ''}|${route.Direction ?? ''}`
  })).filter((record) => record.routeId && record.stops.length >= 2);
  const occurrences = new Map();
  const stationOccurrences = new Map();
  routeRecords.forEach((record) => {
    record.stops.forEach((stop, index) => {
      const key = metroStationKey(stop.name);
      if (!occurrences.has(key)) occurrences.set(key, []);
      occurrences.get(key).push({ record, index });
      if (!stationOccurrences.has(stop.id)) stationOccurrences.set(stop.id, []);
      stationOccurrences.get(stop.id).push({ record, index });
    });
  });
  const transferStations = new Set([...occurrences].filter(([, entries]) => (
    new Set(entries.map((entry) => entry.record.key)).size > 1
  )).map(([stationKey]) => stationKey));
  const timetablesByStationRoute = new Map();
  timetableEntries.forEach((entry) => {
    const key = `${entry.StationID || ''}|${entry.RouteID || ''}|${entry.Direction ?? ''}`;
    if (!timetablesByStationRoute.has(key)) timetablesByStationRoute.set(key, []);
    timetablesByStationRoute.get(key).push(entry);
  });
  const travelSecondsByRoute = new Map();
  travelEntries.forEach((entry) => {
    const routeId = String(entry.RouteID || '');
    if (!travelSecondsByRoute.has(routeId)) travelSecondsByRoute.set(routeId, new Map());
    const edges = travelSecondsByRoute.get(routeId);
    asArray(entry.TravelTimes).forEach((edge) => {
      const key = `${edge.FromStationID || ''}|${edge.ToStationID || ''}`;
      const seconds = Math.max(0, Number(edge.RunTime) || 0) + Math.max(0, Number(edge.StopTime) || 0);
      if (seconds > 0) edges.set(key, seconds);
    });
  });
  return {
    system,
    stations,
    routeEntries,
    routeRecords,
    timetableEntries,
    fareEntries,
    travelEntries,
    occurrences,
    stationOccurrences,
    transferStations,
    timetablesByStationRoute,
    travelSecondsByRoute
  };
}

function metroJourneyNetworkSnapshot(network, updatedAt = Date.now()) {
  return {
    updatedAt: new Date(updatedAt).toISOString(),
    system: network.system,
    stations: network.stations,
    routeEntries: network.routeEntries,
    timetableEntries: network.timetableEntries,
    fareEntries: network.fareEntries,
    travelEntries: network.travelEntries
  };
}

function hydrateMetroJourneyNetwork(snapshot) {
  if (!Array.isArray(snapshot?.stations) || !Array.isArray(snapshot?.routeEntries)
    || !Array.isArray(snapshot?.timetableEntries) || !Array.isArray(snapshot?.fareEntries)
    || !Array.isArray(snapshot?.travelEntries)) return null;
  return buildMetroJourneyNetwork(
    snapshot.system,
    snapshot.stations,
    snapshot.routeEntries,
    snapshot.timetableEntries,
    snapshot.fareEntries,
    snapshot.travelEntries
  );
}

async function refreshMetroJourneyNetwork(scope, cacheKey) {
  const entry = metroJourneyNetworkCache.get(cacheKey) || {
    network: null, updatedAt: 0, lastAccessAt: 0, pending: null, scope
  };
  if (entry.pending) return entry.pending;
  entry.pending = (async () => {
    const routePath = `v2/Rail/Metro/StationOfRoute/${scope.system}`;
    const timetablePath = `v2/Rail/Metro/StationTimeTable/${scope.system}`;
    const farePath = `v2/Rail/Metro/ODFare/${scope.system}`;
    const travelPath = `v2/Rail/Metro/S2STravelTime/${scope.system}`;
    const routeParameters = { '$top': 10000, '$select': 'RouteID,LineID,LineNo,Direction,RouteName,Stations' };
    const timetableParameters = { '$top': 10000, '$select': 'StationID,RouteID,Direction,ServiceDay,Timetables' };
    const fareParameters = { '$top': 10000, '$select': 'OriginStationID,DestinationStationID,Fares' };
    const travelParameters = { '$top': 10000, '$select': 'RouteID,TravelTimes' };
    const [stationData, routePayload, timetablePayload, farePayload, travelPayload] = await Promise.all([
      fetchJourneyStationData('metro', scope),
      fetchJourneyTdx(routePath, routeParameters),
      fetchJourneyTdx(timetablePath, timetableParameters),
      fetchJourneyTdx(farePath, fareParameters),
      fetchJourneyTdx(travelPath, travelParameters)
    ]);
    const network = buildMetroJourneyNetwork(
      scope.system,
      stationData.stations,
      compactMetroRouteEntries(asArray(routePayload)),
      compactMetroTimetableEntries(asArray(timetablePayload)),
      compactJourneyFareEntries(asArray(farePayload)),
      compactMetroTravelEntries(asArray(travelPayload))
    );
    entry.network = network;
    entry.updatedAt = Date.now();
    journeyGraphDiskCache.metro[cacheKey] = metroJourneyNetworkSnapshot(network, entry.updatedAt);
    releaseJourneyTdxResponse(routePath, routeParameters);
    releaseJourneyTdxResponse(timetablePath, timetableParameters);
    releaseJourneyTdxResponse(farePath, fareParameters);
    releaseJourneyTdxResponse(travelPath, travelParameters);
    pruneJourneyNetworkMemory(metroJourneyNetworkCache, 3);
    scheduleJourneyGraphPersistence();
    return network;
  })().finally(() => {
    entry.pending = null;
  });
  metroJourneyNetworkCache.set(cacheKey, entry);
  return entry.pending;
}

async function fetchMetroJourneyNetwork(scope) {
  if (!tdxFetchingEnabled) throw new UpstreamError('管理員已關閉運輸資訊', 503);
  const cacheKey = scope.system;
  let entry = metroJourneyNetworkCache.get(cacheKey);
  if (!entry) {
    const snapshot = usableJourneyGraphSnapshot('metro', cacheKey);
    const network = hydrateMetroJourneyNetwork(snapshot);
    entry = {
      network,
      updatedAt: network ? Date.parse(snapshot.updatedAt) : 0,
      lastAccessAt: Date.now(),
      pending: null,
      scope
    };
    metroJourneyNetworkCache.set(cacheKey, entry);
  }
  entry.lastAccessAt = Date.now();
  if (entry.network) {
    if (Date.now() - entry.updatedAt >= JOURNEY_STATIC_REFRESH_INTERVAL_MS) {
      refreshMetroJourneyNetwork(scope, cacheKey).catch((error) => {
        console.error(`Unable to refresh ${cacheKey} metro graph:`, error.message);
      });
    }
    return entry.network;
  }
  return refreshMetroJourneyNetwork(scope, cacheKey);
}

function findMetroTransferPaths(network, origin, destination, maximumTransfers = 2, maximumPaths = 12) {
  const { occurrences, transferStations } = network;
  const originKey = metroStationKey(origin.name);
  const destinationKey = metroStationKey(destination.name);
  const queue = [{ stationKey: originKey, legs: [], visited: new Set([originKey]) }];
  const paths = [];
  let processed = 0;
  let queueIndex = 0;
  while (queueIndex < queue.length && paths.length < maximumPaths && processed < 1200) {
    const current = queue[queueIndex];
    queueIndex += 1;
    processed += 1;
    for (const occurrence of occurrences.get(current.stationKey) || []) {
      if (current.legs.at(-1)?.record.key === occurrence.record.key) continue;
      for (let toIndex = occurrence.index + 1; toIndex < occurrence.record.stops.length; toIndex += 1) {
        const destinationStop = occurrence.record.stops[toIndex];
        const nextKey = metroStationKey(destinationStop.name);
        if (nextKey === destinationKey) {
          const legs = [...current.legs, {
            record: occurrence.record, fromIndex: occurrence.index, toIndex
          }];
          if (legs.length > 1) paths.push(legs);
          continue;
        }
        if (!transferStations.has(nextKey)) continue;
        const leg = { record: occurrence.record, fromIndex: occurrence.index, toIndex };
        const legs = [...current.legs, leg];
        if (legs.length > maximumTransfers || current.visited.has(nextKey)) continue;
        queue.push({
          stationKey: nextKey,
          legs,
          visited: new Set([...current.visited, nextKey])
        });
      }
    }
  }
  return paths.filter((legs, index, all) => {
    const signature = legs.map((leg) => (
      `${leg.record.key}:${leg.record.stops[leg.fromIndex].name}:${leg.record.stops[leg.toIndex].name}`
    )).join('|');
    return all.findIndex((candidate) => candidate.map((leg) => (
      `${leg.record.key}:${leg.record.stops[leg.fromIndex].name}:${leg.record.stops[leg.toIndex].name}`
    )).join('|') === signature) === index;
  });
}

function metroTimetableEntries(network, routeRecord, stationId) {
  const exactKey = `${stationId}|${routeRecord.routeId}|${routeRecord.direction ?? ''}`;
  const withoutDirectionKey = `${stationId}|${routeRecord.routeId}|`;
  return [...new Set([
    ...(network.timetablesByStationRoute.get(exactKey) || []),
    ...(exactKey === withoutDirectionKey
      ? []
      : network.timetablesByStationRoute.get(withoutDirectionKey) || [])
  ])];
}

function nextMetroDeparture(network, routeRecord, stationId, departure) {
  const timestamps = metroTimetableEntries(network, routeRecord, stationId)
    .filter((entry) => serviceDayMatches(entry.ServiceDay, departure.timestamp))
    .flatMap((entry) => asArray(entry.Timetables)).map((timetable) => {
    let timestamp = taipeiTimestamp(departure.date, timetable.DepartureTime);
    if (Number.isFinite(timestamp) && departure.timestamp - timestamp > 12 * 60 * 60 * 1000) {
      timestamp += 24 * 60 * 60 * 1000;
    }
    return timestamp;
  }).filter((timestamp) => Number.isFinite(timestamp)
    && timestamp >= Math.max(departure.timestamp, Date.now()) - 30_000)
    .sort((left, right) => left - right);
  return timestamps[0] ?? departure.timestamp;
}

function metroTravelDurationFromNetwork(network, routeRecord, segmentStops) {
  const edges = network.travelSecondsByRoute.get(routeRecord.routeId);
  let total = 0;
  if (edges) {
    for (let index = 0; index < segmentStops.length - 1; index += 1) {
      const seconds = edges.get(`${segmentStops[index].id}|${segmentStops[index + 1].id}`);
      if (!Number.isFinite(seconds)) return Math.max(120, (segmentStops.length - 1) * 120);
      total += seconds;
    }
  }
  return total > 0 ? total : Math.max(120, (segmentStops.length - 1) * 120);
}

async function applyMetroRealtimeOverlay(scope, origin, results, window) {
  if (!window.nearNow || !results.length) return results;
  try {
    if (scope.system === 'KLRT') {
      const positionPayload = await fetchJourneyTdx(
        `v2/Rail/Metro/LivePosition/${scope.system}`, { '$top': 1000 }, true
      );
      const livePositions = asArray(positionPayload);
      return results.map((result, index) => {
        if (index >= 5 || !result.tracking?.routeId) return result;
        const live = livePositions.find((entry) => (
          (!entry.RouteID || String(entry.RouteID) === String(result.tracking.routeId))
          && (result.tracking.direction === '' || entry.Direction === Number(result.tracking.direction))
        ));
        if (!live) return result;
        return {
          ...result,
          statusLabel: `${result.statusLabel}；官方車輛位置已更新`,
          realtime: {
            type: 'position',
            observedAt: live.GPSTime || live.UpdateTime || new Date().toISOString()
          }
        };
      });
    }
    if (!['TRTC', 'KRTC', 'TYMC'].includes(scope.system)) return results;
    const boardPayload = await fetchJourneyTdx(
      `v2/Rail/Metro/LiveBoard/${scope.system}`, { '$top': 10000 }, true
    );
    const boards = asArray(boardPayload);
    return results.map((result, index) => {
      if (index >= 5 || !result.tracking?.routeId) return result;
      const firstLeg = result.legs?.[0];
      const board = boards.find((entry) => {
        const entryLineId = String(entry.LineID || entry.LineNO || entry.RouteID || '');
        const sameLine = !entryLineId
          || entryLineId === String(firstLeg?.lineId || firstLeg?.routeId || '');
        const sameStation = !entry.StationID
          || String(entry.StationID) === String(origin.stationId);
        const sameDirection = result.tracking.direction === ''
          || entry.Direction === undefined
          || entry.Direction === Number(result.tracking.direction);
        return sameLine && sameStation && sameDirection;
      });
      if (!board) return result;
      const estimateSeconds = Number(board.EstimateTime);
      const estimateMinutes = Number.isFinite(estimateSeconds)
        ? Math.max(0, Math.ceil(estimateSeconds / 60))
        : null;
      return {
        ...result,
        statusLabel: estimateMinutes === null
          ? `${result.statusLabel}；即時看板未提供到站秒數`
          : `即時看板：約 ${estimateMinutes} 分鐘後抵達 ${origin.name}`,
        realtime: {
          type: 'live-board',
          estimateMinutes,
          observedAt: board.UpdateTime || new Date().toISOString()
        }
      };
    });
  } catch (error) {
    console.error(`Unable to apply ${scope.system} realtime overlay:`, error.message);
    return results;
  }
}

async function searchMetroJourneys(scope, originId, destinationId, departure, options = {}) {
  const network = await fetchMetroJourneyNetwork(scope);
  const origin = requireJourneyStation(network.stations, originId, '起始站');
  const destination = requireJourneyStation(network.stations, destinationId, '終點站');
  if (origin.id === destination.id) throw new UpstreamError('起始站與終點站不可相同', 400);
  const fare = journeyFareSummary(network.fareEntries, origin.stationId, destination.stationId);
  const window = journeySearchWindow(departure);
  const candidateLimit = Math.max(1, Math.min(30, Number(options.candidateLimit) || 30));
  const results = [];
  (network.stationOccurrences.get(origin.stationId) || []).forEach(({ record, index: originIndex }) => {
    const destinationIndex = record.stops.findIndex((stop, index) => (
      index > originIndex && stop.id === destination.stationId
    ));
    if (destinationIndex < 0) return;
    const segmentStops = record.stops.slice(originIndex, destinationIndex + 1);
    const durationSeconds = metroTravelDurationFromNetwork(network, record, segmentStops);
    metroTimetableEntries(network, record, origin.stationId)
      .filter((entry) => serviceDayMatches(entry.ServiceDay, departure.timestamp))
      .forEach((stationTimetable) => {
      asArray(stationTimetable.Timetables).forEach((timetable) => {
        let departureTimestamp = taipeiTimestamp(departure.date, timetable.DepartureTime);
        if (!Number.isFinite(departureTimestamp)) return;
        if (departure.timestamp - departureTimestamp > 12 * 60 * 60 * 1000) {
          departureTimestamp += 24 * 60 * 60 * 1000;
        }
        const arrivalTimestamp = departureTimestamp + durationSeconds * 1000;
        if (departureTimestamp < window.start || departureTimestamp > window.end) return;
        const isActive = window.nearNow && window.now >= departureTimestamp && window.now <= arrivalTimestamp;
        results.push({
          id: `metro:${scope.system}:${record.routeId}:${departureTimestamp}`,
          mode: 'metro',
          title: `${record.routeName} ${formatJourneyClock(departureTimestamp)} 班次`,
          subtitle: `${origin.name} → ${destination.name}`,
          departureTime: formatJourneyClock(departureTimestamp),
          arrivalTime: formatJourneyClock(arrivalTimestamp),
          durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
          fareLabel: fare.label,
          farePrices: fare.prices,
          transferCount: 0,
          transfers: [],
          legs: [{
            mode: 'metro', routeId: record.routeId, routeName: record.routeName,
            lineId: record.lineId, direction: record.direction, title: record.routeName,
            origin: origin.name, destination: destination.name,
            departureTime: formatJourneyClock(departureTimestamp),
            arrivalTime: formatJourneyClock(arrivalTimestamp),
            durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
            fareLabel: fare.label, stops: segmentStops
          }],
          isActive,
          canTrack: isActive,
          statusLabel: isActive ? '目前行駛中，可追蹤' : '表定班次',
          boardingTimestamp: departureTimestamp,
          tracking: {
            mode: 'metro', system: scope.system, routeId: record.routeId,
            direction: record.direction ?? '', departureTimestamp,
            durationSeconds, originId: origin.stationId, destinationId: destination.stationId
          }
        });
      });
    });
  });
  if (!results.length) {
    const transferPaths = findMetroTransferPaths(network, origin, destination, 4, candidateLimit);
    transferPaths.forEach((path, pathIndex) => {
      const first = path[0];
      const departureTimestamp = nextMetroDeparture(
        network, first.record, first.record.stops[first.fromIndex].id, departure
      );
      let cursor = departureTimestamp;
      const legs = path.map((pathLeg, index) => {
        if (index > 0) cursor += 4 * 60_000;
        const segmentStops = pathLeg.record.stops.slice(pathLeg.fromIndex, pathLeg.toIndex + 1);
        const durationSeconds = metroTravelDurationFromNetwork(network, pathLeg.record, segmentStops);
        const legDeparture = cursor;
        const legArrival = legDeparture + durationSeconds * 1000;
        cursor = legArrival;
        return {
          mode: 'metro',
          routeId: pathLeg.record.routeId,
          routeName: pathLeg.record.routeName,
          direction: pathLeg.record.direction,
          title: pathLeg.record.routeName,
          origin: segmentStops[0]?.name || '',
          destination: segmentStops.at(-1)?.name || '',
          departureTime: formatJourneyClock(legDeparture),
          arrivalTime: formatJourneyClock(legArrival),
          durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
          fareLabel: index === 0 ? fare.label : '已計入全程票價',
          stops: segmentStops
        };
      });
      const transfers = legs.slice(0, -1).map((leg) => ({
        stationId: leg.stops.at(-1)?.id || '',
        stationName: leg.destination,
        waitMinutes: 4,
        lat: leg.stops.at(-1)?.lat ?? null,
        lng: leg.stops.at(-1)?.lng ?? null
      }));
      results.push({
        id: `metro:${scope.system}:transfer:${pathIndex}:${departureTimestamp}`,
        mode: 'metro',
        title: legs.map((leg) => leg.routeName).join(' → '),
        subtitle: `${origin.name} → ${transfers.map((item) => `${item.stationName} 轉乘`).join(' → ')} → ${destination.name}`,
        departureTime: formatJourneyClock(departureTimestamp),
        arrivalTime: formatJourneyClock(cursor),
        durationMinutes: Math.max(1, Math.round((cursor - departureTimestamp) / 60_000)),
        fareLabel: fare.label,
        farePrices: fare.prices,
        transferCount: transfers.length,
        transfers,
        legs,
        isActive: false,
        canTrack: false,
        statusLabel: `轉乘 ${transfers.length} 次，每次預留 4 分鐘`,
        boardingTimestamp: departureTimestamp
      });
    });
  }
  results.sort((left, right) => Number(right.isActive) - Number(left.isActive)
    || (left.transferCount || 0) - (right.transferCount || 0)
    || left.departureTime.localeCompare(right.departureTime));
  let selectedResults = results.slice(0, candidateLimit);
  if (options.includeRealtime !== false) {
    selectedResults = await applyMetroRealtimeOverlay(scope, origin, selectedResults, window);
  }
  return { origin, destination, results: selectedResults };
}

async function refreshActiveJourneyGraphs() {
  if (!tdxFetchingEnabled) return [];
  const now = Date.now();
  const isDue = (entry) => entry.network
    && entry.lastAccessAt >= now - JOURNEY_GRAPH_ACTIVE_WINDOW_MS
    && now - entry.updatedAt >= JOURNEY_STATIC_REFRESH_INTERVAL_MS;
  const tasks = [];
  busJourneyNetworkCache.forEach((entry, cacheKey) => {
    if (isDue(entry)) tasks.push(refreshBusJourneyNetwork(entry.scope, cacheKey));
  });
  railJourneyNetworkCache.forEach((entry, cacheKey) => {
    if (isDue(entry)) tasks.push(refreshRailJourneyNetwork(entry.mode, entry.date, cacheKey));
  });
  metroJourneyNetworkCache.forEach((entry, cacheKey) => {
    if (isDue(entry)) tasks.push(refreshMetroJourneyNetwork(entry.scope, cacheKey));
  });
  return Promise.allSettled(tasks);
}

function startJourneyGraphRefresh() {
  journeyGraphRefreshTimer = setInterval(() => {
    refreshActiveJourneyGraphs().catch((error) => {
      console.error('Journey graph refresh failed:', error.message);
    });
  }, JOURNEY_STATIC_REFRESH_INTERVAL_MS);
  journeyGraphRefreshTimer.unref?.();
}

async function proxyJourneyOptions(requestUrl, response) {
  try {
    await runWithTdxPriority('high', async () => {
      const mode = requireJourneyMode(requestUrl.searchParams);
      let scope = {};
      if (mode === 'bus') scope = requireJourneyCity(requestUrl.searchParams);
      if (mode === 'metro') {
        scope = requireJourneyCity(requestUrl.searchParams);
        scope.system = requireMetroSystem(requestUrl.searchParams, scope.portalCityCode);
      }
      const stationData = await fetchJourneyStationData(mode, scope);
      sendJson(response, 200, {
        success: true,
        source: '交通部 TDX 固定運輸資料',
        observedAt: new Date().toISOString(),
        refreshIntervalSeconds: JOURNEY_STATIC_REFRESH_INTERVAL_MS / 1000,
        data: {
          mode,
          city: scope.portalCityCode || null,
          system: scope.system || null,
          systems: mode === 'metro'
            ? (METRO_SYSTEMS_BY_CITY[scope.portalCityCode] || [])
              .map((id) => ({ id, name: METRO_SYSTEM_LABELS[id] || id }))
            : [],
          stations: stationData.stations
        }
      });
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

async function proxyJourneySearch(requestUrl, response) {
  try {
    await runWithTdxPriority('high', async () => {
      const mode = requireJourneyMode(requestUrl.searchParams);
      const originId = String(requestUrl.searchParams.get('originId') || '').trim();
      const destinationId = String(requestUrl.searchParams.get('destinationId') || '').trim();
      if (!originId || !destinationId) throw new UpstreamError('請選擇起始站與終點站', 400);
      const departure = parseJourneyDeparture(requestUrl.searchParams.get('departureTime'));
      let data;
      if (mode === 'bus') {
        data = await searchBusJourneys(requireJourneyCity(requestUrl.searchParams), originId, destinationId, departure);
      } else if (mode === 'metro') {
        const scope = requireJourneyCity(requestUrl.searchParams);
        scope.system = requireMetroSystem(requestUrl.searchParams, scope.portalCityCode);
        data = await searchMetroJourneys(scope, originId, destinationId, departure);
      } else {
        data = await searchRailJourneys(mode, originId, destinationId, departure);
      }
      sendJson(response, 200, {
        success: true,
        source: '交通部 TDX 班次、票價與伺服器共用快取',
        observedAt: new Date().toISOString(),
        refreshIntervalSeconds: (mode === 'thsr'
          ? JOURNEY_STATIC_REFRESH_INTERVAL_MS
          : JOURNEY_LIVE_REFRESH_INTERVAL_MS) / 1000,
        data: { mode, departureTime: `${departure.date}T${departure.time}:00+08:00`, ...data }
      });
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

const ROUTE_PLANNER_MODE_LABELS = {
  car: '汽車', scooter: '機車', bus: '公車', tra: '臺鐵', thsr: '高鐵', metro: '捷運',
  walk: '步行', bike: '自行車'
};
const ROUTE_PLANNER_WALK_LIMIT_METERS = {
  bus: 2_500,
  metro: 2_500,
  tra: 4_000,
  thsr: 8_000
};
const ROUTE_PLANNER_GRAPHHOPPER_MODES = new Set(['car', 'scooter', 'walk', 'bike']);
const GRAPHHOPPER_PROFILE_BY_MODE = {
  car: 'car', scooter: 'car', walk: 'foot', bike: 'bike'
};
const ROUTE_PLANNER_TRANSIT_SCORE_WEIGHTS = Object.freeze({
  durationMinutes: 1,
  walkingMinutes: 1.5,
  waitingMinutes: 0.35,
  transfers: 12,
  detourKilometers: 0.2,
  estimatedLegs: 3
});

function requirePlannerPoint(searchParams, prefix) {
  const lat = Number(searchParams.get(`${prefix}Lat`));
  const lng = Number(searchParams.get(`${prefix}Lng`));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)
    || lat < 21.5 || lat > 26 || lng < 119 || lng > 122.5) {
    throw new UpstreamError(`${prefix === 'origin' ? '起點' : '終點'}座標不在臺灣範圍內`, 400);
  }
  return {
    lat,
    lng,
    name: String(searchParams.get(`${prefix}Name`) || (prefix === 'origin' ? '起點' : '終點')).trim(),
    city: normalizePlaceName(searchParams.get(`${prefix}City`) || '')
  };
}

function plannerRoadInstruction(instruction) {
  return String(instruction?.text || '').trim()
    || (instruction?.street_name ? `沿 ${instruction.street_name} 行駛` : '繼續行駛');
}

function graphHopperApiKeysAvailable() {
  return graphHopperApiKeys.filter((entry) => Date.now() >= entry.rateLimitedUntil).length;
}

async function requestGraphHopperRoute(endpoint) {
  if (!graphHopperApiKeys.length) {
    throw new UpstreamError('伺服器尚未設定 GraphHopper API key', 503);
  }
  let lastError = null;
  let sawNonRateLimitFailure = false;
  const startIndex = activeGraphHopperApiKeyIndex % graphHopperApiKeys.length;
  for (let offset = 0; offset < graphHopperApiKeys.length; offset += 1) {
    const index = (startIndex + offset) % graphHopperApiKeys.length;
    const entry = graphHopperApiKeys[index];
    if (Date.now() < entry.rateLimitedUntil) continue;
    const requestUrl = new URL(endpoint);
    requestUrl.searchParams.set('key', entry.apiKey);
    try {
      const payload = await fetchJson(requestUrl, {
        headers: { Accept: 'application/json', 'User-Agent': 'TaiwanSmartLifePortal/1.0' }
      }, 20_000);
      activeGraphHopperApiKeyIndex = index;
      return payload;
    } catch (error) {
      lastError = error;
      if ([401, 403, 429].includes(error.status)) {
        if (error.status !== 429) sawNonRateLimitFailure = true;
        entry.rateLimitedUntil = Date.now() + Math.max(
          GRAPHHOPPER_RATE_LIMIT_COOLDOWN_MS,
          error.retryAfterMs || 0
        );
        activeGraphHopperApiKeyIndex = (index + 1) % graphHopperApiKeys.length;
        console.warn(`GraphHopper ${entry.label} is unavailable (HTTP ${error.status}); trying the next key.`);
        continue;
      }
      if ([502, 503, 504].includes(error.status)) {
        sawNonRateLimitFailure = true;
        continue;
      }
      throw error;
    }
  }
  if (!graphHopperApiKeysAvailable() && !sawNonRateLimitFailure) {
    throw new UpstreamError('All GraphHopper API keys are rate limited or unavailable', 429);
  }
  if (sawNonRateLimitFailure) {
    throw new UpstreamError('GraphHopper API keys or route service are currently unavailable', 503);
  }
  throw lastError || new UpstreamError('GraphHopper route service is unavailable', 502);
}

async function fetchRoadRoutingPayload(mode, origin, destination) {
  const cacheKey = [mode, origin.lat, origin.lng, destination.lat, destination.lng]
    .map((value) => typeof value === 'number' ? value.toFixed(5) : value).join(':');
  let cached = roadRoutingPayloadCache.get(cacheKey);
  if (cached?.data && cached.expiresAt > Date.now()) return cached.data;
  if (cached?.pending) return cached.pending;
  const endpoint = new URL(GRAPHHOPPER_API_ROOT);
  endpoint.searchParams.append('point', `${origin.lat},${origin.lng}`);
  endpoint.searchParams.append('point', `${destination.lat},${destination.lng}`);
  endpoint.searchParams.set('profile', GRAPHHOPPER_PROFILE_BY_MODE[mode] || 'car');
  endpoint.searchParams.set('locale', 'zh_TW');
  endpoint.searchParams.set('instructions', 'true');
  endpoint.searchParams.set('calc_points', 'true');
  endpoint.searchParams.set('points_encoded', 'false');
  if (mode === 'scooter') {
    endpoint.searchParams.append('snap_prevention', 'motorway');
    endpoint.searchParams.append('snap_prevention', 'trunk');
  }
  cached = cached || { data: null, pending: null, expiresAt: 0 };
  cached.pending = requestGraphHopperRoute(endpoint).then((payload) => {
    if (!Array.isArray(payload.paths)) {
      throw new UpstreamError('道路路線服務目前無法完成規劃', 502);
    }
    cached.data = payload;
    cached.expiresAt = Date.now() + ROUTING_CACHE_MS;
    return payload;
  }).finally(() => {
    cached.pending = null;
  });
  roadRoutingPayloadCache.set(cacheKey, cached);
  return cached.pending;
}

async function fetchRoadPlannerResults(mode, origin, destination) {
  const cacheKey = [mode, origin.lat, origin.lng, destination.lat, destination.lng]
    .map((value) => typeof value === 'number' ? value.toFixed(5) : value).join(':');
  const cached = routePlannerCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const payload = await fetchRoadRoutingPayload(mode, origin, destination);
  const results = payload.paths.slice(0, 1).map((route, index) => {
    const coordinates = route.points?.type === 'LineString' ? route.points.coordinates : [];
    const distanceKm = Math.max(0, Number(route.distance) || 0) / 1000;
    const baseSeconds = Math.max(60, (Number(route.time) || 60_000) / 1000);
    const estimatesTrafficLights = mode === 'car' || mode === 'scooter';
    const estimatedSignals = estimatesTrafficLights
      ? Math.max(1, Math.round(distanceKm * (mode === 'scooter' ? 0.8 : 0.68)))
      : 0;
    const trafficLightDelaySeconds = estimatedSignals * (mode === 'scooter' ? 28 : 32);
    const totalSeconds = baseSeconds + trafficLightDelaySeconds;
    const steps = asArray(route.instructions).map((instruction) => {
      const coordinate = coordinates[Number(instruction.interval?.[0])];
      return {
        instruction: plannerRoadInstruction(instruction),
        roadName: String(instruction.street_name || ''),
        distanceMeters: Math.round(Number(instruction.distance) || 0),
        durationMinutes: Math.max(1, Math.round((Number(instruction.time) || 0) / 60_000)),
        location: Array.isArray(coordinate)
          ? { lng: Number(coordinate[0]), lat: Number(coordinate[1]) }
        : null
      };
    });
    return {
      id: `${mode}:road:${index}:${cacheKey}`,
      mode,
      title: `${ROUTE_PLANNER_MODE_LABELS[mode]}${index ? `替代路線 ${index + 1}` : '建議路線'}`,
      subtitle: `${origin.name} → ${destination.name}`,
      distanceKm: Number(distanceKm.toFixed(1)),
      baseDurationMinutes: Math.max(1, Math.round(baseSeconds / 60)),
      trafficLightDelayMinutes: estimatesTrafficLights
        ? Math.max(1, Math.round(trafficLightDelaySeconds / 60))
        : 0,
      estimatedTrafficSignals: estimatedSignals,
      durationMinutes: Math.max(1, Math.round(totalSeconds / 60)),
      fareLabel: mode === 'car'
        ? '未計油資、停車費與過路費'
        : mode === 'scooter' ? '未計油資與停車費' : '不需票價',
      assumption: mode === 'scooter'
        ? 'GraphHopper car 路網近似機車路線，起終點避免吸附高速公路與快速道路；途中仍可能包含禁行機車路段，請以現場標誌為準，總時間另含紅燈等待估算。'
        : mode === 'walk'
          ? 'GraphHopper 步道路網估算；請依現場人行道、穿越道與施工指示通行。'
          : mode === 'bike'
            ? 'GraphHopper 自行車路網估算；請依現場自行車道、禁行與轉向標誌騎乘。'
            : 'GraphHopper 道路路網估算，未含即時塞車；總時間已另外加入紅燈等待估算。',
      source: 'GraphHopper',
      geometry: coordinates,
      steps
    };
  });
  routePlannerCache.set(cacheKey, { data: results, expiresAt: Date.now() + ROUTING_CACHE_MS });
  return results;
}

function portalCityForPoint(point) {
  if (point.city) {
    const matched = Object.entries(PORTAL_CONFIG.cities || {}).find(([, config]) => (
      normalizePlaceName(config.cityName) === point.city
    ));
    if (matched && TDX_CITY_BY_PORTAL_CODE[matched[0]]) return matched[0];
  }
  let selected = null;
  let shortestDistance = Infinity;
  Object.entries(PORTAL_CONFIG.cities || {}).forEach(([code, config]) => {
    if (!TDX_CITY_BY_PORTAL_CODE[code] || !Array.isArray(config.mapCenter)) return;
    const distance = haversineMeters(point.lat, point.lng, config.mapCenter[0], config.mapCenter[1]);
    if (distance < shortestDistance) {
      selected = code;
      shortestDistance = distance;
    }
  });
  return selected;
}

function nearestJourneyStations(stations, point, maximumDistanceMeters, limit = 3) {
  return stations.map((station) => ({
    station,
    distanceMeters: Number.isFinite(station.lat) && Number.isFinite(station.lng)
      ? haversineMeters(point.lat, point.lng, station.lat, station.lng)
      : Infinity
  })).filter((entry) => entry.distanceMeters <= maximumDistanceMeters)
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, limit);
}

function plannerDepartureAfter(departure, offsetMinutes) {
  const timestamp = departure.timestamp + offsetMinutes * 60_000;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, timestamp };
}

function walkingPlannerLeg(origin, destination, distanceMeters, label) {
  const durationMinutes = Math.max(1, Math.round(distanceMeters / 75));
  return {
    mode: 'walk',
    title: label,
    origin: origin.name,
    destination: destination.name,
    durationMinutes,
    distanceMeters: Math.round(distanceMeters),
    stops: [origin, destination]
  };
}

function plannerStopTimeline(stops, departureTimestamp, arrivalTimestamp) {
  const entries = asArray(stops);
  if (!entries.length || !Number.isFinite(departureTimestamp) || !Number.isFinite(arrivalTimestamp)) {
    return entries;
  }
  const distances = [0];
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    const distance = [previous.lat, previous.lng, current.lat, current.lng].every(Number.isFinite)
      ? haversineMeters(previous.lat, previous.lng, current.lat, current.lng)
      : 1;
    distances.push(distances.at(-1) + Math.max(1, distance));
  }
  const totalDistance = distances.at(-1) || Math.max(1, entries.length - 1);
  return entries.map((stop, index) => {
    const exactArrival = Number.isFinite(stop.arrivalTimestamp) ? stop.arrivalTimestamp : NaN;
    const exactDeparture = Number.isFinite(stop.departureTimestamp) ? stop.departureTimestamp : NaN;
    const progress = entries.length === 1 ? 0 : distances[index] / totalDistance;
    const estimatedTimestamp = Math.round(
      departureTimestamp + (arrivalTimestamp - departureTimestamp) * progress
    );
    const hasOfficialTime = Number.isFinite(exactArrival) || Number.isFinite(exactDeparture);
    const stopArrivalTimestamp = Number.isFinite(exactArrival)
      ? exactArrival
      : Number.isFinite(exactDeparture) ? exactDeparture : estimatedTimestamp;
    const stopDepartureTimestamp = Number.isFinite(exactDeparture)
      ? exactDeparture
      : Number.isFinite(exactArrival) ? exactArrival : estimatedTimestamp;
    return {
      ...stop,
      arrivalTimestamp: stopArrivalTimestamp,
      departureTimestamp: stopDepartureTimestamp,
      arrivalTime: stop.arrivalTime || formatJourneyClock(stopArrivalTimestamp),
      departureTime: stop.departureTime || formatJourneyClock(stopDepartureTimestamp),
      timeEstimated: stop.timeEstimated === true || !hasOfficialTime
    };
  });
}

function plannerLegTimeline(legs, departureTimestamp, arrivalTimestamp) {
  const entries = asArray(legs);
  if (!entries.length) return entries;
  const untimedWeights = entries.map((leg) => (
    Number.isFinite(leg.durationMinutes)
      ? Math.max(1, leg.durationMinutes)
      : Math.max(1, asArray(leg.stops).length - 1)
  ));
  const totalWeight = untimedWeights.reduce((total, value) => total + value, 0) || entries.length;
  let cursor = departureTimestamp;
  let consumedWeight = 0;
  return entries.map((leg, index) => {
    const exactDeparture = Number.isFinite(leg.departureTimestamp) ? leg.departureTimestamp : NaN;
    const exactArrival = Number.isFinite(leg.arrivalTimestamp) ? leg.arrivalTimestamp : NaN;
    const legDepartureTimestamp = Number.isFinite(exactDeparture) ? exactDeparture : cursor;
    consumedWeight += untimedWeights[index];
    const proportionalArrival = departureTimestamp + Math.round(
      (arrivalTimestamp - departureTimestamp) * consumedWeight / totalWeight
    );
    const durationArrival = Number.isFinite(leg.durationMinutes)
      ? legDepartureTimestamp + Math.max(1, leg.durationMinutes) * 60_000
      : proportionalArrival;
    const legArrivalTimestamp = Number.isFinite(exactArrival)
      ? exactArrival
      : index === entries.length - 1 ? arrivalTimestamp : durationArrival;
    cursor = Math.max(legDepartureTimestamp, legArrivalTimestamp);
    return {
      ...leg,
      departureTimestamp: legDepartureTimestamp,
      arrivalTimestamp: legArrivalTimestamp,
      departureTime: Number.isFinite(exactDeparture) && leg.departureTime
        ? leg.departureTime
        : formatJourneyClock(legDepartureTimestamp),
      arrivalTime: Number.isFinite(exactArrival) && leg.arrivalTime
        ? leg.arrivalTime
        : formatJourneyClock(legArrivalTimestamp),
      timeEstimated: leg.timeEstimated === true
        || !Number.isFinite(exactDeparture)
        || !Number.isFinite(exactArrival),
      stops: plannerStopTimeline(leg.stops, legDepartureTimestamp, legArrivalTimestamp)
    };
  });
}

async function plannerTransitScope(mode, origin, destination) {
  if (mode === 'tra' || mode === 'thsr') return {};
  const originCity = portalCityForPoint(origin);
  const destinationCity = portalCityForPoint(destination);
  if (mode === 'bus') {
    if (originCity !== destinationCity) {
      throw new UpstreamError('公車規劃目前限同一縣市；跨縣市請勾選臺鐵或高鐵', 422);
    }
    return { portalCityCode: originCity, tdxCity: TDX_CITY_BY_PORTAL_CODE[originCity] };
  }
  const sharedSystems = (METRO_SYSTEMS_BY_CITY[originCity] || [])
    .filter((system) => (METRO_SYSTEMS_BY_CITY[destinationCity] || []).includes(system));
  if (!sharedSystems.length) throw new UpstreamError('起訖點沒有共同可用的捷運系統', 422);
  return { portalCityCode: originCity, tdxCity: TDX_CITY_BY_PORTAL_CODE[originCity], system: sharedSystems[0] };
}

async function prepareRoutePlannerNetworks(modes, origin, destination, departure) {
  const tasks = [];
  const addTask = (label, task) => {
    tasks.push(Promise.resolve(task).then(
      () => null,
      (error) => `${label}：${error.message || '資料準備失敗'}`
    ));
  };
  const endpointCities = [...new Set([origin, destination]
    .map((point) => portalCityForPoint(point)).filter(Boolean))];

  if (modes.includes('bus')) {
    endpointCities.forEach((portalCityCode) => {
      const tdxCity = TDX_CITY_BY_PORTAL_CODE[portalCityCode];
      if (!tdxCity) return;
      addTask(
        `${PORTAL_CONFIG.cities?.[portalCityCode]?.cityName || portalCityCode}公車`,
        fetchBusJourneyNetwork({ portalCityCode, tdxCity })
      );
    });
  }
  ['tra', 'thsr'].filter((mode) => modes.includes(mode)).forEach((mode) => {
    addTask(
      ROUTE_PLANNER_MODE_LABELS[mode],
      Promise.all([
        fetchJourneyStationData(mode),
        fetchRailJourneyNetwork(mode, departure.date)
      ])
    );
  });
  if (modes.includes('metro')) {
    const systems = [...new Set(endpointCities.flatMap(
      (portalCityCode) => METRO_SYSTEMS_BY_CITY[portalCityCode] || []
    ))];
    systems.forEach((system) => {
      const portalCityCode = endpointCities.find((city) => (
        (METRO_SYSTEMS_BY_CITY[city] || []).includes(system)
      ));
      addTask(
        METRO_SYSTEM_LABELS[system] || system,
        fetchMetroJourneyNetwork({
          portalCityCode,
          tdxCity: TDX_CITY_BY_PORTAL_CODE[portalCityCode],
          system
        })
      );
    });
  }
  return (await Promise.all(tasks)).filter(Boolean);
}

async function searchPlannerJourney(mode, scope, originId, destinationId, departure, options = {}) {
  if (mode === 'bus') return searchBusJourneys(scope, originId, destinationId, departure, options);
  if (mode === 'metro') return searchMetroJourneys(scope, originId, destinationId, departure, options);
  return searchRailJourneys(mode, originId, destinationId, departure, options);
}

function plannerJourneyRideMinutes(mode, journey, originStation, destinationStation) {
  if (Number.isFinite(journey.durationMinutes)) return journey.durationMinutes;
  return Math.max(5, Math.round(
    haversineMeters(
      originStation.lat, originStation.lng,
      destinationStation.lat, destinationStation.lng
    ) / 1000 / (mode === 'bus' ? 18 : 30) * 60
  ) + (journey.transferCount || 0) * 10);
}

function plannerJourneyArrivalTimestamp(journey, rideMinutes) {
  const timedLegs = asArray(journey.legs).filter((leg) => Number.isFinite(leg.arrivalTimestamp));
  if (timedLegs.length) return timedLegs.at(-1).arrivalTimestamp;
  return Number.isFinite(journey.boardingTimestamp)
    ? journey.boardingTimestamp + rideMinutes * 60_000
    : null;
}

function plannerStationPoint(station) {
  return {
    id: station.id,
    name: station.name,
    city: station.city || '',
    lat: station.lat,
    lng: station.lng
  };
}

function plannerPointMemoKey(point) {
  return [point.lat, point.lng].map((value) => Number(value).toFixed(5)).join(',');
}

function createRoutePlanningContext() {
  return {
    transitResults: new Map(),
    multimodalWarnings: new Set(),
    deadline: Date.now() + ROUTE_PLANNER_TIMEOUT_MS,
    timedOut: false
  };
}

function routePlannerDeadlineReached(context) {
  if (!context || !Number.isFinite(context.deadline) || Date.now() < context.deadline) return false;
  context.timedOut = true;
  return true;
}

async function waitForRoutePlannerTasks(tasks, context) {
  const remainingMs = Math.max(0, context.deadline - Date.now());
  if (!remainingMs) {
    context.timedOut = true;
    return;
  }
  let timeoutId;
  const timedOut = await Promise.race([
    Promise.allSettled(tasks).then(() => false),
    new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve(true), remainingMs);
      timeoutId.unref?.();
    })
  ]);
  clearTimeout(timeoutId);
  if (timedOut) context.timedOut = true;
}

function fetchTransitPlannerResultsCached(
  context, mode, originPoint, destinationPoint, departure, options = {}
) {
  if (!context) {
    return fetchTransitPlannerResults(mode, originPoint, destinationPoint, departure, options);
  }
  const key = [
    mode,
    plannerPointMemoKey(originPoint),
    plannerPointMemoKey(destinationPoint),
    departure.timestamp,
    options.includeRealtime === false ? 'static' : 'live'
  ].join('|');
  if (!context.transitResults.has(key)) {
    context.transitResults.set(key, fetchTransitPlannerResults(
      mode, originPoint, destinationPoint, departure, options
    ));
  }
  return context.transitResults.get(key);
}

function plannerPathDistanceMeters(points) {
  const positioned = asArray(points).map((point) => {
    if (Array.isArray(point) && point.length >= 2) {
      return { lat: Number(point[1]), lng: Number(point[0]) };
    }
    return { lat: Number(point?.lat), lng: Number(point?.lng) };
  }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  let distanceMeters = 0;
  for (let index = 1; index < positioned.length; index += 1) {
    distanceMeters += haversineMeters(
      positioned[index - 1].lat,
      positioned[index - 1].lng,
      positioned[index].lat,
      positioned[index].lng
    );
  }
  return distanceMeters;
}

function plannerLegDistanceMeters(leg) {
  const suppliedDistance = Number(leg?.distanceMeters);
  if (Number.isFinite(suppliedDistance) && suppliedDistance > 0) return suppliedDistance;
  const geometryDistance = plannerPathDistanceMeters(leg?.geometry);
  if (geometryDistance > 0) return geometryDistance;
  return plannerPathDistanceMeters(leg?.stops);
}

function plannerRouteDistanceMeters(legs) {
  return Math.round(asArray(legs).reduce(
    (total, leg) => total + plannerLegDistanceMeters(leg),
    0
  ));
}

function plannerLegDurationMinutes(leg) {
  const suppliedDuration = Number(leg?.durationMinutes);
  if (Number.isFinite(suppliedDuration) && suppliedDuration >= 0) return suppliedDuration;
  const departureTimestamp = Number(leg?.departureTimestamp);
  const arrivalTimestamp = Number(leg?.arrivalTimestamp);
  return Number.isFinite(departureTimestamp) && Number.isFinite(arrivalTimestamp)
    ? Math.max(0, (arrivalTimestamp - departureTimestamp) / 60_000)
    : 0;
}

function plannerRouteWaitingMinutes(legs, departureTimestamp) {
  let cursor = Number(departureTimestamp);
  let waitingMinutes = 0;
  asArray(legs).forEach((leg) => {
    const legDeparture = Number(leg?.departureTimestamp);
    const legArrival = Number(leg?.arrivalTimestamp);
    if (Number.isFinite(cursor) && Number.isFinite(legDeparture) && legDeparture > cursor) {
      waitingMinutes += (legDeparture - cursor) / 60_000;
    }
    if (Number.isFinite(legArrival)) cursor = Math.max(Number.isFinite(cursor) ? cursor : 0, legArrival);
  });
  return Number(waitingMinutes.toFixed(1));
}

function enrichPlannerTransitResult(result, originPoint, destinationPoint) {
  const legs = asArray(result?.legs);
  const distanceMeters = plannerRouteDistanceMeters(legs);
  const directDistanceMeters = originPoint && destinationPoint
    ? Math.round(haversineMeters(
        originPoint.lat, originPoint.lng, destinationPoint.lat, destinationPoint.lng
      ))
    : distanceMeters;
  const walkingMinutes = Number(legs.filter((leg) => leg.mode === 'walk')
    .reduce((total, leg) => total + plannerLegDurationMinutes(leg), 0).toFixed(1));
  const waitingMinutes = plannerRouteWaitingMinutes(legs, result?.departureTimestamp);
  const estimatedLegs = legs.filter((leg) => leg.mode !== 'walk' && leg.timeEstimated === true).length;
  const detourKilometers = Number((Math.max(0, distanceMeters - directDistanceMeters) / 1000).toFixed(1));
  const durationMinutes = Math.max(0, Number(result?.durationMinutes) || 0);
  const transferCount = Math.max(0, Number(result?.transferCount) || 0);
  const userBenefitScore = durationMinutes * ROUTE_PLANNER_TRANSIT_SCORE_WEIGHTS.durationMinutes
    + walkingMinutes * ROUTE_PLANNER_TRANSIT_SCORE_WEIGHTS.walkingMinutes
    + waitingMinutes * ROUTE_PLANNER_TRANSIT_SCORE_WEIGHTS.waitingMinutes
    + transferCount * ROUTE_PLANNER_TRANSIT_SCORE_WEIGHTS.transfers
    + detourKilometers * ROUTE_PLANNER_TRANSIT_SCORE_WEIGHTS.detourKilometers
    + estimatedLegs * ROUTE_PLANNER_TRANSIT_SCORE_WEIGHTS.estimatedLegs;
  return {
    ...result,
    distanceMeters,
    distanceKm: Number((distanceMeters / 1000).toFixed(1)),
    walkingMinutes,
    waitingMinutes,
    detourKilometers,
    estimatedLegs,
    userBenefitScore: Number(userBenefitScore.toFixed(2))
  };
}

function plannerTransitResultScore(result) {
  const score = Number(result?.userBenefitScore);
  if (Number.isFinite(score)) return score;
  return Math.max(0, Number(result?.durationMinutes) || 0)
    + Math.max(0, Number(result?.transferCount) || 0)
      * ROUTE_PLANNER_TRANSIT_SCORE_WEIGHTS.transfers;
}

function comparePlannerTransitResults(left, right) {
  return plannerTransitResultScore(left) - plannerTransitResultScore(right)
    || (Number(left.arrivalTimestamp) || Infinity) - (Number(right.arrivalTimestamp) || Infinity);
}

async function fetchTransitPlannerResults(mode, originPoint, destinationPoint, departure, options = {}) {
  const planningContext = options.planningContext;
  if (routePlannerDeadlineReached(planningContext)) {
    throw new UpstreamError('路線規劃已達本次計算時間上限', 504);
  }
  const scope = await plannerTransitScope(mode, originPoint, destinationPoint);
  const stationData = await fetchJourneyStationData(mode, scope);
  const maximumDistance = ROUTE_PLANNER_WALK_LIMIT_METERS[mode];
  const stationLimit = mode === 'tra' || mode === 'thsr' ? 2 : 3;
  const origins = nearestJourneyStations(
    stationData.stations, originPoint, maximumDistance, stationLimit
  );
  const destinations = nearestJourneyStations(
    stationData.stations, destinationPoint, maximumDistance, stationLimit
  );
  if (!origins.length || !destinations.length) throw new UpstreamError(`附近找不到可用的${ROUTE_PLANNER_MODE_LABELS[mode]}站點`, 422);
  const candidates = [];
  let lastError;
  stationPairs: for (const originEntry of origins) {
    for (const destinationEntry of destinations) {
      if (routePlannerDeadlineReached(planningContext)) break stationPairs;
      if (originEntry.station.id === destinationEntry.station.id) continue;
      try {
        const accessMinutes = Math.max(1, Math.round(originEntry.distanceMeters / 75));
        const stationDeparture = plannerDepartureAfter(departure, accessMinutes);
        const search = await searchPlannerJourney(
          mode,
          scope,
          originEntry.station.id,
          destinationEntry.station.id,
          stationDeparture,
          { ...options, candidateLimit: 5 }
        );
        if (!search.results.length) continue;
        const egressMinutes = Math.max(1, Math.round(destinationEntry.distanceMeters / 75));
        search.results.slice(0, 2).forEach((journey, index) => {
          const estimatedRideMinutes = plannerJourneyRideMinutes(
            mode, journey, originEntry.station, destinationEntry.station
          );
          const waitingMinutes = Number.isFinite(journey.boardingTimestamp)
            ? Math.max(0, Math.round((journey.boardingTimestamp - stationDeparture.timestamp) / 60_000))
            : 0;
          const journeyArrivalTimestamp = plannerJourneyArrivalTimestamp(journey, estimatedRideMinutes)
            || stationDeparture.timestamp + (waitingMinutes + estimatedRideMinutes) * 60_000;
          const arrivalTimestamp = journeyArrivalTimestamp + egressMinutes * 60_000;
          const accessLeg = walkingPlannerLeg(
            originPoint, originEntry.station, originEntry.distanceMeters, `步行至 ${originEntry.station.name}`
          );
          const egressLeg = walkingPlannerLeg(
            destinationEntry.station, destinationPoint, destinationEntry.distanceMeters, `步行至 ${destinationPoint.name}`
          );
          const transportLegs = Array.isArray(journey.legs) && journey.legs.length
            ? journey.legs
            : [{ mode, title: journey.title, origin: originEntry.station.name, destination: destinationEntry.station.name }];
          const timedTransportLegs = plannerLegTimeline(
            transportLegs,
            journey.boardingTimestamp || stationDeparture.timestamp,
            journeyArrivalTimestamp
          );
          const legs = plannerLegTimeline(
            [accessLeg, ...timedTransportLegs, egressLeg], departure.timestamp, arrivalTimestamp
          );
          candidates.push(enrichPlannerTransitResult({
            id: `planner:${mode}:${originEntry.station.id}:${destinationEntry.station.id}:${index}`,
            mode,
            title: `${ROUTE_PLANNER_MODE_LABELS[mode]}方案：${journey.title}`,
            subtitle: `${originPoint.name} → ${destinationPoint.name}`,
            departureTime: formatJourneyClock(departure.timestamp),
            arrivalTime: formatJourneyClock(arrivalTimestamp),
            departureTimestamp: departure.timestamp,
            boardingTimestamp: journey.boardingTimestamp,
            arrivalTimestamp,
            durationMinutes: Math.max(1, Math.round((arrivalTimestamp - departure.timestamp) / 60_000)),
            accessMinutes,
            egressMinutes,
            waitingMinutes,
            transferCount: journey.transferCount || 0,
            transfers: journey.transfers || [],
            fareLabel: journey.fareLabel,
            statusLabel: journey.statusLabel,
            modeSequence: [mode],
            assumption: '步行時間以每分鐘 75 公尺估算；等車時間已納入總時間。非官方逐站班次以「約」標示。',
            legs,
            mapPoints: [
              originPoint,
              ...timedTransportLegs.flatMap((leg) => asArray(leg.stops))
                .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng)),
              destinationPoint
            ].map((point) => ({ lat: point.lat, lng: point.lng, name: point.name || '' }))
          }, originPoint, destinationPoint));
        });
      } catch (error) {
        lastError = error;
        if ([429, 502, 503, 504].includes(error?.status)) throw error;
      }
    }
  }
  if (!candidates.length) {
    throw lastError || new UpstreamError(`目前找不到可行的${ROUTE_PLANNER_MODE_LABELS[mode]}方案`, 422);
  }
  return candidates.sort(comparePlannerTransitResults).slice(0, 5);
}

function plannerTransferMarkers(legs) {
  const transitLegs = legs.filter((leg) => leg.mode !== 'walk');
  return transitLegs.slice(1).map((leg, index) => {
    const previous = transitLegs[index];
    const previousStop = asArray(previous.stops).at(-1);
    const currentStop = asArray(leg.stops)[0];
    const point = currentStop && Number.isFinite(currentStop.lat) && Number.isFinite(currentStop.lng)
      ? currentStop
      : previousStop;
    return {
      stationId: String(currentStop?.id || previousStop?.id || ''),
      stationName: previous.destination === leg.origin
        ? leg.origin
        : `${previous.destination || '前段終點'} → ${leg.origin || '後段起點'}`,
      waitMinutes: PLANNER_ROAD_MODES.has(previous.mode) || PLANNER_ROAD_MODES.has(leg.mode)
        ? 10
        : 5,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null
    };
  });
}

const PLANNER_ROAD_MODES = new Set(['car', 'scooter']);
const PLANNER_TRANSIT_MODES = new Set(['bus', 'metro', 'tra', 'thsr']);

function plannerScopeAtPoint(mode, point) {
  if (mode === 'tra' || mode === 'thsr') return {};
  const portalCityCode = portalCityForPoint(point);
  const tdxCity = TDX_CITY_BY_PORTAL_CODE[portalCityCode];
  if (!portalCityCode || !tdxCity) {
    throw new UpstreamError(`無法判斷${ROUTE_PLANNER_MODE_LABELS[mode]}轉乘縣市`, 422);
  }
  if (mode === 'bus') return { portalCityCode, tdxCity };
  const system = (METRO_SYSTEMS_BY_CITY[portalCityCode] || [])[0];
  if (!system) throw new UpstreamError('此地區沒有可用的捷運系統', 422);
  return { portalCityCode, tdxCity, system };
}

async function plannerTransferWaypoints(mode, referencePoint, excludedPoint, limit = 3) {
  if (!PLANNER_TRANSIT_MODES.has(mode)) return [];
  const stationData = await fetchJourneyStationData(mode, plannerScopeAtPoint(mode, referencePoint));
  const maximumDistances = { bus: 25_000, metro: 45_000, tra: 120_000, thsr: 180_000 };
  return nearestJourneyStations(
    stationData.stations,
    referencePoint,
    maximumDistances[mode],
    Math.max(limit * 2, 4)
  ).filter((entry) => (
    !excludedPoint
    || haversineMeters(
      entry.station.lat, entry.station.lng, excludedPoint.lat, excludedPoint.lng
    ) >= 150
  )).slice(0, limit).map((entry) => plannerStationPoint(entry.station));
}

function plannerRoadLeg(mode, result, originPoint, destinationPoint) {
  return {
    mode,
    title: `${ROUTE_PLANNER_MODE_LABELS[mode]}接駁`,
    origin: originPoint.name,
    destination: destinationPoint.name,
    durationMinutes: result.durationMinutes,
    distanceMeters: Math.round((result.distanceKm || 0) * 1000),
    geometry: result.geometry || [],
    steps: result.steps || [],
    stops: [originPoint, destinationPoint]
  };
}

async function fetchPlannerModeSegment(
  context, mode, originPoint, destinationPoint, departure, options = {}
) {
  if (routePlannerDeadlineReached(context)) {
    throw new UpstreamError('路線規劃已達本次計算時間上限', 504);
  }
  if (haversineMeters(
    originPoint.lat, originPoint.lng, destinationPoint.lat, destinationPoint.lng
  ) < 100) {
    throw new UpstreamError(`${ROUTE_PLANNER_MODE_LABELS[mode]}接駁距離太短`, 422);
  }
  if (PLANNER_ROAD_MODES.has(mode)) {
    const result = (await fetchRoadPlannerResults(mode, originPoint, destinationPoint))[0];
    if (!result) throw new UpstreamError(`目前找不到可行的${ROUTE_PLANNER_MODE_LABELS[mode]}接駁`, 422);
    return {
      mode,
      boardingTimestamp: departure.timestamp,
      arrivalTimestamp: departure.timestamp + result.durationMinutes * 60_000,
      fareLabels: [`${ROUTE_PLANNER_MODE_LABELS[mode]}接駁費用未提供`],
      legs: [plannerRoadLeg(mode, result, originPoint, destinationPoint)]
    };
  }
  const result = [...await fetchTransitPlannerResultsCached(
    context,
    mode,
    originPoint,
    destinationPoint,
    departure,
    { includeRealtime: false, planningContext: context, ...options }
  )].sort((left, right) => left.arrivalTimestamp - right.arrivalTimestamp)[0];
  if (!result) throw new UpstreamError(`目前找不到可行的${ROUTE_PLANNER_MODE_LABELS[mode]}接駁`, 422);
  return {
    mode,
    boardingTimestamp: result.boardingTimestamp,
    arrivalTimestamp: result.arrivalTimestamp,
    fareLabels: result.fareLabel ? [result.fareLabel] : [],
    legs: result.legs || []
  };
}

function plannerConnectorBufferMinutes(mode) {
  return PLANNER_ROAD_MODES.has(mode) ? 10 : 5;
}

function plannerCoreSegmentMakesProgress(
  coreOrigin, coreDestination, originPoint, destinationPoint
) {
  const tripDistance = haversineMeters(
    originPoint.lat, originPoint.lng, destinationPoint.lat, destinationPoint.lng
  );
  const minimumProgress = Math.max(250, Math.min(2_000, tripDistance * 0.03));
  const progressFromOrigin = haversineMeters(
    originPoint.lat, originPoint.lng, coreDestination.lat, coreDestination.lng
  ) - haversineMeters(
    originPoint.lat, originPoint.lng, coreOrigin.lat, coreOrigin.lng
  );
  const progressTowardDestination = haversineMeters(
    coreOrigin.lat, coreOrigin.lng, destinationPoint.lat, destinationPoint.lng
  ) - haversineMeters(
    coreDestination.lat, coreDestination.lng, destinationPoint.lat, destinationPoint.lng
  );
  return progressFromOrigin >= minimumProgress
    && progressTowardDestination >= minimumProgress;
}

function combinePlannerConnectorSegments(sequence, segments) {
  return {
    modes: sequence,
    boardingTimestamp: segments.find((segment) => Number.isFinite(segment.boardingTimestamp))
      ?.boardingTimestamp,
    arrivalTimestamp: segments.at(-1).arrivalTimestamp,
    fareLabels: segments.flatMap((segment) => segment.fareLabels || []),
    legs: segments.flatMap((segment) => segment.legs || [])
  };
}

async function fetchPlannerConnector(
  sequence, originPoint, destinationPoint, departure, context, side = 'access'
) {
  if (!sequence.length || sequence.length > 2) {
    throw new UpstreamError('接駁運具組合不正確', 422);
  }
  if (sequence.length === 1) {
    return combinePlannerConnectorSegments(sequence, [await fetchPlannerModeSegment(
      context, sequence[0], originPoint, destinationPoint, departure
    )]);
  }
  const waypointMode = side === 'access' ? sequence[1] : sequence[0];
  const referencePoint = side === 'access' ? originPoint : destinationPoint;
  const excludedPoint = side === 'access' ? destinationPoint : originPoint;
  const waypoints = await plannerTransferWaypoints(
    waypointMode, referencePoint, excludedPoint, 3
  );
  let lastError;
  for (const waypoint of waypoints) {
    try {
      const first = await fetchPlannerModeSegment(
        context, sequence[0], originPoint, waypoint, departure
      );
      const secondDeparture = plannerDepartureAfter(
        departure,
        Math.max(1, Math.round((first.arrivalTimestamp - departure.timestamp) / 60_000))
          + plannerConnectorBufferMinutes(sequence[0])
      );
      const second = await fetchPlannerModeSegment(
        context, sequence[1], waypoint, destinationPoint, secondDeparture
      );
      return combinePlannerConnectorSegments(sequence, [first, second]);
    } catch (error) {
      lastError = error;
      if (routePlannerDeadlineReached(context)) throw error;
    }
  }
  throw lastError || new UpstreamError('目前找不到可銜接的接駁轉乘點', 422);
}

function plannerMultimodalResult({
  id, modeSequence, originPoint, destinationPoint, departure,
  boardingTimestamp, arrivalTimestamp, fareLabels, legs
}) {
  const transfers = plannerTransferMarkers(legs);
  const timedLegs = plannerLegTimeline(legs, departure.timestamp, arrivalTimestamp);
  return enrichPlannerTransitResult({
    id,
    mode: 'multimodal',
    modeSequence,
    title: modeSequence.map((mode) => ROUTE_PLANNER_MODE_LABELS[mode]).join(' → '),
    subtitle: `${originPoint.name} → ${destinationPoint.name}`,
    departureTime: formatJourneyClock(departure.timestamp),
    arrivalTime: formatJourneyClock(arrivalTimestamp),
    departureTimestamp: departure.timestamp,
    boardingTimestamp: boardingTimestamp || departure.timestamp,
    arrivalTimestamp,
    durationMinutes: Math.max(1, Math.round((arrivalTimestamp - departure.timestamp) / 60_000)),
    transferCount: transfers.length,
    transfers,
    fareLabel: fareLabels.filter(Boolean).join(' + ') || '未提供完整票價',
    statusLabel: `跨運具轉乘 ${transfers.length} 次`,
    assumption: '依各段班次時間串接；站外轉乘預留 5 分鐘，汽機車轉乘預留 10 分鐘並需自行安排停車、接送或租借。非官方逐站班次以「約」標示。',
    legs: timedLegs,
    mapPoints: timedLegs.flatMap((leg) => asArray(leg.stops))
      .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng))
      .map((point) => ({ lat: point.lat, lng: point.lng, name: point.name || '' }))
  }, originPoint, destinationPoint);
}

async function fetchMultimodalPlannerSpecificationResults(
  specification, originPoint, destinationPoint, departure, context
) {
  const { accessModes = [], coreMode, egressModes = [] } = specification;
  const coreStationData = await fetchJourneyStationData(coreMode);
  const maximumDistance = coreMode === 'thsr' ? 90_000 : 40_000;
  const originStations = nearestJourneyStations(coreStationData.stations, originPoint, maximumDistance, 2);
  const destinationStations = nearestJourneyStations(coreStationData.stations, destinationPoint, maximumDistance, 2);
  const candidates = [];
  let lastError;
  stationPairs: for (const originEntry of originStations) {
    for (const destinationEntry of destinationStations) {
      if (routePlannerDeadlineReached(context)) {
        if (candidates.length) break stationPairs;
        throw new UpstreamError('路線規劃已達本次計算時間上限', 504);
      }
      if (originEntry.station.id === destinationEntry.station.id) continue;
      const coreOrigin = plannerStationPoint(originEntry.station);
      const coreDestination = plannerStationPoint(destinationEntry.station);
      if (!plannerCoreSegmentMakesProgress(
        coreOrigin, coreDestination, originPoint, destinationPoint
      )) continue;
      try {
        let cursor = departure;
        let accessConnector = null;
        let accessWalk = null;
        if (accessModes.length) {
          accessConnector = await fetchPlannerConnector(
            accessModes, originPoint, coreOrigin, cursor, context, 'access'
          );
          cursor = plannerDepartureAfter(
            departure,
            Math.max(1, Math.round(
              (accessConnector.arrivalTimestamp - departure.timestamp) / 60_000
            )) + plannerConnectorBufferMinutes(accessModes.at(-1))
          );
        } else {
          if (originEntry.distanceMeters > ROUTE_PLANNER_WALK_LIMIT_METERS[coreMode]) continue;
          accessWalk = walkingPlannerLeg(
            originPoint, coreOrigin, originEntry.distanceMeters, `步行至 ${coreOrigin.name}`
          );
          cursor = plannerDepartureAfter(departure, accessWalk.durationMinutes + 5);
        }

        const coreSearch = await searchRailJourneys(
          coreMode,
          originEntry.station.id,
          destinationEntry.station.id,
          cursor,
          { candidateLimit: 5, includeRealtime: false }
        );
        for (const [coreIndex, coreJourney] of coreSearch.results.slice(0, 2).entries()) {
          if (routePlannerDeadlineReached(context)) break;
          try {
            const coreRideMinutes = plannerJourneyRideMinutes(
              coreMode, coreJourney, originEntry.station, destinationEntry.station
            );
            const coreArrivalTimestamp = plannerJourneyArrivalTimestamp(coreJourney, coreRideMinutes);
            if (!Number.isFinite(coreArrivalTimestamp)) continue;

            let egressConnector = null;
            let egressWalk = null;
            if (egressModes.length) {
              const egressDeparture = plannerDepartureAfter(
                departure,
                Math.max(1, Math.round((coreArrivalTimestamp - departure.timestamp) / 60_000))
                  + plannerConnectorBufferMinutes(egressModes[0])
              );
              egressConnector = await fetchPlannerConnector(
                egressModes, coreDestination, destinationPoint, egressDeparture, context, 'egress'
              );
            } else {
              if (destinationEntry.distanceMeters > ROUTE_PLANNER_WALK_LIMIT_METERS[coreMode]) continue;
              egressWalk = walkingPlannerLeg(
                coreDestination, destinationPoint, destinationEntry.distanceMeters,
                `由 ${coreDestination.name} 步行至目的地`
              );
            }

            const legs = [
              ...(accessConnector?.legs || (accessWalk ? [accessWalk] : [])),
              ...asArray(coreJourney.legs),
              ...(egressConnector?.legs || (egressWalk ? [egressWalk] : []))
            ];
            const modeSequence = [...accessModes, coreMode, ...egressModes];
            const arrivalTimestamp = egressConnector?.arrivalTimestamp
              || coreArrivalTimestamp + (egressWalk?.durationMinutes || 0) * 60_000;
            candidates.push(plannerMultimodalResult({
              id: `planner:multimodal:${modeSequence.join('-')}:${originEntry.station.id}:${destinationEntry.station.id}:${coreIndex}`,
              modeSequence,
              originPoint,
              destinationPoint,
              departure,
              boardingTimestamp: accessConnector?.boardingTimestamp || coreJourney.boardingTimestamp,
              arrivalTimestamp,
              fareLabels: [
                ...(accessConnector?.fareLabels || []),
                coreJourney.fareLabel,
                ...(egressConnector?.fareLabels || [])
              ],
              legs
            }));
          } catch (error) {
            lastError = error;
            if ([429, 502, 503, 504].includes(error?.status)) {
              context.multimodalWarnings.add(`跨運具：${error.message || '即時資料暫時無法使用'}`);
            }
          }
        }
      } catch (error) {
        lastError = error;
        if ([429, 502, 503, 504].includes(error?.status)) {
          context.multimodalWarnings.add(`跨運具：${error.message || '即時資料暫時無法使用'}`);
        }
      }
    }
  }
  if (candidates.length) {
    return candidates.sort(comparePlannerTransitResults).slice(0, 2);
  }
  throw lastError || new UpstreamError('目前找不到可銜接的跨運具轉乘方案', 422);
}

function plannerAvailableConnectorModes(modes, point, coreMode = '') {
  const city = portalCityForPoint(point);
  return modes.filter((mode) => {
    if (mode === coreMode) return false;
    if (PLANNER_ROAD_MODES.has(mode) || mode === 'tra' || mode === 'thsr') return true;
    if (mode === 'bus') return Boolean(city && TDX_CITY_BY_PORTAL_CODE[city]);
    return mode === 'metro' && (METRO_SYSTEMS_BY_CITY[city] || []).length > 0;
  });
}

function plannerConnectorSequences(modes, point, coreMode, side) {
  const available = plannerAvailableConnectorModes(modes, point, coreMode);
  const sequences = [[], ...available.map((mode) => [mode])];
  available.forEach((first) => {
    available.forEach((second) => {
      if (first === second || (PLANNER_ROAD_MODES.has(first) && PLANNER_ROAD_MODES.has(second))) return;
      if (side === 'access' && PLANNER_ROAD_MODES.has(second)) return;
      if (side === 'egress' && PLANNER_ROAD_MODES.has(first)) return;
      sequences.push([first, second]);
    });
  });
  return sequences;
}

function plannerServiceSignature(result) {
  return asArray(result?.legs).filter((leg) => leg.mode !== 'walk').map((leg) => (
    `${leg.mode}:${leg.title || leg.routeName || ''}`
  )).join('|');
}

function plannerSameServiceDominates(left, right) {
  const leftSignature = plannerServiceSignature(left);
  if (!leftSignature || leftSignature !== plannerServiceSignature(right)) return false;
  const metric = (result, field, fallback) => {
    const value = Number(result?.[field]);
    return Number.isFinite(value) ? value : fallback;
  };
  const noWorse = [
    ['durationMinutes', Infinity],
    ['walkingMinutes', Infinity],
    ['transferCount', Infinity],
    ['estimatedLegs', Infinity]
  ].every(([field, fallback]) => (
    metric(left, field, fallback) <= metric(right, field, fallback)
  ));
  return noWorse && plannerTransitResultScore(left) < plannerTransitResultScore(right);
}

function selectMultimodalPlannerResults(results, limit = 5) {
  const unique = results.filter((result, index, all) => all.findIndex((candidate) => (
    candidate.modeSequence.join('|') === result.modeSequence.join('|')
    && candidate.legs.map((leg) => (
      `${leg.mode}:${leg.title || leg.routeName || ''}:${leg.origin}:${leg.destination}:${leg.departureTimestamp || ''}`
    )).join('|') === result.legs.map((leg) => (
      `${leg.mode}:${leg.title || leg.routeName || ''}:${leg.origin}:${leg.destination}:${leg.departureTimestamp || ''}`
    )).join('|')
  )) === index);
  const nonDominated = unique.filter((result, index, all) => !all.some((candidate, otherIndex) => (
    otherIndex !== index && plannerSameServiceDominates(candidate, result)
  )));
  return nonDominated.sort(comparePlannerTransitResults)
    .slice(0, limit);
}

async function fetchConnectorOnlyPlannerResult(
  sequence, originPoint, destinationPoint, departure, context
) {
  const side = PLANNER_ROAD_MODES.has(sequence.at(-1)) ? 'egress' : 'access';
  const connector = await fetchPlannerConnector(
    sequence, originPoint, destinationPoint, departure, context, side
  );
  return plannerMultimodalResult({
    id: `planner:multimodal:${sequence.join('-')}:${plannerPointMemoKey(originPoint)}:${plannerPointMemoKey(destinationPoint)}`,
    modeSequence: sequence,
    originPoint,
    destinationPoint,
    departure,
    boardingTimestamp: connector.boardingTimestamp,
    arrivalTimestamp: connector.arrivalTimestamp,
    fareLabels: connector.fareLabels,
    legs: connector.legs
  });
}

async function fetchMultimodalPlannerResults(modes, origin, destination, departure, context) {
  const coreModes = modes.filter((mode) => mode === 'tra' || mode === 'thsr');
  if (!coreModes.length) {
    const originModes = plannerAvailableConnectorModes(modes, origin);
    const destinationModes = new Set(plannerAvailableConnectorModes(modes, destination));
    const sequences = originModes.flatMap((first) => originModes.map((second) => [first, second]))
      .filter(([first, second]) => first !== second && destinationModes.has(second))
      .filter(([first, second]) => !(PLANNER_ROAD_MODES.has(first) && PLANNER_ROAD_MODES.has(second)))
      .sort((left, right) => (
        new Set(right).size - new Set(left).size
        || right.filter((mode) => PLANNER_TRANSIT_MODES.has(mode)).length
          - left.filter((mode) => PLANNER_TRANSIT_MODES.has(mode)).length
    ));
    const localResults = [];
    for (const sequence of sequences.slice(0, ROUTE_PLANNER_MULTIMODAL_SPEC_LIMIT)) {
      if (routePlannerDeadlineReached(context)) break;
      try {
        localResults.push(await fetchConnectorOnlyPlannerResult(
          sequence, origin, destination, departure, context
        ));
      } catch (error) {
        if (routePlannerDeadlineReached(context)) break;
      }
    }
    return selectMultimodalPlannerResults(localResults);
  }
  const specifications = [];
  coreModes.forEach((coreMode) => {
    const accessSequences = plannerConnectorSequences(modes, origin, coreMode, 'access');
    const egressSequences = plannerConnectorSequences(modes, destination, coreMode, 'egress');
    accessSequences.forEach((accessModes) => {
      egressSequences.forEach((egressModes) => {
        if (accessModes.length || egressModes.length) {
          specifications.push({ accessModes, coreMode, egressModes });
        }
      });
    });
  });
  specifications.sort((left, right) => {
    const leftSequence = [...left.accessModes, left.coreMode, ...left.egressModes];
    const rightSequence = [...right.accessModes, right.coreMode, ...right.egressModes];
    return leftSequence.length - rightSequence.length
      || new Set(rightSequence).size - new Set(leftSequence).size
      || rightSequence.filter((mode) => PLANNER_TRANSIT_MODES.has(mode)).length
        - leftSequence.filter((mode) => PLANNER_TRANSIT_MODES.has(mode)).length;
  });
  const deduplicatedSpecifications = specifications.filter((specification, index, all) => {
    const key = `${specification.accessModes.join(',')}|${specification.coreMode}|${specification.egressModes.join(',')}`;
    return all.findIndex((candidate) => (
      `${candidate.accessModes.join(',')}|${candidate.coreMode}|${candidate.egressModes.join(',')}` === key
    )) === index;
  });
  const specificationLength = (specification) => (
    specification.accessModes.length + 1 + specification.egressModes.length
  );
  const uniqueSpecifications = [];
  const addSpecifications = (predicate, limit = Infinity) => {
    let added = 0;
    for (const specification of deduplicatedSpecifications) {
      if (uniqueSpecifications.length >= ROUTE_PLANNER_MULTIMODAL_SPEC_LIMIT || added >= limit) break;
      if (!predicate(specification) || uniqueSpecifications.includes(specification)) continue;
      uniqueSpecifications.push(specification);
      added += 1;
    }
  };
  const sideHasModeType = (sideModes, type) => sideModes.some((mode) => (
    type === 'road' ? PLANNER_ROAD_MODES.has(mode) : PLANNER_TRANSIT_MODES.has(mode)
  ));

  coreModes.forEach((coreMode) => {
    ['bus', 'metro'].filter((mode) => modes.includes(mode)).forEach((accessMode) => {
      ['bus', 'metro'].filter((mode) => modes.includes(mode)).forEach((egressMode) => {
        addSpecifications((item) => (
          item.coreMode === coreMode
          && item.accessModes.length === 1
          && item.accessModes[0] === accessMode
          && item.egressModes.length === 1
          && item.egressModes[0] === egressMode
        ), 1);
      });
    });
  });
  modes.filter((mode) => PLANNER_ROAD_MODES.has(mode)).forEach((roadMode) => {
    ['bus', 'metro'].filter((mode) => modes.includes(mode)).forEach((localMode) => {
      addSpecifications((item) => (
        item.accessModes.length === 1
        && item.accessModes[0] === roadMode
        && item.egressModes.length === 1
        && item.egressModes[0] === localMode
      ), 1);
    });
  });
  addSpecifications((item) => specificationLength(item) === 2, 3);
  addSpecifications((item) => (
    specificationLength(item) === 3
    && sideHasModeType(item.accessModes, 'transit')
    && sideHasModeType(item.egressModes, 'road')
  ), 2);
  addSpecifications((item) => (
    specificationLength(item) === 3
    && sideHasModeType(item.accessModes, 'road')
    && sideHasModeType(item.egressModes, 'transit')
  ), 2);
  addSpecifications((item) => specificationLength(item) === 3, 3);
  addSpecifications((item) => specificationLength(item) === 4, 2);
  addSpecifications((item) => specificationLength(item) >= 5, 1);
  const results = [];
  const comparisonBatchSize = 2;
  for (let index = 0; index < uniqueSpecifications.length; index += comparisonBatchSize) {
    if (routePlannerDeadlineReached(context)) break;
    const batch = uniqueSpecifications.slice(index, index + comparisonBatchSize);
    const outcomes = await Promise.allSettled(batch.map((specification) => (
      fetchMultimodalPlannerSpecificationResults(
        specification, origin, destination, departure, context
      )
    )));
    outcomes.forEach((outcome) => {
      if (outcome.status === 'fulfilled') results.push(...outcome.value);
    });
    if (routePlannerDeadlineReached(context)) {
      break;
    }
  }
  return selectMultimodalPlannerResults(results);
}

function routePlannerResultCacheKey(origin, destination, departure, modes, strategy) {
  return JSON.stringify({
    origin: [origin.lat.toFixed(4), origin.lng.toFixed(4), origin.name, origin.city || ''],
    destination: [
      destination.lat.toFixed(4), destination.lng.toFixed(4),
      destination.name, destination.city || ''
    ],
    departure: departure.timestamp,
    modes: [...modes].sort(),
    strategy,
    transportState: [tdxFetchingEnabled, tdxFetchingChangedAt]
  });
}

function pruneRoutePlannerResultCache() {
  const now = Date.now();
  for (const [key, entry] of routePlannerResultCache) {
    if (!entry.pending && entry.expiresAt <= now) routePlannerResultCache.delete(key);
  }
  while (routePlannerResultCache.size > 200) {
    routePlannerResultCache.delete(routePlannerResultCache.keys().next().value);
  }
}

async function buildRoutePlannerData(origin, destination, departure, modes, strategy = 'all') {
  const context = createRoutePlanningContext();
  const settled = Array(modes.length);
  const includesDirectResults = strategy !== 'multimodal';
  const includesMultimodalResults = strategy === 'all' || strategy === 'multimodal';
  const multimodalModes = [...modes];
  let multimodalResults = [];
  const preparationTask = Promise.resolve();
  const preparationWarnings = [];
  const modeTasks = includesDirectResults ? modes.map(async (mode, index) => {
    try {
      const results = ROUTE_PLANNER_GRAPHHOPPER_MODES.has(mode)
        ? await fetchRoadPlannerResults(mode, origin, destination)
        : await fetchTransitPlannerResultsCached(
          context, mode, origin, destination, departure, { planningContext: context }
        );
      settled[index] = { status: 'fulfilled', value: { mode, results } };
    } catch (error) {
      settled[index] = { status: 'rejected', reason: error };
      return;
    }
  }) : [];
  const multimodalTask = includesMultimodalResults
    ? fetchMultimodalPlannerResults(
        multimodalModes, origin, destination, departure, context
      ).then((results) => {
        multimodalResults = results;
      }).catch((error) => {
        if ([429, 502, 503, 504].includes(error?.status)) {
          context.multimodalWarnings.add(`跨運具：${error.message || '即時資料暫時無法使用'}`);
        }
      })
    : Promise.resolve();
  const plannerTasks = [...modeTasks, preparationTask, multimodalTask];
  if (strategy === 'prepare') {
    await Promise.allSettled(plannerTasks);
  } else {
    await waitForRoutePlannerTasks(plannerTasks, context);
  }
  const completedModes = settled.slice();
  const completedMultimodalResults = multimodalResults.slice();
  try {
    const debugEntry = {
      time: new Date().toISOString(),
      modes,
      multimodalCount: completedMultimodalResults.length,
      multimodalSequences: completedMultimodalResults.map((r) => r.modeSequence || [r.mode])
    };
    fs.appendFileSync(path.join(ROOT, 'route-planner-debug.log'), `${JSON.stringify(debugEntry)}\n`);
  } catch (e) {
    // ignore
  }
  const results = [
    ...completedMultimodalResults,
    ...completedModes.flatMap((result) => result?.status === 'fulfilled' ? result.value.results : [])
  ];
  try {
    const resultSummary = results.map((r) => ({ mode: r.mode, modeSequence: r.modeSequence || [r.mode], legs: Array.isArray(r.legs) ? r.legs.map((l) => l.mode) : [] }));
    fs.appendFileSync(path.join(ROOT, 'route-planner-debug.log'), `RESULTS ${JSON.stringify({time: new Date().toISOString(), summary: resultSummary})}\n`);
  } catch (e) {}
  const warnings = completedModes.flatMap((result, index) => result?.status === 'rejected'
    ? [`${ROUTE_PLANNER_MODE_LABELS[modes[index]]}：${result.reason?.message || '規劃失敗'}`]
    : []);
  const failures = completedModes.filter((result) => result?.status === 'rejected');
  if (includesDirectResults && !results.length && failures.length === modes.length && !context.timedOut) {
    throw failures.find((result) => result.reason?.status === 429)?.reason
      || failures[0].reason;
  }
  if (context.timedOut) {
    warnings.push('部分次要轉乘方案超過計算時間，已先顯示目前完成的結果');
  }
  warnings.push(...preparationWarnings.map((warning) => `資料準備：${warning}`));
  warnings.push(...context.multimodalWarnings);
  return {
    origin,
    destination,
    departureTime: departure.timestamp,
    modes,
    strategy,
    complete: !context.timedOut,
    warnings,
    results
  };
}

function fetchRoutePlannerData(origin, destination, departure, modes, strategy = 'all') {
  const key = routePlannerResultCacheKey(origin, destination, departure, modes, strategy);
  let entry = routePlannerResultCache.get(key);
  if (entry?.data && entry.expiresAt > Date.now()) return Promise.resolve(entry.data);
  if (entry?.pending) return entry.pending;
  entry = { data: null, pending: null, expiresAt: 0 };
  entry.pending = buildRoutePlannerData(origin, destination, departure, modes, strategy)
    .then((data) => {
      if (data.complete) {
        entry.data = data;
        entry.expiresAt = Date.now() + ROUTE_PLANNER_RESULT_CACHE_MS;
      } else {
        routePlannerResultCache.delete(key);
      }
      return data;
    })
    .catch((error) => {
      routePlannerResultCache.delete(key);
      throw error;
    })
    .finally(() => {
      entry.pending = null;
    });
  routePlannerResultCache.set(key, entry);
  pruneRoutePlannerResultCache();
  return entry.pending;
}

async function proxyRoutePlanner(requestUrl, response) {
  try {
    await runWithTdxPriority('high', async () => {
      const origin = requirePlannerPoint(requestUrl.searchParams, 'origin');
      const destination = requirePlannerPoint(requestUrl.searchParams, 'destination');
      if (haversineMeters(origin.lat, origin.lng, destination.lat, destination.lng) < 50) {
        throw new UpstreamError('起點與終點距離太近，請選擇不同地點', 400);
      }
      const requestedModes = String(requestUrl.searchParams.get('modes') || 'car,bus,tra,metro,thsr')
        .split(',').map((mode) => mode.trim().toLowerCase()).filter((mode) => ROUTE_PLANNER_MODE_LABELS[mode]);
      const modes = [...new Set(requestedModes)];
      if (!modes.length) throw new UpstreamError('請至少選擇一種交通方式', 400);
      const departure = parseJourneyDeparture(requestUrl.searchParams.get('departureTime'));
      const requestedStrategy = String(requestUrl.searchParams.get('strategy') || 'all').toLowerCase();
      const strategy = ['direct', 'prepare', 'multimodal'].includes(requestedStrategy)
        ? requestedStrategy
        : 'all';
      const data = await fetchRoutePlannerData(origin, destination, departure, modes, strategy);
      // Normalize multimodal results: exclude multimodal sequences that include 'car'
      try {
        const beforeCount = data.results.length;
        data.results = data.results.filter((result) => {
          if (result.mode !== 'multimodal') return true;
          if (Array.isArray(result.modeSequence) && result.modeSequence.includes('car')) return false;
          return true;
        });
        const afterCount = data.results.length;
        fs.appendFileSync(path.join(ROOT, 'route-planner-debug.log'), `FILTERED ${new Date().toISOString()} before=${beforeCount} after=${afterCount}\n`);
      } catch (e) {}
      try {
        const requestedModes = String(requestUrl.searchParams.get('modes') || '').toLowerCase();
        if (requestedModes.includes('car') && requestedModes.includes('scooter')) {
          fs.appendFileSync(path.join(ROOT, 'route-planner-debug.log'), `RESPONSE ${new Date().toISOString()} ${JSON.stringify({origin: origin.name, destination: destination.name, modes: requestedModes, results: data.results.map((r)=> ({mode: r.mode, modeSequence: r.modeSequence || [r.mode]}))})}\n`);
        }
      } catch (e) {}
      sendJson(response, 200, {
        success: true,
        source: 'GraphHopper 道路路由、交通部 TDX 與伺服器轉乘規劃',
        observedAt: new Date().toISOString(),
        data
      });
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

function interpolateJourneyPosition(stops, progress) {
  const positionedStops = stops.filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
  if (!positionedStops.length) return null;
  if (positionedStops.length === 1) return { lat: positionedStops[0].lat, lng: positionedStops[0].lng };
  const scaled = Math.min(1, Math.max(0, progress)) * (positionedStops.length - 1);
  const index = Math.min(positionedStops.length - 2, Math.floor(scaled));
  const localProgress = scaled - index;
  return {
    lat: positionedStops[index].lat + (positionedStops[index + 1].lat - positionedStops[index].lat) * localProgress,
    lng: positionedStops[index].lng + (positionedStops[index + 1].lng - positionedStops[index].lng) * localProgress
  };
}

async function liveBusJourney(searchParams) {
  const scope = requireJourneyCity(searchParams);
  const plateNumber = String(searchParams.get('plateNumber') || '').trim();
  const routeUid = String(searchParams.get('routeUid') || '').trim();
  const routeName = String(searchParams.get('routeName') || '').trim();
  const rawDirection = searchParams.get('direction');
  const direction = rawDirection === null || rawDirection === '' ? null : Number(rawDirection);
  const vehicle = (nationwideBusSnapshot.byCity[scope.portalCityCode] || []).find((entry) => (
    (!plateNumber || entry.plateNumber === plateNumber)
    && (!routeUid || entry.routeUid === routeUid)
    && (direction === null || entry.direction === direction)
  ));
  const stopOfRoutePayload = await fetchJourneyTdx(
    busJourneyPath('StopOfRoute', scope.tdxCity), { '$top': 10000 }
  );
  const route = asArray(stopOfRoutePayload).find((item) => (
    (!routeUid || String(item.RouteUID || item.RouteID || '') === routeUid)
    && (!routeName || localizedText(item.RouteName || item.SubRouteName) === routeName)
    && (direction === null || item.Direction === direction)
  ));
  const stops = asArray(route?.Stops).map((stop, index) => {
    const position = positionOf(stop);
    return {
      id: String(stop.StopUID || stop.StopID || ''),
      name: localizedText(stop.StopName) || '未命名站點',
      lat: Number.isFinite(position.lat) ? position.lat : null,
      lng: Number.isFinite(position.lng) ? position.lng : null,
      sequence: Number(stop.StopSequence) || index + 1,
      isCurrent: Boolean(vehicle?.currentStopUid && vehicle.currentStopUid === (stop.StopUID || stop.StopID))
    };
  });
  return {
    mode: 'bus',
    title: `${routeName || vehicle?.routeName || '公車'}・${plateNumber || vehicle?.plateNumber || '車牌未提供'}`,
    status: vehicle
      ? `${vehicle.status}｜${vehicle.currentStopUid ? '位置已更新' : '未提供目前站點'}`
      : '目前未收到這輛公車的即時位置',
    accuracy: 'TDX 公車 GPS 即時位置',
    active: Boolean(vehicle),
    observedAt: nationwideBusSnapshot.observedAt,
    position: vehicle ? { lat: vehicle.lat, lng: vehicle.lng, azimuth: vehicle.azimuth } : null,
    stops
  };
}

async function liveRailJourney(mode, searchParams) {
  const date = String(searchParams.get('date') || '').trim();
  const trainNo = String(searchParams.get('trainNo') || '').trim();
  const originId = String(searchParams.get('originId') || '').trim();
  const destinationId = String(searchParams.get('destinationId') || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !trainNo) {
    throw new UpstreamError('追蹤班次參數不完整', 400);
  }
  const stationData = await fetchJourneyStationData(mode);
  const timetablePath = mode === 'tra'
    ? `v3/Rail/TRA/DailyTrainTimetable/TrainDate/${date}`
    : `v2/Rail/THSR/DailyTimetable/TrainDate/${date}`;
  const timetablePayload = await fetchJourneyTdx(timetablePath, { '$top': 10000 });
  const timetable = asArray(timetablePayload, ['TrainTimetables'])
    .find((entry) => String((entry.TrainInfo || entry.DailyTrainInfo)?.TrainNo || '') === trainNo);
  if (!timetable) throw new UpstreamError('目前找不到指定班次時刻表', 404);
  const stops = segmentJourneyStops(
    asArray(timetable.StopTimes), stationData.stations, date, originId, destinationId
  );
  if (!stops?.length) throw new UpstreamError('指定班次沒有通過所選起訖站', 404);
  const departureTimestamp = stops[0].departureTimestamp ?? stops[0].arrivalTimestamp;
  const arrivalTimestamp = stops.at(-1).arrivalTimestamp ?? stops.at(-1).departureTimestamp;
  let position = null;
  let status;
  let accuracy;
  let observedAt = new Date().toISOString();
  if (mode === 'tra') {
    const livePayload = await fetchJourneyTdx('v3/Rail/TRA/TrainLiveBoard', { '$top': 10000 }, true);
    const live = asArray(livePayload, ['TrainLiveBoards'])
      .find((entry) => String(entry.TrainNo || '') === trainNo);
    const currentStationId = String(live?.StationID || '');
    const currentStation = stationData.stations.find((station) => station.stationId === currentStationId);
    if (currentStation && Number.isFinite(currentStation.lat) && Number.isFinite(currentStation.lng)) {
      position = { lat: currentStation.lat, lng: currentStation.lng };
      stops.forEach((stop) => { stop.isCurrent = stop.id === currentStationId; });
    }
    const delay = Number(live?.DelayTime);
    status = live
      ? `剛離開或經過 ${localizedText(live.StationName) || currentStation?.name || '未知車站'}${Number.isFinite(delay) ? `｜延誤 ${delay} 分鐘` : ''}`
      : 'TDX 目前沒有回傳這班列車的位置';
    accuracy = 'TDX 回傳的最近離站／經過站，非連續 GPS';
    observedAt = live?.UpdateTime || livePayload?.UpdateTime || observedAt;
  } else {
    const progress = Number.isFinite(departureTimestamp) && Number.isFinite(arrivalTimestamp)
      ? (Date.now() - departureTimestamp) / Math.max(1, arrivalTimestamp - departureTimestamp)
      : 0;
    position = interpolateJourneyPosition(stops, progress);
    status = Date.now() < departureTimestamp
      ? `預定 ${formatJourneyClock(departureTimestamp)} 發車`
      : Date.now() > arrivalTimestamp
        ? `表定 ${formatJourneyClock(arrivalTimestamp)} 抵達`
        : `依時刻表推估行程 ${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
    accuracy = '高鐵未提供逐車 GPS，目前位置依 TDX 時刻表推估';
  }
  return {
    mode,
    title: `${mode === 'tra' ? '臺鐵' : '高鐵'} ${trainNo} 次`,
    status,
    accuracy,
    active: Date.now() >= departureTimestamp && Date.now() <= arrivalTimestamp,
    observedAt,
    position,
    stops
  };
}

async function liveMetroJourney(searchParams) {
  const system = String(searchParams.get('system') || '').trim().toUpperCase();
  if (!METRO_SYSTEM_LABELS[system]) throw new UpstreamError('不支援的捷運系統', 400);
  const routeId = String(searchParams.get('routeId') || '').trim();
  const originId = String(searchParams.get('originId') || '').trim();
  const destinationId = String(searchParams.get('destinationId') || '').trim();
  const departureTimestamp = Number(searchParams.get('departureTimestamp'));
  const durationSeconds = Number(searchParams.get('durationSeconds'));
  const rawDirection = searchParams.get('direction');
  const direction = rawDirection === null || rawDirection === '' ? null : Number(rawDirection);
  if (!routeId || !originId || !destinationId || !Number.isFinite(departureTimestamp)
    || !Number.isFinite(durationSeconds)) throw new UpstreamError('追蹤班次參數不完整', 400);
  const [stationData, routePayload] = await Promise.all([
    fetchJourneyStationData('metro', { system }),
    fetchJourneyTdx(`v2/Rail/Metro/StationOfRoute/${system}`, { '$top': 10000 })
  ]);
  const route = asArray(routePayload).find((entry) => (
    String(entry.RouteID || '') === routeId && (direction === null || entry.Direction === direction)
  ));
  const routeStops = metroRouteStops(route, stationData.stations);
  const originIndex = routeStops.findIndex((stop) => stop.id === originId);
  const destinationIndex = routeStops.findIndex((stop, index) => index > originIndex && stop.id === destinationId);
  if (originIndex < 0 || destinationIndex < 0) {
    throw new UpstreamError('指定捷運路線不包含所選起訖站', 404);
  }
  const stops = routeStops.slice(originIndex, destinationIndex + 1);
  const arrivalTimestamp = departureTimestamp + durationSeconds * 1000;
  const progress = (Date.now() - departureTimestamp) / Math.max(1, arrivalTimestamp - departureTimestamp);
  let position = interpolateJourneyPosition(stops, progress);
  let accuracy = '捷運未提供此班次車號，位置依 TDX 時刻表與站間時間推估';
  let status = `依時刻表推估行程 ${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
  let observedAt = new Date().toISOString();
  if (system === 'KLRT') {
    const positionPayload = await fetchJourneyTdx(
      `v2/Rail/Metro/LivePosition/${system}`, { '$top': 1000 }, true
    );
    const matchingPosition = asArray(positionPayload).find((entry) => (
      (!entry.RouteID || String(entry.RouteID) === routeId)
      && (direction === null || entry.Direction === direction)
    ));
    const livePosition = positionOf(matchingPosition || {});
    if (Number.isFinite(livePosition.lat) && Number.isFinite(livePosition.lng)) {
      position = livePosition;
      accuracy = 'TDX 高雄輕軌 GPS 即時位置';
      status = '官方即時位置已更新';
      observedAt = matchingPosition.GPSTime || matchingPosition.UpdateTime || observedAt;
    }
  } else if (['TRTC', 'KRTC', 'TYMC'].includes(system)) {
    const boardPayload = await fetchJourneyTdx(
      `v2/Rail/Metro/LiveBoard/${system}`, { '$top': 10000 }, true
    );
    const board = asArray(boardPayload).find((entry) => (
      String(entry.LineID || entry.LineNO || '') === String(route?.LineID || route?.LineNo || '')
    ));
    if (board) {
      const estimateSeconds = Number(board.EstimateTime);
      status = `${localizedText(board.StationName) || '沿線車站'}下一班${Number.isFinite(estimateSeconds) ? `約 ${Math.ceil(estimateSeconds / 60)} 分鐘` : '時間未提供'}`;
      observedAt = board.UpdateTime || observedAt;
    }
  }
  return {
    mode: 'metro',
    title: `${METRO_SYSTEM_LABELS[system]} ${localizedText(route?.RouteName) || routeId}`,
    status,
    accuracy,
    active: Date.now() >= departureTimestamp && Date.now() <= arrivalTimestamp,
    observedAt,
    position,
    stops
  };
}

async function proxyJourneyLive(requestUrl, response) {
  try {
    await runWithTdxPriority('high', async () => {
      const mode = requireJourneyMode(requestUrl.searchParams);
      let data;
      if (mode === 'bus') data = await liveBusJourney(requestUrl.searchParams);
      else if (mode === 'metro') data = await liveMetroJourney(requestUrl.searchParams);
      else data = await liveRailJourney(mode, requestUrl.searchParams);
      sendJson(response, 200, {
        success: true,
        source: '交通部 TDX 即時動態與伺服器追蹤快取',
        observedAt: data.observedAt || new Date().toISOString(),
        refreshIntervalSeconds: JOURNEY_LIVE_REFRESH_INTERVAL_MS / 1000,
        data
      });
    });
  } catch (error) {
    sendApiError(response, error);
  }
}

async function fetchDataGovCategory(cityTid, category) {
  if (!dataGovFetchingEnabled) throw new UpstreamError('管理員已關閉當地資訊', 503);
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
    if (!dataGovFetchingEnabled) throw new UpstreamError('管理員已關閉當地資訊', 503);
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
    if (!dataGovFetchingEnabled) throw new UpstreamError('管理員已關閉當地資訊', 503);
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
  const pathname = new URL(request.url, REQUEST_BASE_ORIGIN).pathname;
  const requestPath = pathname === '/' ? '/index.html' : pathname;
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
        tdxClientId: Boolean(process.env.TDX_CLIENT_ID_1 || process.env.TDX_CLIENT_ID),
        tdxClientSecret: Boolean(process.env.TDX_CLIENT_SECRET_1 || process.env.TDX_CLIENT_SECRET),
        tdxConfigured: tdxCredentials.length > 0,
        tdxCredentialCount: tdxCredentials.length,
        tdxAvailableCredentialCount: tdxCredentials
          .filter((credential) => Date.now() >= credential.rateLimitedUntil).length,
        tdxPrimaryCredentialCount: tdxCredentialPools.primary.length,
        tdxPrimaryAvailableCredentialCount: availableTdxCredentialCount('primary'),
        tdxReserveCredentialCount: tdxCredentialPools.reserve.length,
        tdxReserveAvailableCredentialCount: availableTdxCredentialCount('reserve'),
        graphHopperConfigured: graphHopperApiKeys.length > 0,
        graphHopperApiKeyCount: graphHopperApiKeys.length,
        graphHopperAvailableApiKeyCount: graphHopperApiKeys
          .filter((apiKey) => Date.now() >= apiKey.rateLimitedUntil).length,
        fcmConfigured: fcmIsConfigured()
      },
      tdxFetchingEnabled,
      tdxFetchingChangedAt,
      cwaFetchingEnabled,
      cwaFetchingChangedAt,
      cwaEmergencyRefreshIntervalSeconds: CWA_EMERGENCY_REFRESH_INTERVAL_MS / 1000,
      announcementCount: portalContent.announcements.length,
      emergencyCount: portalContent.emergencies.length,
      emergencyObservedAt: portalContent.emergencyObservedAt,
      fcmTopic: FCM_TOPIC,
      dataGovFetchingEnabled,
      dataGovFetchingChangedAt,
      busRefreshIntervalSeconds: BUS_REFRESH_INTERVAL_MS / 1000,
      tdxRefreshIntervalSeconds: TDX_REFRESH_INTERVAL_MS / 1000,
      tdxStaticRefreshIntervalSeconds: TDX_STATIC_REFRESH_INTERVAL_MS / 1000,
      tdxDynamicRefreshIntervalSeconds: TDX_DYNAMIC_REFRESH_INTERVAL_MS / 1000,
      tdxTrafficBikeRefreshIntervalSeconds: TDX_DYNAMIC_REFRESH_INTERVAL_MS / 1000,
      tdxParkingRefreshIntervalSeconds: TDX_DYNAMIC_REFRESH_INTERVAL_MS / 1000,
      journeyStaticRefreshIntervalSeconds: JOURNEY_STATIC_REFRESH_INTERVAL_MS / 1000,
      journeyLiveRefreshIntervalSeconds: JOURNEY_LIVE_REFRESH_INTERVAL_MS / 1000,
      journeyGraphActiveWindowSeconds: JOURNEY_GRAPH_ACTIVE_WINDOW_MS / 1000,
      journeyGraphCache: {
        memory: {
          bus: [...busJourneyNetworkCache.values()].filter((entry) => entry.network).length,
          rail: [...railJourneyNetworkCache.values()].filter((entry) => entry.network).length,
          metro: [...metroJourneyNetworkCache.values()].filter((entry) => entry.network).length
        },
        building: {
          bus: [...busJourneyNetworkCache.values()].filter((entry) => entry.pending).length,
          rail: [...railJourneyNetworkCache.values()].filter((entry) => entry.pending).length,
          metro: [...metroJourneyNetworkCache.values()].filter((entry) => entry.pending).length
        },
        disk: {
          bus: Object.keys(journeyGraphDiskCache.bus).length,
          rail: Object.keys(journeyGraphDiskCache.rail).length,
          metro: Object.keys(journeyGraphDiskCache.metro).length
        },
        savedAt: journeyGraphDiskCache.savedAt
      },
      routePlannerResultCacheSeconds: ROUTE_PLANNER_RESULT_CACHE_MS / 1000,
      routePlannerTimeoutSeconds: ROUTE_PLANNER_TIMEOUT_MS / 1000,
      journeyBookingWindowDays: JOURNEY_BOOKING_WINDOW_DAYS
    });
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/data-gov/datasets') {
    await proxyDatasetSearch(request, response);
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/admin/login') {
    await handleAdminLogin(request, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/admin/status') {
    handleAdminStatus(request, response);
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/admin/tdx') {
    await handleAdminTdxSetting(request, response);
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/admin/cwa') {
    await handleAdminCwaSetting(request, response);
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/admin/data-gov') {
    await handleAdminDataGovSetting(request, response);
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/admin/announcements') {
    await handleAdminAnnouncementPublish(request, response);
    return;
  }
  if (request.method === 'PUT' && requestUrl.pathname === '/api/admin/announcements/order') {
    await handleAdminAnnouncementOrder(request, response);
    return;
  }
  if (request.method === 'DELETE' && requestUrl.pathname.startsWith('/api/admin/announcements/')) {
    await handleAdminAnnouncementDelete(
      request,
      response,
      requestUrl.pathname.slice('/api/admin/announcements/'.length)
    );
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/admin/logout') {
    handleAdminLogout(request, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/information') {
    handlePortalInformation(response);
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
  if (request.method === 'GET' && requestUrl.pathname === '/api/tdx/journey/options') {
    await proxyJourneyOptions(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/tdx/journey/search') {
    await proxyJourneySearch(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/tdx/journey/live') {
    await proxyJourneyLive(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/route/planner') {
    await proxyRoutePlanner(requestUrl, response);
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
  response.writeHead(405, { ...corsHeaders(), Allow: 'GET, HEAD, POST, PUT, DELETE, OPTIONS' }).end('Method not allowed');
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
  console.log(`CWA emergency datasets: ${CWA_EMERGENCY_DATASET_IDS.join(', ')}`);
  console.log(`CWA weather: ${process.env.CWA_API_KEY ? 'configured' : 'missing CWA_API_KEY'}`);
  console.log(`Portal content: ${PORTAL_CONTENT_FILE}`);
  console.log(`FCM notifications: ${fcmIsConfigured() ? `configured topic ${FCM_TOPIC}` : 'missing service account'}`);
  console.log(`TDX transport: ${tdxCredentials.length ? `${tdxCredentials.length} credential pair(s); ${tdxCredentialPools.primary.length} primary; ${tdxCredentialPools.reserve.length} reserve` : 'missing TDX credentials'}`);
  console.log(`GraphHopper routing: ${graphHopperApiKeys.length ? `${graphHopperApiKeys.length} API key(s)` : 'missing GRAPHHOPPER_API_KEY_1/2'}`);
  startTdxCacheRefresh();
  startNationwideBusRefresh();
  startJourneyGraphRefresh();
  startCwaEmergencyRefresh();
});
