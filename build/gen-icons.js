// アイコン書き出しスクリプト: icon-source.html を Electron でレンダリングして PNG 化
// 使い方: npx electron build/gen-icons.js
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 1200 })
  await win.loadFile(path.join(__dirname, 'icon-source.html'))

  // Tray 用は実行時に読むため assets/ へ（build/ は buildResources 扱いで asar に入らない）
  const assetsDir = path.join(__dirname, '..', 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })
  const targets = [
    { id: 'icon', file: path.join(__dirname, 'icon-1024.png') },
    { id: 'tray2x', file: path.join(assetsDir, 'tray@2x.png') },
    { id: 'tray', file: path.join(assetsDir, 'tray.png') },
  ]
  for (const { id, file } of targets) {
    const dataUrl = await win.webContents.executeJavaScript(
      `document.getElementById('${id}').toDataURL('image/png')`
    )
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'))
    console.log('wrote', path.relative(path.join(__dirname, '..'), file))
  }
  app.quit()
})
