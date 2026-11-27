// Gera docs/banner.png e docs/banner.pt-BR.png (1280x640) a partir de docs/art/:  npm run art
const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')
const { writeFileSync } = require('node:fs')

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 640, useContentSize: true, show: false, frame: false, webPreferences: { offscreen: true } })
  for (const nome of ['banner', 'banner.pt-BR']) {
    await win.loadFile(join(__dirname, '..', 'docs', 'art', nome + '.html'))
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    await new Promise((r) => setTimeout(r, 600))
    const image = (await win.webContents.capturePage()).resize({ width: 1280, height: 640 })
    const out = join(__dirname, '..', 'docs', nome + '.png')
    writeFileSync(out, image.toPNG())
    console.log(out, image.getSize())
  }
  app.quit()
})
