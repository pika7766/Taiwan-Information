# 台灣智慧生活

「台灣智慧生活」是一個以互動地圖為核心的公共資訊整合網站，將交通、天氣、防災、政府開放資料與常用生活服務集中在同一個操作介面。網站採響應式設計，可在桌機與手機瀏覽器使用，並透過 Node.js 後端集中管理外部 API、權杖與快取，避免將服務憑證暴露在前端。

## 主要功能

### 定位與互動地圖

- 啟動時先確認瀏覽器定位結果，再載入交通資訊圖層。
- 取得定位權限時，以使用者目前位置作為地圖中心。
- 拒絕定位、不支援定位、定位逾時或位置不在臺灣時，改以台北 101 為中心。
- 支援地圖縮放、拖曳、縣市切換、地點搜尋與反向地址查詢。
- 手動拖曳或縮放地圖後會等待視角穩定 5 秒才讀取該地交通資料；只有地圖中心周圍 500 公尺皆進入另一縣市服務區時才切換縣市，避免邊界附近重複讀取。
- 可標註住家、學校及工作地點，並能分享目前地圖狀態。

### 即時交通資訊

- 整合 TDX 公車即時車機、站牌、到站預估、路線站序與公車詳情。
- 後端集中維護 22 縣市及公路客運的全臺公車快照，每 12 秒啟動更新循環。
- 所有 TDX 動態資料由後端每 12 秒更新共享快取；站點、路線、時刻表、票價與設施基本資料等固定資料每 5 分鐘更新。瀏覽器只讀取本站 API，不直接呼叫 TDX。
- 點擊公車後只保留該車圖示，顯示該行駛方向的完整站序，並在每兩站間以淡色箭頭標示行進方向；關閉詳情後恢復其他公車。
- 「交通查找」可查詢公車、臺鐵、高鐵與捷運的直達或同運具轉乘方案、每段行程與 TDX 票價。
- 公車起訖站可從清單或地圖站牌選擇；進入地圖選站時會以數量群組載入所選縣市的全部公車站點。
- 臺鐵起點與終點可分別選擇縣市，站序依環島地理順序排列；高鐵由南港至左營排列。
- 「路線規劃」以起訖點直線距離、一般速度、道路繞行、候車時間及尖峰時段係數，快速比較汽車、機車、公車、臺鐵、捷運、高鐵、步行與自行車的大致總時間，不在本站建立完整路線。
- 汽車、機車、步行與自行車固定納入估算，介面可另外勾選公車、臺鐵、高鐵與捷運。結果每種方式顯示一筆概略時間，不顯示逐段路線、沿途站點或票價。
- 每種交通方式都提供已帶入目前起訖點的 Google 地圖導航；Apple 裝置另外顯示 Apple 地圖導航。實際路線、班次與抵達時間以外部導航服務為準。
- 路線規劃的起點與終點可直接輸入、選擇目前位置／我的最愛，或開啟主地圖後拖曳中心圖標選定位置。
- 每筆公車、臺鐵、高鐵與捷運方案都可在主地圖預覽路線，轉乘站以專用標記顯示；行駛中的單一班次另可進入追蹤模式。
- 路線預覽或追蹤時會中止瀏覽器的一般交通圖層請求並隱藏其他圖層，結束後精確還原進入前的圖層開關。
- 旅運站點、時刻表及票價由後端每 5 分鐘更新共用快取；官方即時看板每 12 秒更新共用快取。
- TDX 採單一憑證模式，所有交通資料使用同一組 `TDX_CLIENT_ID` 與 `TDX_CLIENT_SECRET`；憑證遇到 `429` 限流時，伺服器會進入 FIFO 隊列暫停機制，並在冷卻期後恢復，期間回傳伺服器快取資料降級服務。
- 單一來源更新失敗時保留上一次成功資料，不會清空既有公車圖層。
- 全臺快照儲存在記憶體與 JSON 檔案；地圖端只下載目前視窗附近的公車，降低手機渲染負擔。
- 即時路況功能目前暫不開放，敬請見諒。
- 顯示 YouBike 站點、可借車輛、可還空位及服務狀態。
- 顯示 TDX 路外停車場、剩餘車位、總車位、地址、費率與營運狀態。
- 公車站牌與 YouBike 站點可收藏。

### 管理員控制

