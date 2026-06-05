const { app, BrowserWindow, Tray, Menu, globalShortcut, screen, shell, nativeImage } = require('electron')
const path = require('path')

// 読み込み先（既定は本番。開発時は COMET_URL=http://localhost:3000 で切替）
const COMET_URL = process.env.COMET_URL || 'https://comet-nu.vercel.app'

// Google は Electron 等の埋め込みブラウザでの OAuth をブロックするため、通常の Chrome を名乗る（OS に合わせる）
app.userAgentFallback =
  process.platform === 'win32'
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const isMac = process.platform === 'darwin'

let launcherWin = null
let overlayWin = null
let tray = null
let isQuitting = false
let targetDisplayId = null // null = 自動選択（外部ディスプレイ優先）
let overlayUrl = null      // 現在開いているオーバーレイの URL

// ── ディスプレイ選択ヘルパー ──
function getTargetDisplay() {
  const displays = screen.getAllDisplays()
  if (displays.length === 1) return displays[0]

  // 明示的に選択済みならそれを優先
  if (targetDisplayId) {
    const found = displays.find(d => d.id === targetDisplayId)
    if (found) return found
  }

  // デフォルト: プライマリ以外（外部ディスプレイ = 通常はプロジェクター/TV）を優先
  const primary = screen.getPrimaryDisplay()
  return displays.find(d => d.id !== primary.id) || primary
}

// ── ランチャー窓（ログイン・ルーム管理。フェーズ1の Web を読み込む）──
async function createLauncher() {
  launcherWin = new BrowserWindow({
    width: 1100,
    height: 800,
    title: 'Comet ☄️',
    webPreferences: { contextIsolation: true },
  })

  // アプリ判定用クッキー。Web 側（proxy.ts 等）がこれを見てブラウザと出し分ける。
  // expirationDate 必須（無いと session cookie になり再起動で消える）。
  // httpOnly: false はログイン画面の client 側判定（終了ボタン表示）で document.cookie から読むため。
  await launcherWin.webContents.session.cookies.set({
    url: COMET_URL,
    name: 'comet_app',
    value: '1',
    secure: COMET_URL.startsWith('https'),
    httpOnly: false,
    sameSite: 'lax',
    expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 3650, // 約10年
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
  overlayUrl = url + (url.includes('?') ? '&' : '?') + 'app=1'

  // 既存があれば作り直し（別ルームへの切替に対応）
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.destroy()

  const { bounds } = getTargetDisplay()

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
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  overlayWin.setIgnoreMouseEvents(true, { forward: true }) // macOS: クリックを下へ転送
  // setContentProtection は使わない（使うと画面共有から弾幕が除外される）

  overlayWin.webContents.session.clearCache()
  overlayWin.loadURL(overlayUrl)
  overlayWin.showInactive()
  updateTray(true)
}

// ── メニューバーの表示を状態に同期（ディスプレイ一覧も含む）──
function updateTray(isVisible) {
  if (!tray) return
  // 状態表示: macOS はメニューバーにテキスト（setTitle は macOS 専用）。
  // Windows は通知領域にテキストを出せないので tooltip に状態を載せる（全 OS 共通でも更新）。
  if (isMac) tray.setTitle(isVisible ? 'ON' : '')
  tray.setToolTip(isVisible ? 'Comet — 弾幕表示中' : 'Comet — 弾幕は非表示')

  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const currentId = targetDisplayId || getTargetDisplay().id

  // 「表示先ディスプレイ」サブメニュー（1枚でも常に表示。どこに出るか分かるように）
  const displaySection = [
    {
      label: `表示先ディスプレイ（${displays.length}枚）`,
      submenu: displays.map((d, i) => {
        const label = [
          d.label || `ディスプレイ ${i + 1}`,
          `${d.bounds.width}×${d.bounds.height}`,
          d.id === primary.id ? '[メイン]' : '[外部]',
        ].join('  ')
        return {
          label,
          type: 'radio',
          checked: d.id === currentId,
          click: () => {
            targetDisplayId = d.id
            // 表示中なら即座にそのディスプレイへ移動
            if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) {
              overlayWin.setBounds({ ...d.bounds })
              overlayWin.setAlwaysOnTop(true, 'screen-saver') // 移動後も最前面を維持
            }
            updateTray(isVisible)
          },
        }
      }),
    },
    { type: 'separator' },
  ]

  const sc = isMac ? '⌘⇧X' : 'Ctrl+Shift+X'
  const menu = Menu.buildFromTemplate([
    { label: isVisible ? `弾幕を隠す  (${sc})` : `弾幕を表示  (${sc})`, click: toggleOverlay },
    { label: '操作ウィンドウを表示', click: () => { if (launcherWin) { launcherWin.show(); launcherWin.focus() } } },
    { type: 'separator' },
    ...displaySection,
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
    launcherWin.show()
    launcherWin.focus()
  }
}

// ── メニューバー（Tray）──
function buildTray() {
  // assets/tray.png（@2x は createFromPath が自動で拾う）。Windows では通知領域（タスクバー右下）に出る
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')))
  // Windows はトレイアイコン左クリックでメニューが出ないので、クリックでメニュー表示
  if (!isMac) tray.on('click', () => tray.popUpContextMenu())
  updateTray(false) // tooltip はここで状態付きでセットされる
}

app.whenReady().then(() => {
  // macOS は画面上部メニューバー（Cmd+Q 用）。Windows は各ウィンドウ内にメニューバーが出て不格好なので消す
  if (isMac) {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { label: '終了', accelerator: 'CmdOrCtrl+Q', click: () => { isQuitting = true; app.quit() } },
        ],
      },
    ]))
  } else {
    Menu.setApplicationMenu(null)
  }

  createLauncher()
  buildTray()
  globalShortcut.register('CommandOrControl+Shift+X', toggleOverlay)
  // Windows はアプリメニューを消したので Ctrl+Q をグローバルに張る（mac は appMenu の Cmd+Q が担当）
  if (!isMac) globalShortcut.register('CommandOrControl+Q', () => { isQuitting = true; app.quit() })

  // ディスプレイの抜き挿し時にメニューを更新
  screen.on('display-added', () => updateTray(overlayWin?.isVisible() ?? false))
  screen.on('display-removed', (_, removedDisplay) => {
    // 使用中のディスプレイが外れたら自動選択に戻す
    if (targetDisplayId === removedDisplay.id) targetDisplayId = null
    updateTray(overlayWin?.isVisible() ?? false)
  })
})

app.on('window-all-closed', () => {})

app.on('activate', () => {
  if (launcherWin) launcherWin.show()
  else createLauncher()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
