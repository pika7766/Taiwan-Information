# 台灣智慧生活 Android App

這是獨立的 Capacitor Android 專案。`www/` 內含網站前端的完整副本，App 執行時不會讀取專案根目錄的網頁檔案；交通、天氣、政府資料與管理員功能統一連線至既有 Render 後端。

## 直接安裝

可安裝測試版位於：

`安裝檔/台灣智慧生活-android-debug.apk`

此 APK 使用 Android debug 憑證簽署，適合直接安裝測試，不可上傳 Google Play。手機需允許目前檔案管理器或瀏覽器「安裝未知的應用程式」。支援 Android 7.0（API 24）以上。

## 重新建置

需求：Node.js 22、JDK 21、Android Studio，以及 Android SDK 36。

```powershell
npm.cmd install
npm.cmd run assets
npm.cmd run build:debug
```

建置腳本會自動同步最新網頁副本、重建手機原生橋接、執行 Capacitor 同步，再把 APK 放進 `安裝檔/`。

## Firebase 通知設定

1. 在 Firebase Console 將 Android App `com.pika7766.taiwansmartlife` 加入專案。
2. 下載 `google-services.json`，放到 `android/app/google-services.json`。
3. 執行 `npm.cmd run build:debug` 重新產生 APK。

`google-services.json` 已被 Git 忽略。沒有此檔案時 App 仍可建置及使用其他功能，但不會取得 FCM token，也無法收到系統公告或緊急資訊推播。App 取得通知權限後會自動訂閱伺服器 `/api/information` 提供的 FCM Topic。

## 發布 Google Play

使用 Android Studio 開啟 `android/`，選擇 **Build > Generate Signed App Bundle or APK**，建立並妥善保存自己的 release keystore，輸出 AAB 後上傳 Google Play。release keystore 與密碼不可提交 GitHub。

## 手機專用設定

- App ID：`com.pika7766.taiwansmartlife`
- 後端：`https://taiwan-information.onrender.com`
- 後端位置在 `www/mobile-config.js`，來源範本由 `scripts/sync-web.mjs` 產生。
- 原生定位、分享、FCM 通知、外部導航、鍵盤、狀態列與返回鍵位於 `src/mobile-runtime.js`。
- 更新網頁版功能後，執行 `npm.cmd run prepare:native` 即可重新複製至 Android 工程。
