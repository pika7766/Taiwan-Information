# 台灣智慧生活 iOS App

這是獨立的 Capacitor iOS 專案。`www/` 內含網站前端的完整副本，App 執行時不會讀取專案根目錄的網頁檔案；交通、天氣、政府資料與管理員功能統一連線至既有 Render 後端。

## 為什麼資料夾內沒有預先簽署的 IPA

iPhone 只接受由 Apple Developer 憑證簽署、且符合該帳號佈署方式的 App。Windows 無法執行 Xcode 或產生合法簽署的 `.ipa`，因此本資料夾提供完整 Xcode 工程與自動封裝腳本，必須在 Mac 上使用您的 Apple Developer 帳號簽署。

## 在 Mac 建置與安裝

需求：Node.js 22、目前版本 Xcode、可用的 Apple Developer Team。

最直接的方式：

```bash
npm install
npm run prepare:native
npm run open
```

在 Xcode 選擇 **App > Signing & Capabilities**，指定自己的 Team，連接 iPhone 後按 Run 即可安裝。

產生 IPA：

```bash
export APPLE_TEAM_ID=您的10碼TeamID
chmod +x scripts/build-ios.sh
./scripts/build-ios.sh
```

預設輸出 development IPA 至 `安裝檔/`，只能安裝在開發帳號已登錄的裝置。App Store Connect 發布請改用 Xcode Archive，或依目前 Xcode 支援值設定 `IOS_EXPORT_METHOD` 後執行腳本。

## Firebase 通知設定

1. 在 Firebase Console 將 iOS App `com.pika7766.taiwansmartlife` 加入專案。
2. 下載 `GoogleService-Info.plist`，放到 `ios/App/App/GoogleService-Info.plist`，並確認它已加入 Xcode 的 App target。
3. 在 Firebase Console 的 Cloud Messaging 設定上傳 Apple APNs Auth Key。
4. 在 Xcode **Signing & Capabilities** 確認 Push Notifications 已啟用後重新簽署建置。

`GoogleService-Info.plist` 已被 Git 忽略。伺服器只使用 FCM HTTP v1，不直接呼叫 APNs；但所有 iPhone 推播在 Apple 平臺上都必須經 APNs 傳送，因此 Firebase 端仍需要 APNs Auth Key。

## 專案資訊

- Bundle ID：`com.pika7766.taiwansmartlife`
- 最低版本：iOS 15
- 後端：`https://taiwan-information.onrender.com`
- 定位用途說明已寫入 `ios/App/App/Info.plist`。
- 原生定位、分享、FCM 通知、外部導航、鍵盤與狀態列位於 `src/mobile-runtime.js`。
- 更新網頁版功能後，執行 `npm run prepare:native` 即可重新複製至 Xcode 工程。
