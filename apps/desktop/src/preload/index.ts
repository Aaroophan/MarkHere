import { contextBridge } from 'electron'
import { markhereBridge } from './bridge'

contextBridge.exposeInMainWorld('markhere', markhereBridge)