- 服務選單提供管理員登入，預設帳號為 `admin`、密碼為 `7766`。
- 登入狀態使用伺服器端 session 與 HttpOnly Cookie，不會將密碼或 session 寫入瀏覽器儲存空間。
- 管理員可分別啟用或停用 TDX 運輸資訊、中央氣象署及政府資料開放平臺資料取得；TDX 停用期間仍保留既有伺服器快取。
- 三個資料取得開關、公告內容及公告順序都寫入 `PORTAL_CONTENT_FILE`，管理員關閉 App、重新登入或伺服器重新啟動後仍會保留。
- 管理員可填寫分類、重要程度、發布單位、標題、摘要與詳細內容，預覽並確認後新增公告，也可刪除公告或調整所有裝置看到的順序。

### 生活與公共資訊

- 串接中央氣象署開放資料，顯示所在地天氣資訊。
- 整合政府資料開放平臺，可依縣市、行政區與生活分類查詢資料集。
- 提供安全、防災及地方生活資訊。
- 服務選單集中顯示永久保存的系統公告與中央氣象署緊急資訊，包含地震、颱風海陸警報、龍捲風、土石流與淹水警報，並可收合或展開完整歷史。
- 內建 15 類、60 個常用網站連結，涵蓋政府服務、交通、新聞、購物、學習、求職、社群及 AI 工具。

### 手機與操作體驗

- 支援桌機、一般手機及 `320px` 窄螢幕。
- 手機版服務選單、地方資訊面板及相關連結視窗皆可獨立捲動。
- 頁首提供附實際操作圖片的使用教學，涵蓋定位搜尋、交通圖層、公車路線與地方服務。
- 互動控制提供焦點樣式、ARIA 標籤與鍵盤關閉操作。
- 大量 YouBike 與停車場站點使用 Marker Cluster，交通資料依地圖視窗範圍載入。
- Android 與 iOS App 透過 FCM Topic 接收新系統公告及 CWA 緊急資訊，背景或關閉畫面時由作業系統顯示原生通知；一般網頁只顯示資訊，不要求或發送系統通知。

## 使用技術

| 類型 | 技術 |
| --- | --- |
| 前端 | HTML5、CSS、Vanilla JavaScript、Tailwind CSS CDN |
| 地圖 | Leaflet、Leaflet MarkerCluster、OpenStreetMap |
| 後端 | Node.js 20+、Node.js 原生 `http` 模組 |
| 交通資料 | 交通部 TDX API |
| 天氣資料 | 中央氣象署開放資料 API |
| 政府資料 | 政府資料開放平臺 API |
| 地理編碼 | OpenStreetMap Nominatim |
| 部署 | Render Web Service、GitHub 自動部署 |
| 儲存 | 記憶體快取、JSON 磁碟快照、Render Persistent Disk（選用） |

## 運作方式

1. 前端建立 Leaflet 地圖，但不立即請求交通圖層。
2. 瀏覽器完成定位判定後，選擇使用者位置或台北 101。
3. 設定檔與定位皆完成後，前端向同網域的 Node.js API 請求圖層資料。
4. 後端代理 CWA、TDX、data.gov.tw 及 Nominatim，並統一處理快取與錯誤。道路線形與即時路況功能目前暫不開放。
5. 後端每 12 秒更新所有 TDX 動態資料，每 5 分鐘更新所有 TDX 固定資料，所有使用者讀取同一份共享快取。
6. 最近使用的公車、捷運與鐵路資料會建立路線圖並存入記憶體及 JSON 快照；路線圖到期時由背景排程更新，查詢仍先使用目前版本。
7. TDX 採單一憑證 + FIFO 隊列模式；憑證遇到 `429` 限流時，伺服器進入暫停機制，期間回傳伺服器快取資料降級服務，冷卻後自動恢復。
8. 外部服務失敗時保留既有快取，讓地圖與其他功能仍可繼續使用。
9. 伺服器每分鐘集中取得全臺 CWA 緊急資訊，以穩定雜湊 ID 去重後寫入內容檔；使用者裝置只讀本站 API。

TDX 官方 Swagger 顯示，市區公車、YouBike、縣市停車場只提供 `City/{City}` 端點，沒有全臺單一請求端點。系統因此採用「每縣市一次取得完整資料、伺服器共享快取」；同一縣市不會因使用者數量或地圖移動重複請求。若固定掃描 22 縣市，單次週期反而會產生上百次 TDX 請求，因此不採用全臺強制預抓。全臺公車動態則維持既有的伺服器彙整快照。

