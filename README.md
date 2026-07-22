# 台灣智慧生活資訊門戶

「台灣智慧生活資訊門戶」是一個以互動地圖為核心的公共資訊整合網站，將交通、天氣、防災、政府開放資料與常用生活服務集中在同一個操作介面。網站採響應式設計，可在桌機與手機瀏覽器使用，並透過 Node.js 後端集中管理外部 API、權杖與快取，避免將服務憑證暴露在前端。

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
- 公車動態由後端每 12 秒更新共享快取；路況、YouBike 與停車場每 5 分鐘更新，瀏覽器只讀取本站 API，不直接呼叫 TDX。
- 點擊公車後會顯示該行駛方向的完整站序，並在每兩站間以淡色箭頭標示行進方向。
- 支援多組 TDX 憑證；單組遇到 `429` 時自動切換下一組，全部額度用盡才回傳「請求過多，請稍後再試」。
- 單一來源更新失敗時保留上一次成功資料，不會清空既有公車圖層。
- 全臺快照儲存在記憶體與 JSON 檔案；地圖端只下載目前視窗附近的公車，降低手機渲染負擔。
- 顯示 TDX 道路即時路況、道路速率及壅塞狀態。
- 顯示 YouBike 站點、可借車輛、可還空位及服務狀態。
- 顯示 TDX 路外停車場、剩餘車位、總車位、地址、費率與營運狀態。
- 公車站牌與 YouBike 站點可收藏，並可使用瀏覽器通知追蹤交通狀態。

### 管理員控制

- 服務選單提供管理員登入，預設帳號為 `admin`、密碼為 `7766`。
- 登入狀態使用伺服器端 session 與 HttpOnly Cookie，不會將密碼或 session 寫入瀏覽器儲存空間。
- 管理員可分別啟用或停用 TDX 運輸資訊、中央氣象署及政府資料開放平臺資料取得；TDX 停用期間仍保留既有伺服器快取。

### 生活與公共資訊

- 串接中央氣象署開放資料，顯示所在地天氣資訊。
- 整合政府資料開放平臺，可依縣市、行政區與生活分類查詢資料集。
- 提供安全、防災及地方生活資訊。
- 內建 15 類、60 個常用網站連結，涵蓋政府服務、交通、新聞、購物、學習、求職、社群及 AI 工具。

### 手機與操作體驗

- 支援桌機、一般手機及 `320px` 窄螢幕。
- 手機版服務選單、地方資訊面板及相關連結視窗皆可獨立捲動。
- 頁首提供附實際操作圖片的使用教學，涵蓋定位搜尋、交通圖層、公車路線與地方服務。
- 互動控制提供焦點樣式、ARIA 標籤與鍵盤關閉操作。
- 大量 YouBike 與停車場站點使用 Marker Cluster，交通資料依地圖視窗範圍載入。

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
| 道路資料 | Overpass API |
| 部署 | Render Web Service、GitHub 自動部署 |
| 儲存 | 記憶體快取、JSON 磁碟快照、Render Persistent Disk（選用） |

## 運作方式

1. 前端建立 Leaflet 地圖，但不立即請求交通圖層。
2. 瀏覽器完成定位判定後，選擇使用者位置或台北 101。
3. 設定檔與定位皆完成後，前端向同網域的 Node.js API 請求圖層資料。
4. 後端代理 CWA、TDX、data.gov.tw、Nominatim 及 Overpass，並統一處理快取與錯誤。
5. 後端每 12 秒更新公車動態，每 5 分鐘更新路況、YouBike 與停車場，所有使用者讀取同一份共享快取。
6. TDX 單組憑證遇到 `429` 時依設定順序切換，只有全部憑證都被限流才進入「請求過多」錯誤或快取降級狀態。
7. 外部服務失敗時保留既有快取，讓地圖與其他功能仍可繼續使用。

TDX 官方 Swagger 顯示，市區公車、YouBike、縣市路況與縣市停車場只提供 `City/{City}` 端點，沒有全臺單一請求端點。系統因此採用「每縣市一次取得完整資料、伺服器共享快取」；同一縣市不會因使用者數量或地圖移動重複請求。若固定掃描 22 縣市，單次週期反而會產生上百次 TDX 請求，因此不採用全臺強制預抓。全臺公車動態則維持既有的伺服器彙整快照。

## 資料來源與限制

