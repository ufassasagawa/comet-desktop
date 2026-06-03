const { app, BrowserWindow, Tray, Menu, globalShortcut, screen, shell, nativeImage } = require('electron')


// 読み込み先（既定は本番。開発時は COMET_URL=http://localhost:3000 で切替）
const COMET_URL = process.env.COMET_URL || 'https://comet-nu.vercel.app'

// Google は Electron 等の埋め込みブラウザでの OAuth をブロックするため、通常の Chrome を名乗る
app.userAgentFallback =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

let launcherWin = null
let overlayWin = null
let tray = null
let isQuitting = false

// ── ランチャー窓（ログイン・ルーム管理。フェーズ1の Web を読み込む）──
function createLauncher() {
  launcherWin = new BrowserWindow({
    width: 1100,
    height: 800,
    title: 'Comet ☄️',
    webPreferences: { contextIsolation: true },
  })
  launcherWin.loadURL(COMET_URL)

  // /quit-app へのナビゲーションを横取りしてアプリを終了
  launcherWin.webContents.on('will-navigate', (event, url) => {
    if (url.includes('/quit-app')) {
      event.preventDefault()
      isQuitting = true
      app.quit()
    }
  })

  // 「弾幕を開く」(target="_blank" の /overlay/...) を横取りして透明オーバーレイ窓で開く
  launcherWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('/overlay/')) {
      openOverlay(url)
      return { action: 'deny' }
    }
    // それ以外の新規ウィンドウは外部ブラウザで開く
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 閉じてもアプリは Tray に常駐（ウィンドウを隠すだけ）
  launcherWin.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      launcherWin.hide()
    }
  })
}

// ── オーバーレイ窓（透明・最前面・クリック透過）──
function openOverlay(url) {
  const appUrl = url + (url.includes('?') ? '&' : '?') + 'app=1'

  // 既存があれば作り直し（別ルームへの切替に対応）
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.destroy()

  const { bounds } = screen.getPrimaryDisplay() // メニューバー/Dock 含む全面

  overlayWin = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false, // フォーカスを奪わない → クリック/入力は裏の PPT へ
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: { contextIsolation: true },
  })

  overlayWin.setAlwaysOnTop(true, 'screen-saver') // 最前面（最高レベル）
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }) // 全画面プレゼンの上にも出す
  // { forward: true } でマウスイベントを下のウィンドウ(PPT等)へ転送（macOS必須）
  overlayWin.setIgnoreMouseEvents(true, { forward: true })
  // 注意: setContentProtection は使わない（使うと画面共有から弾幕が除外される）

  // キャッシュを無効化して常に最新の本番サイトを読む
  overlayWin.webContents.session.clearCache()
  overlayWin.loadURL(appUrl)
  overlayWin.showInactive() // フォーカスを奪わずに表示
  updateTray(true)
}

// ── メニューバーの表示を状態に同期 ──
function updateTray(isVisible) {
  if (!tray) return
  tray.setTitle(isVisible ? '☄️ ON' : '☄️')
  const menu = Menu.buildFromTemplate([
    { label: isVisible ? '弾幕を隠す  (⌘⇧X)' : '弾幕を表示  (⌘⇧X)', click: toggleOverlay },
    { label: '操作ウィンドウを表示', click: () => { if (launcherWin) { launcherWin.show(); launcherWin.focus() } } },
    { type: 'separator' },
    { label: '終了', click: () => { isQuitting = true; app.quit() } },
  ])
  tray.setContextMenu(menu)
}

// ── 弾幕の表示/非表示トグル ──
function toggleOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) {
    if (overlayWin.isVisible()) {
      overlayWin.webContents.executeJavaScript("document.dispatchEvent(new CustomEvent('comet-overlay-hide'))")
      overlayWin.hide()
      updateTray(false)
    } else {
      overlayWin.showInactive()
      overlayWin.webContents.executeJavaScript("document.dispatchEvent(new CustomEvent('comet-overlay-show'))")
      updateTray(true)
    }
  } else if (launcherWin) {
    // まだ弾幕を開いていない → 操作ウィンドウを前面に
    launcherWin.show()
    launcherWin.focus()
  }
}

// ── メニューバー（Tray）──
function buildTray() {
  tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('Comet')
  updateTray(false) // 初期状態は非表示
}

app.whenReady().then(() => {
  // Cmd+Q で終了できるようにアプリメニューを設定
  const appMenu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { label: '終了', accelerator: 'CmdOrCtrl+Q', click: () => { isQuitting = true; app.quit() } },
      ],
    },
  ])
  Menu.setApplicationMenu(appMenu)

  createLauncher()
  buildTray()
  globalShortcut.register('CommandOrControl+Shift+X', toggleOverlay)
})

// 全ウィンドウを閉じても終了しない（Tray 常駐）
app.on('window-all-closed', () => {})

app.on('activate', () => {
  if (launcherWin) launcherWin.show()
  else createLauncher()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
