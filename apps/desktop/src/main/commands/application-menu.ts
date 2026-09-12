import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import type { CommandId } from '@markhere/ipc-contract'
import type { ApplicationCommandRegistry } from './command-registry'

/**
 * Native menus are a presentation of the command registry, never a second
 * behavior system. Issue 3 updates CommandContext when document state exists.
 */
export function installApplicationMenu(commands: ApplicationCommandRegistry): () => void {
  const rebuild = (): void => {
    const target = BrowserWindow.getFocusedWindow()
    const commandItem = (id: CommandId): MenuItemConstructorOptions => {
      const definition = commands.definition(id)
      if (!definition) throw new Error(`Missing command definition: ${id}`)
      return {
        label: definition.label,
        ...(definition.accelerator ? { accelerator: definition.accelerator } : {}),
        enabled: commands.isEnabled(id, target),
        click: () => { commands.dispatch(id, 'menu') }
      }
    }

    const template: MenuItemConstructorOptions[] = [
      {
        label: 'File',
        submenu: [
          commandItem('file.new'),
          commandItem('file.open'),
          commandItem('file.openFolder'),
          { type: 'separator' },
          commandItem('file.save'),
          commandItem('file.saveAs'),
          {
            label: 'Export',
            submenu: [
              commandItem('file.export.html'),
              commandItem('file.export.pdf'),
              commandItem('file.export.docx')
            ]
          },
          { type: 'separator' },
          commandItem('app.quit')
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
          { type: 'separator' },
          commandItem('edit.find'),
          commandItem('edit.replace')
        ]
      },
      {
        label: 'View',
        submenu: [
          commandItem('view.mode.preview'),
          commandItem('view.mode.wysiwyg'),
          commandItem('view.mode.source'),
          commandItem('view.mode.split'),
          { type: 'separator' },
          { role: 'toggleDevTools', visible: process.env.NODE_ENV !== 'production' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'MarkHere',
        submenu: [commandItem('app.settings')]
      }
    ]

    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  rebuild()
  const unsubscribe = commands.onChanged(rebuild)
  app.on('browser-window-focus', rebuild)
  return () => {
    unsubscribe()
    app.removeListener('browser-window-focus', rebuild)
  }
}
