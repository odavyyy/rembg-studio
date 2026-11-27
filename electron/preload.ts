// Ponte minima e tipada entre a interface (sem Node) e o processo principal.
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api } from '../shared/types'

const call = (name: string) => (...args: unknown[]) => ipcRenderer.invoke(name, ...args)
const on = (channel: string) => (cb: (v: any) => void) => {
  const fn = (_: unknown, v: unknown) => cb(v)
  ipcRenderer.on(channel, fn)
  return () => void ipcRenderer.removeListener(channel, fn)
}

const names = [
  'getInitialState', 'setSettings', 'addPaths', 'addFromDialog', 'removeItems', 'clearItems', 'process', 'cancel',
  'renameItem', 'saveOne', 'saveMany', 'chooseFolder', 'choosePython', 'reveal', 'openPath', 'historyRemove',
  'historyClear', 'historyOpen', 'getEnv', 'gpuInfo', 'gpuTest', 'downloadModel', 'restartWorker', 'namePreview',
]

const api = {
  ...Object.fromEntries(names.map((n) => [n, call(n)])),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  onItems: on('items'),
  onItemPatch: on('item'),
  onHistory: on('history'),
  onWorker: on('worker'),
  onStats: on('stats'),
  onToast: on('toast'),
  onSettings: on('settings'),
} as unknown as Api

contextBridge.exposeInMainWorld('api', api)
