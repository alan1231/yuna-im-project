# React Frontend

Neon Ghost web frontend built with React, TypeScript, and Vite.

## Scripts

- `npm run dev`: start the Vite dev server.
- `npm run build`: build the production bundle.
- `npm run preview`: preview the production bundle locally.
- `npm run test`: run the Vitest unit tests.
- `npm run typecheck`: run the TypeScript type checker (`tsc --noEmit`).

## Structure

- `src/api/chatApi.ts`：所有後端 HTTP API 呼叫與 React Query keys。
- `src/hooks/`：聊天、管理台、通話的 view model。
- `src/components/account/`：註冊／登入。
- `src/components/chat/`：聊天室清單、訊息、輸入區、群組建立、語音／視訊、21 點。
- `src/components/chat/AvatarSettings.jsx`：DiceBear 頭像風格、seed、背景色與即時預覽設定。
- `src/components/admin/`：管理台（統計、使用者管理）。
- `src/stores/`：Zustand 狀態（auth、chat UI）。
- `src/utils/`：純邏輯工具（含 21 點規則與測試）。
- `public/`：圖示、黑傑克素材，以及 Lan URL 相關資源。

## 主要技術

- React 19 + TypeScript
- Vite 8 + @vitejs/plugin-react
- Tailwind CSS 4
- react-router-dom（BrowserRouter）
- @tanstack/react-query
- zustand
- react-hook-form + zod
- i18next（中／英）
- vitest（單元測試）

## 功能

- 帳號註冊／登入、session 還原。
- 一對一聊天、好友邀請流程、群組聊天。
- WebSocket 即時訊息、已讀回執與未讀顯示。
- 語音／視訊通話（僅一對一）。
- 21 點小遊戲（僅一對一）。
- 管理台介面。
- DiceBear 生成式頭像：不需上傳圖片，可選風格、修改自訂種子與背景色；未設定時回退為首字母。

## 頭像

頭像使用 DiceBear URL 生成，不需要在伺服器儲存圖片。使用者從左側選單點擊自己的頭像即可開啟設定視窗，輸入 seed 時會即時預覽，套用後由 `POST /auth/avatar` 儲存 URL。其他聯絡人會從使用者、好友與對話 API 取得 `avatar_url` 並顯示；圖片載入失敗或沒有設定時使用姓名首字母。