### 路線規劃架構

網站介面的路線規劃只在地點解析完成後，以瀏覽器端公式產生各交通方式的概略總時間，不會呼叫 `/api/route/planner`、GraphHopper 或 TDX 路線圖。這可避免完整大眾運輸轉乘搜尋造成的長時間等待，也不會消耗 TDX 與 GraphHopper 路由額度。

Google 地圖與 Apple 地圖連結會帶入解析後的起點與終點；真正的道路、班次、交通狀況與導航由使用者選擇的地圖服務計算。後端 `/api/route/planner` 目前仍保留供相容用途及獨立 API 呼叫，但網站介面不會使用。

## 資料來源與限制

- 公車、YouBike、停車場與道路即時資料由 TDX 提供，實際更新速度與完整度受 TDX 方案額度及來源品質影響。
- 臺鐵追蹤顯示 TDX 最近離開或經過的車站，不是連續 GPS；高鐵沒有逐車 GPS，位置依時刻表推估。
- 多數捷運系統沒有可識別單一班次的車輛位置，追蹤位置依時刻表與站間時間推估；高雄輕軌有官方位置時優先顯示。
- 天氣資料由中央氣象署提供；地址查詢依賴 Nominatim。道路線形與即時路況功能目前暫不開放。
- Render 免費方案可能會休眠，服務重新喚醒時第一個請求需要較長時間。
- 未掛載 Persistent Disk 時，Render 重新部署或重建執行個體後會重新建立公車快照與旅運路線圖。
- 瀏覽器定位及系統分享功能需要 HTTPS、瀏覽器支援與使用者授權。
- 推播後端只呼叫 FCM HTTP v1 API。iOS 的 FCM 最終仍由 Firebase 經 Apple 推播通道送達，因此 Firebase Console 必須設定 APNs Auth Key；專案伺服器不會直接呼叫 APNs。

## 本機執行

需求：Node.js 20 或更新版本。

1. 將 `credentials-template.txt` 複製為 `.env`，填入 CWA 與 TDX 憑證。
2. 執行 `npm start`。
3. 開啟 `http://127.0.0.1:4174/`。

## Render 部署

1. 將專案推送至 GitHub Repository。
2. 在 Render 建立 Web Service 並連接該 Repository。
3. Build Command 使用 `npm install`，Start Command 使用 `npm start`。
4. Health Check Path 可設定為 `/api/status`。
5. 在 Render Environment 設定下列變數。

