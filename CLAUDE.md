# Comet Desktop ☄️

Comet Web（`../comet/`）を Electron で包んだ Mac デスクトップアプリ。
透明・最前面・クリック透過のオーバーレイ窓で、PowerPoint/Keynote の上に弾幕を流す。

## 起動
```bash
npm start          # 開発モード（本番サイトを読み込む）
COMET_URL=http://localhost:3000 npm start  # ローカル Web と組み合わせる場合
```

## 構成
- `main.js` … メインプロセス。2種類のウィンドウ＋Tray＋ショートカットを管理
- 外部サイト読み込み方式（Next.js コードは同梱しない）
- 読み込み先: 環境変数 `COMET_URL`（既定 `https://comet-nu.vercel.app`）

## 2種類のウィンドウ
| ウィンドウ | 役割 |
|---|---|
| ランチャー窓 | ログイン・ルーム管理（Web をそのまま表示） |
| オーバーレイ窓 | 弾幕表示（透明・最前面・クリック透過） |

## 主な挙動
- **Google ログイン**：UA を通常 Chrome に偽装（`app.userAgentFallback`）して Google の制限を回避
- **「弾幕を開く」横取り**：`setWindowOpenHandler` で `/overlay/` URL を捕捉 → 透明窓で開く（`?app=1` を付与）
- **クリック透過**：`setIgnoreMouseEvents(true, { forward: true })` → 裏の PPT に操作が届く
- **全画面プレゼン対応**：`setVisibleOnAllWorkspaces({ visibleOnFullScreen: true })`
- **非表示時にリソース節約**：`comet-overlay-hide` イベントで Realtime 切断・アニメーション停止

## 操作口
- `Cmd+Shift+X` … 弾幕を表示 / 非表示
- メニューバー `☄️ / ☄️ ON` … 状態表示＋メニュー（弾幕切替・操作窓表示・終了）
- ダッシュボードの「アプリを終了」ボタン … `/quit-app` ナビゲーションを横取りして `app.quit()`
- `Cmd+Q` … 終了

## 利用上の注意
- Zoom/Meet では**「画面全体」**を共有する（ウィンドウ単体共有では弾幕が写らない）
- `setContentProtection` は**使わない**（使うと画面共有から弾幕が除外される）
- MVP はプライマリディスプレイ固定

## 今後（フェーズ2b）
- `electron-builder` で `.dmg` 化
- 未署名のため初回は右クリック「開く」で Gatekeeper 回避
- マルチディスプレイ選択UI
