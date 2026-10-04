# 茶訊調查局：給 agent 的工作規則

- 檔案地圖、路由、存檔與資料結構看 [README](README.md)；產品要求與介面原則以[規格](docs/茶訊調查局-短遊戲規格.md)為準，實際畫面以 `index.html` 為準。
- 案件文字只改 `index.html` 的 `SCENARIOS`，文件不重抄；醫療相關的句子要對照 `references` 的原文再寫。
- 改了流程、選項或用詞，同一次改動裡同步規格和 `scripts/` 兩支檢查；新加的檢查先放一個已知的錯確認會失敗。
- 交付前跑 `node scripts/check.mjs` 和 `node scripts/browser-check.mjs`（環境變數見 README 的驗證段落）。
- 介面照規格的「介面原則」；`.agents/skills/frontend-design` 的通用美學指引和它衝突時，以規格為準。
- `2026-spring/` 是獨立保留的舊版，不跟著改。
- 合併到 `main` 等於公開發布，要先經使用者確認。
