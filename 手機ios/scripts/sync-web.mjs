import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webSourceDir = path.resolve(projectDir, '..');
const webDir = path.join(projectDir, 'www');
const copiedFiles = [
  'api_config.json', 'leaflet.css', 'leaflet.js', 'leaflet.markercluster.js',
  'MarkerCluster.css', 'MarkerCluster.Default.css'
];

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });
await Promise.all(copiedFiles.map((file) => cp(path.join(webSourceDir, file), path.join(webDir, file))));
await cp(path.join(webSourceDir, 'images'), path.join(webDir, 'images'), { recursive: true });

let html = await readFile(path.join(webSourceDir, 'index.html'), 'utf8');
const replacements = [
  [
    '<meta name="theme-color" content="#0f766e">',
    '<meta name="theme-color" content="#0f766e">\n  <meta name="mobile-web-app-capable" content="yes">\n  <meta name="apple-mobile-web-app-capable" content="yes">\n  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n  <link rel="icon" href="app-icon.png">\n  <script src="mobile-config.js"></script>\n  <script type="module" src="mobile-runtime.js"></script>'
  ],
  [
    'const API_BASE_URL = window.location.origin;',
    "const API_BASE_URL = window.__TAIWAN_SMART_LIFE_MOBILE__?.apiBaseUrl || window.location.origin;"
  ],
  [
    'const url = new URL(window.location.href);',
    'const url = new URL(window.__TAIWAN_SMART_LIFE_MOBILE__?.shareBaseUrl || window.location.href);'
  ],
  [
    'if (navigator.share) await navigator.share(shareData);',
    'if (window.__TAIWAN_SMART_LIFE_MOBILE__?.share) await window.__TAIWAN_SMART_LIFE_MOBILE__.share(shareData);\n        else if (navigator.share) await navigator.share(shareData);'
  ],
  [
    '</style>',
    `  html.capacitor-app body { overscroll-behavior: none; }\n    html.capacitor-app input, html.capacitor-app textarea, html.capacitor-app select { -webkit-user-select: text; user-select: text; font-size: 16px; }\n    html.capacitor-app header { padding-top: max(0.75rem, env(safe-area-inset-top)); }\n    html.capacitor-app #service-drawer { padding-top: env(safe-area-inset-top); }\n    @media (max-width: 639px) {\n      html.capacitor-app #map .leaflet-top { top: calc(126px + env(safe-area-inset-top)); }\n      html.capacitor-app #request-message, html.capacitor-app #journey-map-pick-banner { top: calc(8.25rem + env(safe-area-inset-top)); }\n      html.capacitor-app #journey-card, html.capacitor-app #tutorial-card { max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 1rem); }\n    }\n  </style>`
  ]
];
for (const [from, to] of replacements) {
  if (!html.includes(from)) throw new Error(`無法同步手機版 index.html，找不到：${from.slice(0, 80)}`);
  html = html.replace(from, to);
}
const tailwindCdnPattern = /\s*<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s*<script>\s*tailwind\.config = \{[\s\S]*?\n\s*};\s*<\/script>/;
if (!tailwindCdnPattern.test(html)) throw new Error('無法移除 Tailwind CDN 設定。');
html = html.replace(tailwindCdnPattern, '\n  <link rel="stylesheet" href="mobile-tailwind.css">');
await writeFile(path.join(webDir, 'index.html'), html);
await writeFile(path.join(webDir, 'mobile-config.js'), `window.__TAIWAN_SMART_LIFE_MOBILE__ = {\n  apiBaseUrl: 'https://taiwan-information.onrender.com',\n  shareBaseUrl: 'https://taiwan-information.onrender.com/'\n};\n`);
