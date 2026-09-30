# 🍵 茶訊調查局 | Tea Rumor Investigation

幫長輩在喝茶保健訊息裡練習「先問出處」的手機網頁遊戲。純靜態單檔 HTML，免登入、免建置、不接後端。

## 入口

| 版本 | 檔案 | 線上網址 |
| --- | --- | --- |
| 茶訊調查局（第一案，繁體中文） | `index.html` | [retrance.github.io/tea-game/](https://retrance.github.io/tea-game/) |
| 2026 年春季班版（10 題真假題，中英雙語） | `2026-spring/index.html` | [retrance.github.io/tea-game/2026-spring/](https://retrance.github.io/tea-game/2026-spring/) |

春季班版原樣保存，不再改動。設計方案與六案總表見 [docs/茶訊調查局-第一關改造方案.md](docs/茶訊調查局-第一關改造方案.md)，文案與計分以該文件為準。

## 玩法

讀轉傳訊息 → 給信任分數 → 選第一個行動 → 點出要查的句子 → 打開證據卡比較 → 下最後判斷、再打一次分數 → 看回顧與四項練習分數。遊戲內「上一步」和瀏覽器返回效果相同，可以回頭改答案，分數跟著重算；進度存在同一分頁，重新整理不會不見，「再玩一次」清空。

## 程式結構（`index.html`）

`<script>` 由上到下分成：

1. **`SHARED`**：六案共用、一字不差的部分——階段順序、題目文字、五個行動、三個最後判斷、四項分數名、線索門檻（3 處）、至少打開幾張證據（2 張）、分數起點（50）。
2. **`SCENARIOS`**：情境資料，一案一個物件（欄位見下節）。
3. **純狀態邏輯**：`gate()` 集中判斷每階段能不能往下走（選卡門檻在 `canPickEvidence()`）；`computeScores()` 每次都由目前答案重新計算（不累加），限制在 0–100；`feedbackFor()` 依實際選擇取回饋句。
4. **畫面**：`VIEWS` 每個階段一個函式；資料文字一律走文字節點（`innerHTML` 只用在固定的迴紋針圖示）。
5. **導覽**：本分頁歷史紀錄第 i 筆就是第 i 階段；前進 `pushState`，遊戲內返回呼叫 `history.back()`，和瀏覽器返回同一條路。換階段後 0.7 秒內不收第二下點擊，防連點跳步。`sessionStorage` 鍵 `tea-investigation:v1`，內容不合法就重開一局。

## 情境資料欄位

| 欄位 | 內容 |
| --- | --- |
| `id`、`caseLabel`、`title` | 案件代號、畫面上的「第 N 案」、內部題名 |
| `sourceType` | 訊息卡右上角的來源標示（例：轉傳訊息（教學模擬）） |
| `messageSegments` | `{ id, text }` 陣列，依序拼成完整訊息；是訊息文字的唯一來源。`\n\n` 表示分段 |
| `caseNote` | 從「找要查的地方」開始顯示在訊息下方的案卷註記 |
| `clues` | `{ id, segmentId, kind, hint, scoreDelta }`；`segmentId` 指向可點的片段，`kind` 為 `check`（要查，4 句）或 `skip`（不用查，2 句，不加分） |
| `actions` | 以共用行動 id 為鍵：`{ result, scoreDelta }` |
| `evidenceCards` | `{ id, title, sourceType, content, useful, limits, links, result, scoreDelta }`；可對照的那張加 `comparable: true`，按「跟其他資料對對看」才出現的加 `afterCompare: true` |
| `verdictOptions` | 以共用判斷 id 為鍵：`{ result, scoreDelta }` |
| `reflection` | `conclusionLabel`（結論印章）、`conclusion`、`checkPoints`（要查的地方） |
| `learningPoint` | 這一案的招式，例：第一招：先問出處 |
| `feedback` | 四項分數各自的回饋規則：依序取 `byAction` → `byEvidence` → `byVerdict` → `fallback`，`suffixByAction` 接在句尾 |
| `references` | `{ id, label, url }`；證據卡的 `links` 以 id 指過來，外部網址只寫這裡 |

`scoreDelta` 只寫不為 0 的項，例如 `{ source: 5 }`。

## 新增第 2–6 案

1. 先在方案文件定稿該案的訊息、六句線索（四句要查、兩句不用查）、A／B／C／D 四張卡、各選項結果句、計分與回饋，醫療表述附來源。
2. 在 `SCENARIOS` 加一個物件，欄位照上表；`actions`、`verdictOptions` 的鍵必須用 `SHARED` 裡的 id。
3. 選關入口尚未製作：目前固定進 `SCENARIOS[0]`。加第二案時需要一個選關畫面（或網址參數）設定 `state.scenarioId`，畫面、狀態機與計分函式不用改。
4. 用手機寬度（320／375／430 px）把完整路徑玩一遍，確認分數與回饋句符合方案。

## 本機預覽

```bash
python3 -m http.server 8765
```

開 <http://localhost:8765/>。

---

## Motivation (English)

In Taiwan, LINE and Facebook groups are full of misleading health tips. This large-type, touch-friendly game helps seniors practise one habit before forwarding a tea-and-health message: ask where it came from. The current homepage is Traditional Chinese only; the bilingual 2026 spring edition remains at `/2026-spring/`.