| 環境變數 | 必要 | 用途 |
| --- | --- | --- |
| `CWA_API_KEY` | 是 | 中央氣象署 API 憑證 |
| `CWA_FETCH_ENABLED` | 否 | 服務啟動時是否允許取得中央氣象署資料，預設 `true` |
| `CWA_EMERGENCY_DATASET_IDS` | 否 | 全臺緊急資訊資料集 ID，預設 `W-C0033-001,E-A0015-001`；可加入 CWA 另行授權的土石流、淹水等資料集 |
| `CWA_EMERGENCY_REFRESH_INTERVAL_MS` | 否 | 伺服器緊急資訊輪詢間隔，預設及最短皆為 `60000` 毫秒 |
| `DATA_GOV_FETCH_ENABLED` | 否 | 服務啟動時是否允許取得政府資料開放平臺資料，預設 `true` |
| `ADMIN_USERNAME` | 否 | 管理員帳號，預設 `admin` |
| `ADMIN_PASSWORD` | 否 | 管理員密碼，預設 `7766`；正式環境建議覆寫 |
| `TDX_FETCH_ENABLED` | 否 | 服務啟動時是否允許取得 TDX，預設 `true` |
| `TDX_CLIENT_ID` | 是 | TDX OAuth 用戶端 ID（單一憑證） |
| `TDX_CLIENT_SECRET` | 是 | 對應的 TDX 用戶端密鑰（單一憑證） |
| `GRAPHHOPPER_API_KEY_1`、`GRAPHHOPPER_API_KEY_2` | 否 | 僅直接呼叫後端 `/api/route/planner` 道路方案時需要；網站時間估算不使用。第一組限流或失效時自動切換第二組 |
| `TDX_REFRESH_INTERVAL_MS` | 否 | TDX 共用快取背景排程間隔，預設 `5000` 毫秒 |
| `TDX_DYNAMIC_REFRESH_INTERVAL_MS` | 否 | 所有 TDX 動態資料更新間隔，預設 `12000` 毫秒 |
| `TDX_STATIC_REFRESH_INTERVAL_MS` | 否 | 所有 TDX 固定資料更新間隔，預設 `300000` 毫秒 |
| `JOURNEY_GRAPH_CACHE_FILE` | 否 | 預處理公車／捷運／鐵路路線圖快照路徑；Render 建議使用 `/var/data/journey_graph_cache.json` |
| `JOURNEY_GRAPH_MAX_STALE_MS` | 否 | 服務重啟時可載入的路線圖快照最長時間，預設 `86400000` 毫秒（24 小時） |
| `JOURNEY_GRAPH_ACTIVE_WINDOW_MS` | 否 | 最近多久曾使用的路線圖會由背景排程持續更新，預設 `1800000` 毫秒（30 分鐘） |
| `GRAPHHOPPER_API_ROOT` | 否 | GraphHopper 路由端點，預設 `https://graphhopper.com/api/1/route` |
| `GRAPHHOPPER_RATE_LIMIT_COOLDOWN_MS` | 否 | GraphHopper key 被限流或拒絕後的停用時間，預設 `900000` 毫秒 |
| `ROUTING_CACHE_MS` | 否 | 汽車、機車、步行與自行車路線快取時間，預設 `300000` 毫秒 |
| `ROUTE_PLANNER_RESULT_CACHE_MS` | 否 | 完整路線規劃結果快取時間，預設與動態資料更新週期相同（`12000` 毫秒） |
| `ROUTE_PLANNER_TIMEOUT_MS` | 否 | 單次路線規劃硬性計算上限，預設 `20000` 毫秒，最高 `25000` 毫秒；時間到會先回傳已完成方案 |
| `JOURNEY_FARE_INITIAL_WAIT_MS` | 否 | 冷快取首次規劃等待鐵路票價的時間，預設 `1500` 毫秒；逾時會先回傳班表路線並在背景補齊票價快取 |
| `CWA_DATASET_IDS` | 否 | CWA 備援資料集 ID，以逗號分隔 |
| `BUS_REALTIME_CACHE_FILE` | 否 | 全臺公車快照儲存路徑 |
| `PORTAL_CONTENT_FILE` | 正式環境建議 | 系統公告與永久緊急資訊檔案；Render Persistent Disk 建議設為 `/var/data/portal-content.json` |
| `FCM_SERVICE_ACCOUNT_FILE` | App 推播必要 | Firebase Admin SDK 服務帳戶 JSON 的 Render Secret File 路徑，建議 `/etc/secrets/firebase-service-account.json` |
| `FCM_SERVICE_ACCOUNT_JSON_BASE64` | 替代方案 | 未使用 Secret File 時可填服務帳戶 JSON 的 Base64；不可提交 GitHub |
| `FCM_PROJECT_ID` | 否 | Firebase Project ID；未設定時從服務帳戶 JSON 的 `project_id` 讀取 |
| `FCM_TOPIC` | 否 | App 自動訂閱的通知主題，預設 `taiwan-smart-life-information` |

Render 會自動提供 `PORT`，伺服器已監聽 `0.0.0.0`，不需要手動指定連接埠。若使用 Render Persistent Disk，建議掛載至 `/var/data`，並設定 `BUS_REALTIME_CACHE_FILE=/var/data/bus_realtime_cache.json`、`JOURNEY_GRAPH_CACHE_FILE=/var/data/journey_graph_cache.json` 及 `PORTAL_CONTENT_FILE=/var/data/portal-content.json`。公告、公告順序與三個管理員資料開關要在重新部署後仍保留，必須設定 `PORTAL_CONTENT_FILE` 並掛載 Persistent Disk。

FCM 建議在 Render 的 **Secret Files** 新增 Firebase 服務帳戶 JSON，檔名使用 `firebase-service-account.json`，再設定 `FCM_SERVICE_ACCOUNT_FILE=/etc/secrets/firebase-service-account.json`。Android 的 `google-services.json` 與 iOS 的 `GoogleService-Info.plist` 是 App 端設定，不能拿來取代伺服器服務帳戶，也不要填進 Render 環境變數。

