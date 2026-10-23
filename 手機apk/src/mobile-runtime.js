import { App } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Geolocation } from '@capacitor/geolocation';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

const mobile = Object.assign(window.__TAIWAN_SMART_LIFE_MOBILE__ || {}, {
  platform: Capacitor.getPlatform(),
  native: Capacitor.isNativePlatform()
});
window.__TAIWAN_SMART_LIFE_MOBILE__ = mobile;
const DEFAULT_FCM_TOPIC = 'taiwan-smart-life-information';
const FIRST_RUN_PERMISSIONS_KEY = 'taiwan-smart-life-first-run-permissions-v1';
const DISASTER_ALERTS_POLL_MS = 60_000;
let appIsActive = true;
let messagingSetupPromise = null;
let disasterPollingTimer = null;
let disasterTopic = null;
let locationWatchId = null;
let disasterPollPromise = null;

function notifiedDisasterIds() {
  try {
    const values = JSON.parse(localStorage.getItem('taiwan-smart-life-notified-disasters') || '[]');
    return new Set(Array.isArray(values) ? values.map(String) : []);
  } catch (error) {
    console.warn('災情通知紀錄讀取失敗：', error);
    return new Set();
  }
}

function rememberDisasterNotification(id) {
  const notified = notifiedDisasterIds();
  notified.add(String(id));
  localStorage.setItem('taiwan-smart-life-notified-disasters', JSON.stringify([...notified].slice(-300)));
}

function scheduleDisasterNotification(alert) {
  if (!alert?.id || notifiedDisasterIds().has(String(alert.id))) return;
  rememberDisasterNotification(alert.id);
  LocalNotifications.schedule({ notifications: [{
    id: notificationId(alert.id),
    title: alert.title || '中央氣象署災害警報',
    body: alert.summary || alert.details || '目前定位區域收到氣象警報，請開啟 App 查看詳情。',
    channelId: 'portal-information',
    extra: { type: 'emergency', section: 'emergencies', itemId: String(alert.id) }
  }] }).catch((error) => console.error('災害通知排程失敗：', error));
}

function notificationId(value) {
  let hash = 2166136261;
  for (const character of String(value || Date.now())) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 2147483000) + 1;
}

function revealInformationSection(section = 'announcements') {
  const normalized = section === 'emergencies' ? 'emergencies' : 'announcements';
  const drawer = document.getElementById('service-drawer');
  if (drawer?.classList.contains('-translate-x-full')) document.getElementById('menu-button')?.click();
  const toggle = document.getElementById(`${normalized}-toggle`);
  if (toggle?.getAttribute('aria-expanded') !== 'true') toggle?.click();
  window.setTimeout(() => document.getElementById(`${normalized}-title`)?.scrollIntoView({ block: 'start' }), 250);
}

function handleNotificationOpen(data = {}) {
  mobile.pendingInformationSection = data.section || (data.type === 'emergency' ? 'emergencies' : 'announcements');
  if (document.readyState !== 'loading') revealInformationSection(mobile.pendingInformationSection);
}

async function serverFcmTopic() {
  try {
    const apiBaseUrl = String(mobile.apiBaseUrl || '').replace(/\/$/, '');
    const response = await fetch(`${apiBaseUrl}/api/information`, { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    if (response.ok && payload?.fcmTopic) return String(payload.fcmTopic);
  } catch (error) {
    console.warn('FCM 主題設定讀取失敗，使用預設值：', error);
  }
  return DEFAULT_FCM_TOPIC;
}

async function refreshLocationDisasterAlerts(position) {
  if (!position || !appIsActive || disasterPollPromise) return;
  disasterPollPromise = (async () => {
    const apiBaseUrl = String(mobile.apiBaseUrl || '').replace(/\/$/, '');
    const endpoint = new URL(`${apiBaseUrl}/api/hazards`);
    endpoint.searchParams.set('lat', String(position.coords.latitude));
    endpoint.searchParams.set('lng', String(position.coords.longitude));
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.message || `災害警報 API 回應 HTTP ${response.status}`);
    }
    if (mobile.notificationPermission === 'granted' && payload.data?.topic) {
      if (disasterTopic && disasterTopic !== payload.data.topic) {
        await FirebaseMessaging.unsubscribeFromTopic({ topic: disasterTopic });
      }
      if (disasterTopic !== payload.data.topic) {
        await FirebaseMessaging.subscribeToTopic({ topic: payload.data.topic });
        disasterTopic = payload.data.topic;
      }
      (payload.data.alerts || []).forEach(scheduleDisasterNotification);
    }
    return payload.data;
  })().catch((error) => {
    console.warn('目前定位區域災害資訊更新失敗：', error);
    return null;
  }).finally(() => {
    disasterPollPromise = null;
  });
  return disasterPollPromise;
}

function acceptDisasterPosition(position) {
  mobile.lastLocation = position;
  refreshLocationDisasterAlerts(position).catch((error) => {
    console.error('定位區域災害通知更新失敗：', error);
  });
}

