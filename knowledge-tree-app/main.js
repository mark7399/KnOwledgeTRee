const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { startServer } = require('./server/server');

let mainWindow;
let serverInstance;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  // 设置菜单
  const menu = Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '新建知识树', click: () => mainWindow.webContents.send('new-tree') },
        { label: '保存', click: () => mainWindow.webContents.send('save-tree') },
        { label: '加载', click: () => mainWindow.webContents.send('load-tree') },
        { type: 'separator' },
        { label: '退出', click: () => app.quit() }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { label: '重置缩放', role: 'resetZoom' }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  // 启动后端服务器
  serverInstance = await startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (serverInstance) {
      serverInstance.close();
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC通信处理
ipcMain.handle('get-server-port', () => {
  return serverInstance ? serverInstance.address().port : 3000;
}); 