# Comet Desktop ☄️

Comet Web（`../comet/`）を Electron で包んだデスクトップアプリ（**Mac / Windows**）。
透明・最前面・クリック透過のオーバーレイ窓で、PowerPoint/Keynote の上に弾幕を流す。
コードは Mac/Windows 共通。OS 差分は `main.js` の `isMac`（`process.platform`）で分岐。

## 起動
```bash
npm start          # 開発モード（本番サイトを読み込む）
COMET_URL=http://localhost:3000 npm start  # ローカル Web と組み合わせる場合
```

## ビルド（配布物）
```bash
# Mac（.dmg）— ローカルでビルド
npm run dist       # electron-builder --mac → dist/Comet-x.x.x.dmg（universal・未署名=ad-hoc）
npm run icons      # アイコン再生成（build/icon-source.html を編集したら実行）

# Windows（.exe / NSIS）— GitHub Actions で作る（Mac から直接は Wine 依存で不安定なため）
#   Actions タブ → "Build Windows installer" を Run、または win-v* タグを push
#   → dist/Comet-Setup-x.x.x.exe（x64・未署名）。ローカル検証は npm run dist:win（--dir 推奨）
```
- **Mac**: universal（arm64+x64）/ ad-hoc 署名。初回のみ **システム設定 → プライバシーとセキュリティ →「このまま開く」**（macOS 15+ は右クリック「開く」不可）
- **Windows**: x64 / NSIS インストーラ / 未署名。初回のみ **SmartScreen「詳細情報」→「実行」**。アイコンは electron-builder が `build/icon-1024.png` から .ico を自動生成
- アイコンは `build/icon-source.html`（Canvas 描画）→ `npm run icons` で PNG 化 → Mac 用 `.icns` は `sips`+`iconutil` で変換済み。Tray 用は `assets/tray.png`（@2x あり）

## OS 差分（main.js）
- Tray 状態: Mac は `setTitle('ON')`（メニューバー）、Windows は `setToolTip` に状態（通知領域はテキスト不可）＋クリックでメニュー
- アプリメニュー: Mac は Cmd+Q 用に表示、Windows は `null`（Ctrl+Q をグローバルショートカットで代替）
- UserAgent: OS に合わせて Chrome を名乗る（Google OAuth 対策）
- `setVisibleOnAllWorkspaces` / `'screen-saver'` レベルは Mac 概念だが Windows でも無害

## 構成
- `main.js` … メインプロセス。2種類のウィンドウ＋Tray＋ショートカットを管理
- `assets/` … 実行時に読む Tray アイコン（asar に同梱）
- `build/` … ビルド資材（アイコンソース HTML・生成スクリプト・icon.icns・icon-1024.png）。asar には入らない
- `.github/workflows/build-windows.yml` … Windows ビルド（windows-latest）
- 外部サイト読み込み方式（Next.js コードは同梱しない）
- 読み込み先: 環境変数 `COMET_URL`（既定 `https://comet-nu.vercel.app`）

## 2種類のウィンドウ
| ウィンドウ | 役割 |
|---|---|
| ランチャー窓 | ログイン・ルーム管理（Web をそのまま表示） |
| オーバーレイ窓 | 弾幕表示（透明・最前面・クリック透過） |

## 主な挙動
- **アプリ判定クッキー**：起動時に `comet_app=1` を persistent cookie でセット → Web 側（proxy.ts）がブラウザと出し分け（アプリは /dashboard フル機能、ブラウザはランディング/DLページ）
- **Google ログイン**：UA を通常 Chrome に偽装（`app.userAgentFallback`）して Google の制限を回避。ログインは ufas.co.jp ドメイン限定（Web 側で強制）
- **「弾幕を開く」横取り**：`setWindowOpenHandler` で `/overlay/` URL を捕捉 → 透明窓で開く（`?app=1` を付与）
- **クリック透過**：`setIgnoreMouseEvents(true, { forward: true })` → 裏の PPT に操作が届く
- **全画面プレゼン**：`setVisibleOnAllWorkspaces({ visibleOnFullScreen: true })` を設定しているが、**実環境では他アプリのフルスクリーン（別 Space）に弾幕が重ならない**。運用は「スライドはウィンドウ表示のまま」が前提（INSTALL.md に記載）
- **非表示時にリソース節約**：`comet-overlay-hide` イベントで Realtime 切断・アニメーション停止

## 操作口（括弧内は Windows）
- `Cmd+Shift+X`（`Ctrl+Shift+X`）… 弾幕を表示 / 非表示
- ☄️アイコン … Mac はメニューバー（表示中 `ON` 付き）／Windows は通知領域（状態は tooltip）。メニュー＝弾幕切替・操作窓表示・表示先ディスプレイ・終了
- ダッシュボード／ログイン画面の「アプリを終了」ボタン … `/quit-app` ナビゲーションを横取りして `app.quit()`（ログイン画面側は comet_app クッキーがある時だけ表示）
- `Cmd+Q`（`Ctrl+Q`）… 終了

## 利用上の注意
- Zoom/Meet では**「画面全体」**を共有する（ウィンドウ単体共有では弾幕が写らない）
- スライドを**全画面（フルスクリーン）モードにしない**（Mac は別 Space・Windows も別フルスクリーン面になり弾幕が前面に出ない）。ウィンドウ表示のまま発表する
- `setContentProtection` は**使わない**（使うと画面共有から弾幕が除外される）
- 表示先ディスプレイはメニューバーから選択（既定は外部ディスプレイ優先の自動選択）

## 今後（あれば）
- `comet://` カスタムURLスキーム（ブラウザのボタンからアプリ起動）
- 署名・公証（配布先が増えたら。現状の社内数人には ad-hoc で十分）