需在 Render 的 Environment 頁面分別新增以下 Key；Value 填入各組實際帳號與密鑰：

```text
TDX_CLIENT_ID
TDX_CLIENT_SECRET
GRAPHHOPPER_API_KEY_1
GRAPHHOPPER_API_KEY_2
```

每一組 TDX ID 與 Secret 成對設定，系統僅使用單一憑證組合。舊的 `TDX_SHARED_CLIENT_ID`、`TDX_SHARED_CLIENT_SECRET`、`TDX_CREDENTIALS_JSON` 與 `TDX_CLIENT_ID_1` 至 `TDX_CLIENT_ID_8` 已不再使用，可從 Render 移除。

GraphHopper 的兩組 key 分別填入 `GRAPHHOPPER_API_KEY_1` 與 `GRAPHHOPPER_API_KEY_2`。金鑰只由 Node.js 後端送往 GraphHopper，不會出現在瀏覽器回應或前端程式碼。不要把實際 TDX 帳密或 GraphHopper key 寫入 GitHub、`README.md` 或 `credentials-template.txt`。

更新間隔已有正確預設值；除非要覆寫，不必在 Render 設定 `TDX_REFRESH_INTERVAL_MS`、`TDX_DYNAMIC_REFRESH_INTERVAL_MS` 或 `TDX_STATIC_REFRESH_INTERVAL_MS`。舊版的 `BUS_REFRESH_INTERVAL_MS`、`TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS`、`JOURNEY_STATIC_REFRESH_INTERVAL_MS` 與 `JOURNEY_LIVE_REFRESH_INTERVAL_MS` 已不再使用，可從 Render 環境變數移除。

## API 與安全性

- `GET /api/status`：檢查服務及環境變數設定狀態，不回傳憑證內容。
- `POST /api/admin/login`：建立管理員 session。
- `GET /api/admin/status`：取得 TDX、中央氣象署、政府資料開放平臺開關、可用憑證與快取狀態，需管理員 session。
- `POST /api/admin/tdx`：以 `{ "enabled": true|false }` 控制 TDX 資料取得，需管理員 session。
- `POST /api/admin/cwa`：以 `{ "enabled": true|false }` 控制中央氣象署資料取得，需管理員 session。
- `POST /api/admin/data-gov`：以 `{ "enabled": true|false }` 控制政府資料開放平臺資料取得，需管理員 session。
- `POST /api/admin/announcements`：發布已預覽確認的純文字系統公告，需管理員 session。
- `PUT /api/admin/announcements/order`：儲存所有公告 ID 的顯示順序，需管理員 session。
- `DELETE /api/admin/announcements/{id}`：永久刪除指定公告，需管理員 session。
- `POST /api/admin/logout`：登出並清除管理員 session。
- `GET /api/information`：取得所有系統公告、永久緊急資訊及 CWA 開關狀態；網頁與原生 App 共用。
- `GET /api/tdx/bus?scope=all`：取得目前已儲存的全臺公車快照。
- `GET /api/tdx/parking?lat=25.033&lng=121.5654&city=Taipei&radius=5000`：取得附近停車場與剩餘車位。
- `GET /api/tdx/journey/options`：依運具及縣市／捷運系統取得可選站點。
- `GET /api/tdx/journey/search`：依起訖站及搭乘時間取得班次與票價。
- `GET /api/tdx/journey/live`：取得所選行駛中班次的官方即時資料或清楚標示的推估位置。
- `GET /api/route/planner`：依起訖座標、時間與勾選運具取得道路或大眾運輸方案；`strategy=prepare` 預載交通索引並回傳基本方案，`strategy=multimodal` 只計算完整跨運具方案，`strategy=direct` 只取基本方案，預設 `strategy=all` 保留相容的一次性完整規劃。
- `/api/status` 只回傳 TDX 憑證總數及目前可用組數，不會回傳帳號、密鑰或 token。
- 地圖使用的交通 API 支援座標與範圍過濾，避免傳輸不必要的大量資料。
- 靜態伺服器採公開檔案白名單，`.env`、`server.js`、日誌及憑證範本無法透過 HTTP 下載。
- `.env`、執行日誌及公車即時快照均已列入 `.gitignore`，不會上傳到 GitHub。
