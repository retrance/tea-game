# 🍵 茶訊調查局

公開的喝茶訊息判斷短遊戲：六案依序遊玩，先判斷一次，再點開黃色線索、對照調查局的看法，最後領取帶 QR 的調查員類型通關卡。介面模擬 LINE 聊天室，按鈕用 iOS 液態玻璃風格。純靜態網站，免登入、免建置、不接後端。

## 地圖與真相來源

| 檔案 | 職責 |
| --- | --- |
| `index.html` | 可玩介面（繁中與英文）；`CASES` 是案件全文、訊息附的資料、線索、回饋、調查局看法與來源的唯一來源，`UI` 是介面文字；`PERSONA_TEXT`、`BIAS_TEXT`、`TOP_TEXT` 是通關稱號，`GAME_URL` 是分享與 QR 指向的公開入口 |
| `assets/audio/happy-adventure.mp3` | 遊戲背景音樂；由玩家提供的音樂壓縮成 MP3，隨網站一起部署；播放行為見規格的介面原則 |
| `assets/images/tea-bureau-avatar.webp` | 中央茶葉盾牌的簡化版本；用於首頁刊頭與調查局回覆頭像 |
| `assets/images/tea-bureau-seal.webp` | 玩家提供的調查局徽章；用於通關卡與分享圖的結案章 |
| [短遊戲規格](docs/茶訊調查局-短遊戲規格.md) | 流程、介面原則、內容邊界與驗收 |
| `2026-spring/index.html` | 獨立保留的春季班十題真假題，中英雙語 |
| `AGENTS.md` | 給 agent 的工作規則；`CLAUDE.md` 只橋接到它 |
| `scripts/check.mjs` | 資料、回饋、調查局看法、通關稱號、來源分流、英文版文字完整、存檔與順序入口的檢查 |
| `scripts/browser-check.mjs` | 完整瀏覽器流程、線索收集與計分、通關卡與 QR 解碼、分享分支、LINE 內建瀏覽器長按存圖、手機版面與鍵盤、英文版全程與語言切換驗證 |

產品要求以規格為準；實際畫面以 `index.html` 為準。修改需求時同步更新規格與檢查；案件全文不在文件重抄。

## 本機預覽

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

開啟 <http://127.0.0.1:8765/>。春季班版在 `/2026-spring/`。本機修改不會自動發布 GitHub Pages。

手機實測（LINE 內建瀏覽器、Safari）：手機和 Mac 連同一個 Wi-Fi，改用下面的指令開，手機開 `http://<Mac 區網 IP>:8766/`（區網 IP 用 `ipconfig getifaddr en0` 查）。這會把整個資料夾（含 `.git`）開放給同一個網路，測完就關。

```bash
python3 -m http.server 8766 --bind 0.0.0.0
```

## 路由與存檔

網址帶 `?lang=en` 是英文版，沒帶是繁中；每頁右上角可切換，切換只改網址參數與畫面文字，進度共用。`#home` 是短首頁，`#case/<案件 id>` 是原訊息，`#review/<案件 id>` 是解析，`#finish` 是通關卡。入口限制遵照[短遊戲規格](docs/茶訊調查局-短遊戲規格.md)。

遊玩資料保存在 `localStorage` 的 `tea-investigation:v4`，關掉分頁再回來可以接著玩：各案 `selected`（草稿）、`submitted`（原判斷）、`active`（展開的線索）、`seen`（看過的線索）。舊版存檔不換算也不刪除；儲存不可用時仍能玩，提示刷新會重新開始。恢復存檔只接受連續完成的案件，不讓損壞資料造成跳案。

## 案件資料

要翻譯的文字一律寫成 `{zh, en}` 成對（線索寫成 `clue(id, [中, 英], [中提示, 英提示], basis, ref)`），`useLang` 依目前語言用 `localize` 展開成單語的 `SCENARIOS`，並換上該語言的 `VERDICTS`、`PERSONAS`、`BIAS_PERSONAS`、`TOP_PERSONA` 與 `ui`；程式其他地方只讀展開後的值。

`CASES` 包含 `id`、`title`、`context`（標題列的聊天室名稱：群組寫「名稱 (人數)」，私訊與 `from` 相同）、`from`（聊天室裡的傳訊人，要是人名；頭像取 `AVATARS` 裡和中文名同名的內嵌圖，每個傳訊人都要有）、`time`（泡泡旁的時間）、`angle`（判斷角度）、`answer`（調查局的看法）、`segments`、`attachment`、`references`、`finding`、`feedback`、`todo`。共用判斷詞由 `VERDICTS` 定義，`answer` 是它的索引，`feedback` 與它的順序相同。計分規則只在 `scoreOf`。`PERSONA_TEXT` 每種語言以該語言的 `angle` 為鍵，值是通關卡上的稱號；六軸全滿用 `TOP_TEXT`。

片段由一般文字 `{ text }` 或線索 `{ id, text, hint, basis, ref }` 組成。`basis` 為 `message`（訊息本身）、`attachment`（訊息附的資料）或 `check`（解析另外查證）。`ref` 指向同案來源的 `id`；附件也以 `ref` 指向來源。判斷前只生成文字與中性附件，解析才生成線索元件。所有文字透過 DOM 文字節點輸出。通關卡由 `cardCanvas` 畫成一張圖，底紋 `LEAVES` 是內嵌的白底灰線 WebP（換圖時把新圖的線條轉成白底灰階再嵌入，上色和濃淡在 `cardCanvas` 調），QR 由內建的 `qrMatrix` 產生，不依賴外部套件。

## 驗證

```bash
node scripts/check.mjs
node scripts/browser-check.mjs
```

瀏覽器檢查使用 Playwright 與 Chromium；若環境沒有本地套件，可用 `PLAYWRIGHT_PACKAGE` 指向既有的 Playwright 套件目錄，`CHROME_PATH` 指向 Chrome 執行檔。測試網址預設 `http://127.0.0.1:8765`，可用 `GAME_URL` 指定。真人試玩、實機覆核與發布要求見規格的驗收段落。