async function startLocationMonitoring({ requestPermission = false } = {}) {
  try {
    let permission = await Geolocation.checkPermissions();
    if (requestPermission && permission.location !== 'granted') {
      permission = await Geolocation.requestPermissions({ permissions: ['location'] });
    }
    mobile.locationPermission = permission.location;
    if (permission.location !== 'granted') return false;
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000
    });
    acceptDisasterPosition(position);
    if (locationWatchId === null) {
      locationWatchId = await Geolocation.watchPosition({
        enableHighAccuracy: false, timeout: 30_000, maximumAge: 60_000, minimumUpdateInterval: 120_000
      }, (nextPosition, error) => {
        if (error) {
          console.warn('定位區域監看失敗：', error);
          return;
        }
        if (nextPosition) acceptDisasterPosition(nextPosition);
      });
    }
    return true;
  } catch (error) {
    console.warn('定位權限或位置讀取失敗：', error);
    mobile.locationPermission = 'denied';
    return false;
  }
}

function startDisasterAlertPolling() {
  window.clearInterval(disasterPollingTimer);
  if (!appIsActive || !mobile.lastLocation) return;
  refreshLocationDisasterAlerts(mobile.lastLocation).catch((error) => {
    console.error('災害警報輪詢失敗：', error);
  });
  disasterPollingTimer = window.setInterval(() => {
    if (appIsActive && mobile.lastLocation) {
      refreshLocationDisasterAlerts(mobile.lastLocation).catch((error) => {
        console.error('災害警報輪詢失敗：', error);
      });
    }
  }, DISASTER_ALERTS_POLL_MS);
}

function renderNativeNotificationState(message, state = 'idle', busy = false) {
  if (!mobile.native) return;
  const control = document.getElementById('native-notification-control');
  const status = document.getElementById('native-notification-status');
  const button = document.getElementById('native-notification-button');
  if (!control || !status || !button) return;
  control.classList.remove('hidden');
  control.classList.add('flex');
  status.textContent = message;
  status.classList.toggle('text-emerald-700', state === 'enabled');
  status.classList.toggle('text-red-700', state === 'error');
  status.classList.toggle('text-slate-600', state !== 'enabled' && state !== 'error');
  button.disabled = busy;
  button.classList.toggle('hidden', state === 'enabled');
  button.textContent = busy ? '設定中...' : state === 'error' ? '重新設定' : '開啟通知';
}

async function initializeFirebaseMessaging({ requestPermission = true } = {}) {
  if (messagingSetupPromise) return messagingSetupPromise;
  messagingSetupPromise = (async () => {
    const support = await FirebaseMessaging.isSupported();
    if (!support.isSupported) {
      renderNativeNotificationState('此裝置不支援推播通知', 'error');
      return false;
    }
    let permission = await FirebaseMessaging.checkPermissions();
    if (requestPermission && permission.receive !== 'granted') {
      permission = await FirebaseMessaging.requestPermissions();
    }
    mobile.notificationPermission = permission.receive;
    if (permission.receive !== 'granted') {
      renderNativeNotificationState('尚未允許系統通知', 'error');
      return false;
    }
    renderNativeNotificationState('正在連線 Firebase', 'idle', true);
    if (mobile.platform === 'android') {
      await FirebaseMessaging.createChannel({
        id: 'portal-information',
        name: '系統公告與緊急資訊',
        description: '台灣智慧生活的系統公告與中央氣象署緊急資訊',
        importance: 4,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#0f766e'
      });
    }
    await FirebaseMessaging.getToken();
    const topic = await serverFcmTopic();
    await FirebaseMessaging.subscribeToTopic({ topic });
    mobile.fcmTopic = topic;
    renderNativeNotificationState('系統通知已開啟', 'enabled');
    return true;
  })().catch((error) => {
    console.warn('FCM 通知設定失敗：', error);
    renderNativeNotificationState(`通知設定失敗：${error?.message || '請稍後再試'}`, 'error');
    return false;
  });
  return messagingSetupPromise;
}

mobile.initializeNotifications = initializeFirebaseMessaging;

function installNativeNotificationControl() {
  if (!mobile.native) return;
  renderNativeNotificationState('正在檢查通知狀態', 'idle', true);
  document.getElementById('native-notification-button')?.addEventListener('click', async () => {
    messagingSetupPromise = null;
    renderNativeNotificationState('正在設定系統通知', 'idle', true);
    const enabled = await initializeFirebaseMessaging({ requestPermission: true });
    if (!enabled && mobile.notificationPermission === 'denied') {
      window.alert('通知權限已被關閉，請到手機的「設定 > 應用程式 > 台灣智慧生活 > 通知」開啟權限。');
    }
  });
}

FirebaseMessaging.addListener('tokenReceived', () => {
  serverFcmTopic().then((topic) => FirebaseMessaging.subscribeToTopic({ topic }))
    .catch((error) => console.warn('FCM 主題重新訂閱失敗：', error));
});

