import path from 'path'
import fs from 'fs'
import { app, ipcMain, dialog, BrowserWindow, shell, Tray, nativeImage } from 'electron'
import serve from 'electron-serve'
import { v4 as uuidv4 } from 'uuid'
import { createWindow, createChildWindow, rightClickMenu } from './electron-utils'
import { AdoptionService } from './utils'
import { TemplateAdoption } from '../types/TemplateAdoption'
import { matchEnrollment, submitEnrollment } from './processes/enrollment'
import { getTermDecisions, getFileDecisions } from './processes/decision'
import { sqlDB, fileSys } from './utils'

const isProd = process.env.NODE_ENV === 'production'
const iconPath = path.join(__dirname, '..', 'renderer', 'public', 'images', 'owl.ico')
const appHomeURL = isProd ? 'app://./home' : `http://localhost:${process.argv[2]}/home`

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

let mainWindow: BrowserWindow | undefined
let childWindow: BrowserWindow | undefined
let adoptionWindow: BrowserWindow | undefined
let tray: Tray

  ; (async () => {
    await app.whenReady()

    mainWindow = createWindow('main', {
      width: 830,
      height: 630,
      icon: iconPath,
      frame: false,
      titleBarStyle: 'hidden',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js')
      },
    })

    // Tray
    const icon = nativeImage.createFromPath(iconPath)
    tray = new Tray(icon)
    tray.setToolTip('OwlGuide')

    await mainWindow.loadURL(appHomeURL)

    if (!isProd) {
      // Load React DevTools only if in development
      const { default: installExtension, REACT_DEVELOPER_TOOLS } = require('electron-devtools-installer')
      installExtension(REACT_DEVELOPER_TOOLS)
        .then((name: string) => console.log(`Added Extension:  ${name}`))
        .catch((err: Error) => console.log('An error occurred: ', err))
    }
  })()

app.on('window-all-closed', () => {
  app.quit()
})

// On app initialization, check for mode and version
ipcMain.on('initialize', async (event) => {
  event.reply('initialize-success', { isDev: !isProd, appVer: app.getVersion() })
})

// Header Processes
ipcMain.on('minimize-app', (event) => {
  const window = BrowserWindow.getFocusedWindow()
  if (window) window.minimize()
})

ipcMain.on('close-app', (event) => {
  const window = BrowserWindow.getFocusedWindow()
  if (window) window.close()
})

ipcMain.on('open-github', (event) => {
  shell.openExternal("https://github.com/brettupton/owlguide")
})

// Right Mouse Click Menu
ipcMain.on('context-menu', (event, { x, y, query }: { x: number, y: number, query: string }) => {
  const contextMenu = rightClickMenu(x, y, query, mainWindow)
  contextMenu.popup({ window: mainWindow })
})

ipcMain.on('close-child', () => {
  if (childWindow) {
    childWindow.close()
    childWindow = null
  }
})

ipcMain.on('enrollment', async (event, { method, data }) => {
  switch (method) {
    case 'file-upload':
      try {
        const { enrollment, filePath } = await matchEnrollment(data[0])
        event.reply('enrollment-data', { enrollment, filePath })
      } catch (error) {
        console.error(error)
        dialog.showErrorBox("Enrollment", `${error}\n\nContact dev for assistance.`)
        event.reply('file-error')
      }
      break

    case 'file-download':
      try {
        const { fileName, csv } = await submitEnrollment(data.enrollment, data.filePath)

        dialog.showSaveDialog({
          defaultPath: path.join(app.getPath('downloads'), `${fileName}_Formatted`),
          filters: [{ name: 'CSV Files', extensions: ['csv'] }]
        })
          .then(async (result) => {
            if (!result.canceled && result.filePath) {
              fs.writeFile(result.filePath, csv, (err) => {
                if (err) {
                  throw Error("Couldn't write CSV to selected path.")
                }
                event.reply('enrl-success')
              })
            }
          })
      } catch (error) {
        console.error(error)
        dialog.showErrorBox("Enrollment", `${error}\n\nContact dev for assistance.`)
      }
      break
  }
})

