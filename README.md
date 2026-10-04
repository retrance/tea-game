# 🍵 茶訊調查局

公開的喝茶訊息判斷短遊戲：六案依序遊玩，先判斷一次，再點開黃色線索、對照調查局的看法，最後領取可分享的判斷力六角圖通關卡。純靜態單檔 HTML，免登入、免建置、不接後端。

## 地圖與真相來源

| 檔案 | 職責 |
| --- | --- |
| `index.html` | 可玩介面；`SCENARIOS` 是案件全文、訊息附的資料、線索、回饋、調查局看法與來源的唯一來源 |
| [短遊戲規格](docs/茶訊調查局-第一關改造方案.md) | 流程、內容邊界與驗收；沿用既有檔名維持連結 |
| `2026-spring/index.html` | 獨立保留的春季班十題真假題，中英雙語 |
| `scripts/check.mjs` | 資料、回饋、調查局看法、來源分流、存檔與順序入口的檢查 |
| `scripts/browser-check.mjs` | 完整瀏覽器流程、線索收集與計分、分享分支、手機版面與鍵盤驗證 |

產品要求以規格為準；實際畫面以 `index.html` 為準。修改需求時同步更新規格與檢查；案件全文不在文件重抄。

## 本機預覽

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

開啟 <http://127.0.0.1:8765/>。春季班版在 `/2026-spring/`。本機修改不會自動發布 GitHub Pages。

## 路由與存檔

`#home` 是短首頁，`#case/<案件 id>` 是原訊息，`#review/<案件 id>` 是解析，`#finish` 是通關卡。入口限制遵照[短遊戲規格](docs/茶訊調查局-第一關改造方案.md)。

遊玩資料保存在 `localStorage` 的 `tea-investigation:v4`，關掉分頁再回來可以接著玩：各案 `selected`（草稿）、`submitted`（原判斷）、`active`（展開的線索）、`seen`（看過的線索），以及 `finishLine`（通關短句）。舊版存檔不換算也不刪除；儲存不可用時仍能玩，提示刷新會重新開始。恢復存檔只接受連續完成的案件，不讓損壞資料造成跳案。

## 案件資料

`SCENARIOS` 包含 `id`、`title`、`context`、`angle`（判斷角度）、`answer`（調查局的看法）、`segments`、`attachment`、`references`、`finding`、`feedback`、`todo`。共用判斷詞由 `VERDICTS` 定義，`answer` 是它的索引，`feedback` 與它的順序相同。計分規則只在 `scoreOf`。

片段由一般文字 `{ text }` 或線索 `{ id, text, hint, basis, ref }` 組成。`basis` 為 `message`（訊息本身）、`attachment`（訊息附的資料）或 `check`（解析另外查證）。`ref` 指向同案來源的 `id`；附件也以 `ref` 指向來源。判斷前只生成文字與中性附件，解析才生成線索元件。所有文字透過 DOM 文字節點輸出。

## 驗證

```bash
node scripts/check.mjs
node scripts/browser-check.mjs
```

瀏覽器檢查使用 Playwright 與 Chromium；若環境沒有本地套件，可用 `PLAYWRIGHT_PACKAGE` 指向既有的 Playwright 套件目錄，`CHROME_PATH` 指向 Chrome 執行檔。測試網址預設 `http://127.0.0.1:8765`，可用 `GAME_URL` 指定。真人試玩、實機覆核與發布要求見規格的驗收段落。