FirebaseMessaging.addListener('notificationReceived', async ({ notification }) => {
  if (notification.data?.itemId) rememberDisasterNotification(notification.data.itemId);
  if (mobile.platform !== 'android' || !appIsActive) return;
  await LocalNotifications.schedule({ notifications: [{
    id: notificationId(notification.id || notification.data?.itemId),
    title: notification.title || '台灣智慧生活',
    body: notification.body || '收到新的資訊',
    channelId: 'portal-information',
    extra: notification.data || {}
  }] });
});

FirebaseMessaging.addListener('notificationActionPerformed', ({ notification }) => {
  handleNotificationOpen(notification?.data || {});
});

LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
  handleNotificationOpen(notification?.extra || {});
});

mobile.share = async (data) => Share.share({
  title: data?.title || '台灣智慧生活',
  text: data?.text || '',
  url: data?.url || mobile.shareBaseUrl
});

mobile.openExternal = async (url) => {
  try {
    await AppLauncher.openUrl({ url });
  } catch (error) {
    await Browser.open({ url });
  }
};

function installNativeGeolocation() {
  const browserGeolocation = navigator.geolocation;
  const adapter = {
    getCurrentPosition(success, failure, options = {}) {
      Geolocation.getCurrentPosition({
        enableHighAccuracy: options.enableHighAccuracy !== false,
        timeout: options.timeout || 10000,
        maximumAge: options.maximumAge || 60000
      }).then(success).catch(failure);
    },
    watchPosition: browserGeolocation?.watchPosition?.bind(browserGeolocation),
    clearWatch: browserGeolocation?.clearWatch?.bind(browserGeolocation)
  };
  try {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: adapter });
  } catch (error) {
    if (browserGeolocation) browserGeolocation.getCurrentPosition = adapter.getCurrentPosition;
  }
}

function closeTopSurface() {
  const closeTargets = [
    ['admin-modal', 'close-admin-button'],
    ['journey-modal', 'close-journey-button'],
    ['tutorial-modal', 'close-tutorial-button'],
    ['related-links-modal', 'close-related-links-button'],
    ['category-modal', 'close-modal-button']
  ];
  for (const [surfaceId, buttonId] of closeTargets) {
    const surface = document.getElementById(surfaceId);
    if (surface && !surface.classList.contains('hidden')) {
      document.getElementById(buttonId)?.click();
      return true;
    }
  }
  const drawer = document.getElementById('service-drawer');
  if (drawer && !drawer.classList.contains('-translate-x-full')) {
    document.getElementById('close-menu-button')?.click();
    return true;
  }
  const panel = document.getElementById('info-panel');
  if (panel && !panel.classList.contains('translate-y-full')) {
    document.getElementById('close-info-button')?.click();
    return true;
  }
  return false;
}

document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href]');
  if (!link || link.getAttribute('href')?.startsWith('#')) return;
  let url;
  try {
    url = new URL(link.href, window.location.href);
  } catch (error) {
    return;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return;
  event.preventDefault();
  mobile.openExternal(url.toString()).catch((error) => console.error('外部連結開啟失敗：', error));
});

window.addEventListener('DOMContentLoaded', async () => {
  document.documentElement.classList.add('capacitor-app');
  installNativeNotificationControl();
  installNativeGeolocation();
  const nativeWindowTasks = [
    StatusBar.setOverlaysWebView({ overlay: true }),
    StatusBar.setStyle({ style: Style.Light })
  ];
  if (mobile.platform === 'android') nativeWindowTasks.push(StatusBar.setBackgroundColor({ color: '#0f766e' }));
  if (mobile.platform === 'ios') nativeWindowTasks.push(Keyboard.setResizeMode({ mode: KeyboardResize.Native }));
  await Promise.allSettled(nativeWindowTasks);
  const firstRun = localStorage.getItem(FIRST_RUN_PERMISSIONS_KEY) !== 'complete';
  if (firstRun) {
    await initializeFirebaseMessaging({ requestPermission: true });
    await startLocationMonitoring({ requestPermission: true });
    localStorage.setItem(FIRST_RUN_PERMISSIONS_KEY, 'complete');
  } else {
    initializeFirebaseMessaging();
    await startLocationMonitoring();
  }
  startDisasterAlertPolling();
  if (mobile.pendingInformationSection) revealInformationSection(mobile.pendingInformationSection);
  window.setTimeout(() => SplashScreen.hide().catch(() => undefined), 450);
});

App.addListener('backButton', ({ canGoBack }) => {
  if (closeTopSurface()) return;
  if (canGoBack) window.history.back();
  else App.minimizeApp();
});

App.addListener('appStateChange', ({ isActive }) => {
  appIsActive = isActive;
  if (isActive) {
    window.dispatchEvent(new Event('resize'));
    messagingSetupPromise = null;
    initializeFirebaseMessaging();
    startLocationMonitoring().then(startDisasterAlertPolling);
  } else {
    window.clearInterval(disasterPollingTimer);
  }
});
