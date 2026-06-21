const { app, BrowserWindow } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// 1. Banco de dados
const db = require('./src/database/connection');

// 2. Importação dos Controllers
const iniciarRotasVendas = require('./src/controllers/VendasController');
const iniciarRotasClientes = require('./src/controllers/ClientesController');
const iniciarRotasProdutos = require('./src/controllers/ProdutosController');
const iniciarRotasDashboard = require('./src/controllers/DashboardController');
const iniciarRotasFinanceiras = require('./src/controllers/FinanceiroController');
const iniciarRotasConfiguracoes = require('./src/controllers/ConfiguracoesController'); 
const iniciarRotasContas = require('./src/controllers/ContasController');

// Escopo global para evitar travamentos
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js') 
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // MODO RAIO-X ATIVADO: Abre o console para vermos os erros
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    // 3. Inicializa todas as rotas
    iniciarRotasVendas();
    iniciarRotasClientes();
    iniciarRotasProdutos();
    iniciarRotasDashboard();
    iniciarRotasFinanceiras();
    iniciarRotasConfiguracoes();
    iniciarRotasContas(); 

    createWindow();
    // ==========================================
    // SISTEMA DE ATUALIZAÇÃO AUTOMÁTICA
    // ==========================================
    
    // Procura por atualizações assim que o app abre
    autoUpdater.checkForUpdatesAndNotify();

    // Avisa no console quando encontrar uma atualização
    autoUpdater.on('update-available', () => {
        console.log('Atualização disponível! Baixando...');
    });

    // Quando o download terminar, avisa o usuário para reiniciar
    autoUpdater.on('update-downloaded', () => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Atualização Pronta',
            message: 'Uma nova versão do Koda ERP foi baixada. O aplicativo será reiniciado para instalar a atualização.',
            buttons: ['Reiniciar Agora']
        }).then(() => {
            autoUpdater.quitAndInstall(false, true);
        });
    });
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (db) {
        db.close((err) => {
            if (err) console.error('Erro ao fechar banco:', err);
            else console.log('🔒 Conexão com banco fechada.');
        });
    }
});