- 公車、YouBike、停車場與道路即時資料由 TDX 提供，實際更新速度與完整度受 TDX 方案額度及來源品質影響。
- 天氣資料由中央氣象署提供；地址與道路查詢分別依賴 Nominatim 及 Overpass API。
- Render 免費方案可能會休眠，服務重新喚醒時第一個請求需要較長時間。
- 未掛載 Persistent Disk 時，Render 重新部署或重建執行個體後會重新建立公車快照。
- 瀏覽器定位、通知及系統分享功能需要 HTTPS、瀏覽器支援與使用者授權。

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
| `DATA_GOV_FETCH_ENABLED` | 否 | 服務啟動時是否允許取得政府資料開放平臺資料，預設 `true` |
| `ADMIN_USERNAME` | 否 | 管理員帳號，預設 `admin` |
| `ADMIN_PASSWORD` | 否 | 管理員密碼，預設 `7766`；正式環境建議覆寫 |
| `TDX_FETCH_ENABLED` | 否 | 服務啟動時是否允許取得 TDX，預設 `true` |
| `TDX_CLIENT_ID` | 是 | 第一組 TDX OAuth 用戶端 ID |
| `TDX_CLIENT_SECRET` | 是 | 第一組 TDX OAuth 用戶端密鑰 |
| `TDX_CLIENT_ID_2`、`TDX_CLIENT_SECRET_2` | 否 | 第二組 TDX 憑證 |
| `TDX_CLIENT_ID_3`、`TDX_CLIENT_SECRET_3` | 否 | 第三組 TDX 憑證 |
| `TDX_CLIENT_ID_4`、`TDX_CLIENT_SECRET_4` | 否 | 第四組 TDX 憑證 |
| `TDX_CLIENT_ID_5`～`TDX_CLIENT_ID_8` 及對應的 `TDX_CLIENT_SECRET_5`～`TDX_CLIENT_SECRET_8` | 否 | 第五至第八組 TDX 憑證；也可繼續增加編號 |
| `TDX_CREDENTIALS_JSON` | 否 | 多組憑證 JSON 陣列或物件，欄位使用 `clientId` 與 `clientSecret` |
| `BUS_REFRESH_INTERVAL_MS` | 否 | 公車動態快照更新間隔，預設 `12000` 毫秒 |
| `TDX_REFRESH_INTERVAL_MS` | 否 | TDX 共用快取背景排程間隔，預設 `5000` 毫秒 |
| `TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS` | 否 | 路況、YouBike 與停車場更新間隔，預設 `300000` 毫秒 |
| `CWA_DATASET_IDS` | 否 | CWA 備援資料集 ID，以逗號分隔 |
| `BUS_REALTIME_CACHE_FILE` | 否 | 全臺公車快照儲存路徑 |

Render 會自動提供 `PORT`，伺服器已監聽 `0.0.0.0`，不需要手動指定連接埠。若使用 Render Persistent Disk，建議掛載至 `/var/data`，並設定 `BUS_REALTIME_CACHE_FILE=/var/data/bus_realtime_cache.json`。

八組 TDX 帳號請在 Render 的 Environment 頁面分別新增以下 Key；Value 填入各組實際帳號與密鑰：

```text
TDX_CLIENT_ID
TDX_CLIENT_SECRET
TDX_CLIENT_ID_2
TDX_CLIENT_SECRET_2
TDX_CLIENT_ID_3
TDX_CLIENT_SECRET_3
TDX_CLIENT_ID_4
TDX_CLIENT_SECRET_4
TDX_CLIENT_ID_5
TDX_CLIENT_SECRET_5
TDX_CLIENT_ID_6
TDX_CLIENT_SECRET_6
TDX_CLIENT_ID_7
TDX_CLIENT_SECRET_7
TDX_CLIENT_ID_8
TDX_CLIENT_SECRET_8
```

伺服器在至少有三組完整憑證時，會依載入順序保留最後兩組。使用上述八組編號時，`TDX_CLIENT_ID_7`／`TDX_CLIENT_SECRET_7` 與 `TDX_CLIENT_ID_8`／`TDX_CLIENT_SECRET_8` 只用於使用者點擊某輛公車後的站序與預估到站資料；公車背景快照、站牌、路況、YouBike、停車場及其他 TDX 快取只使用第 1～6 組。兩個憑證池各自處理 `429` 輪替，不會互相借用。若完整憑證少於三組，全部歸一般池，公車詳細資料專用池會保持停用而不借用一般池。

更新間隔已有正確預設值；除非要覆寫，不必在 Render 設定 `BUS_REFRESH_INTERVAL_MS`、`TDX_REFRESH_INTERVAL_MS` 或 `TDX_TRAFFIC_BIKE_REFRESH_INTERVAL_MS`。

## API 與安全性

- `GET /api/status`：檢查服務及環境變數設定狀態，不回傳憑證內容。
- `POST /api/admin/login`：建立管理員 session。
- `GET /api/admin/status`：取得 TDX、中央氣象署、政府資料開放平臺開關、可用憑證與快取狀態，需管理員 session。
- `POST /api/admin/tdx`：以 `{ "enabled": true|false }` 控制 TDX 資料取得，需管理員 session。
- `POST /api/admin/cwa`：以 `{ "enabled": true|false }` 控制中央氣象署資料取得，需管理員 session。
- `POST /api/admin/data-gov`：以 `{ "enabled": true|false }` 控制政府資料開放平臺資料取得，需管理員 session。
- `POST /api/admin/logout`：登出並清除管理員 session。
- `GET /api/tdx/bus?scope=all`：取得目前已儲存的全臺公車快照。
- `GET /api/tdx/parking?lat=25.033&lng=121.5654&city=Taipei&radius=5000`：取得附近停車場與剩餘車位。
- `/api/status` 只回傳 TDX 憑證總數及目前可用組數，不會回傳帳號、密鑰或 token。
- 地圖使用的交通 API 支援座標與範圍過濾，避免傳輸不必要的大量資料。
- 靜態伺服器採公開檔案白名單，`.env`、`server.js`、日誌及憑證範本無法透過 HTTP 下載。
- `.env`、執行日誌及公車即時快照均已列入 `.gitignore`，不會上傳到 GitHub。