ipcMain.on('sql', async (event, { method, data }) => {
  switch (method) {
    case "get-table-page":
      try {
        const { rows, total } = await sqlDB.all.getTablePage(data.name, data.offset, data.limit)
        event.reply('table-page', { rows, total })
      } catch (error) {
        console.error(error)
        dialog.showErrorBox("SQL", `Check the console.`)
      }
      break

    case "get-terms":
      try {
        const terms = await sqlDB.all.getAllTermList()
        event.reply("term-list", { terms })
      } catch (error) {
        console.error(error)
        dialog.showErrorBox("SQL", `Check the console.`)
      }
      break

    case "replace-table":
      console.log("Replacing tables.")

      console.time('SQL')
      for (const filePath of data) {
        await sqlDB.tables.replaceTable(filePath)
        console.log(`${filePath} finished.`)
      }

      console.timeEnd('SQL')
      break
  }
})

ipcMain.on('decision', async (event, { method, data }) => {
  switch (method) {
    case 'file-upload':
      try {
        const { decisions, term } = await getFileDecisions(data[0])
        event.reply('decision-data', { decisions, term })
      } catch (error) {
        console.error(error)
        dialog.showErrorBox("Decision", `${error}\n\nContact dev for assistance.`)
        event.reply('file-error')
      }
      break

    case "get-term-decision":
      try {
        console.log(`Getting decisions for ${data.term}`)
        const { decisions, term } = await getTermDecisions(data.term)
        event.reply('decision-data', { decisions, term })
      } catch (error) {
        console.error(error)
        dialog.showErrorBox("Decision", `${error}\n\nContact dev for assistance.`)
        event.reply('decision-data', [])
      }
      break

    case "child-decision":
      try {
        if (!childWindow) {
          childWindow = await createChildWindow(mainWindow, "decision-history", "right")
        }

        const [term, year] = data.term.match(/[a-zA-z]|\d+/g)
        const salesHistory = await sqlDB.sales.getAllPrevSalesByBook(term, year, data.isbn, data.title)

        childWindow.webContents.send('history', salesHistory)
      } catch (error) {
        console.error(error)
        dialog.showErrorBox("Decision", `${error}\n\nContact dev for assistance.`)
      }
      break
  }
})

// ** ADOPTIONS **
ipcMain.on('adoption-upload', async (event, filePath: string) => {
  const adoptionService = new AdoptionService(filePath)
  try {
    const term = await adoptionService.getTerm()
    const campus = await adoptionService.getCampus()
    const allCourses = await adoptionService.getCourses()

    event.reply('adoption-data', { allCourses, term, campus })

  } catch (err) {
    console.error(err)
    dialog.showErrorBox("Adoption Error", "There was an error parsing adoption data.\n\n Please try again.")
  }
})

ipcMain.on('new-template-course', (event, { Course, Title, term, campus }: { Course: string, Title: string, term: string, campus: string }) => {
  adoptionWindow.webContents.send('new-course', { Course, Title, term, campus })
})

ipcMain.on('template-submit', (event, { templateCourses, term, campus }: { templateCourses: TemplateAdoption[], term: string, campus: string }) => {
  // Get current date and unique ID for filename
  const formattedDate = new Date().toJSON().slice(0, 10).split("-").join("")
  const uniqueId = uuidv4().split('-')[0]

  const adoptionService = new AdoptionService()
  try {
    const csv = adoptionService.downloadCSV(templateCourses, term, campus)
    dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), `AIP_${term[0] + term.slice(-2)}_${formattedDate}_${uniqueId}`),
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    })
      .then(result => {
        if (!result.canceled && result.filePath) {
          fs.writeFile(result.filePath, csv, 'utf8', (err) => {
            if (err) {
              throw new Error()
            }
            mainWindow.webContents.send('download-success')
          })
        }
      })
    // TODO: Move unsubmitted courses to submitted and resend data
    // For now, refresh the page on client
  } catch (err) {
    dialog.showErrorBox("Error", "Error downloading template.\n\nPlease try again.")
  }
})
