const { app, BrowserWindow, ipcMain } = require('electron'); // <-- ipcMain adicionado aqui!
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
const iniciarRotasUsuarios = require('./src/controllers/UsuariosController');

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
    iniciarRotasUsuarios(); 

    createWindow();

    // ==========================================
    // SISTEMA DE ATUALIZAÇÃO AUTOMÁTICA
    // ==========================================
    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('update-available', () => {
        console.log('Atualização encontrada! Baixando em segundo plano...');
    });

    // 1. Quando o download terminar, em vez de abrir um alerta do Windows, envia um aviso para o HTML!
    autoUpdater.on('update-downloaded', () => {
        // Pega a janela aberta do ERP e manda a mensagem 'atualizacao-baixada'
        const janelas = BrowserWindow.getAllWindows();
        if (janelas.length > 0) {
            janelas[0].webContents.send('atualizacao-baixada');
        }
    });

    // 2. Rota que o botão "Reiniciar e Atualizar" do HTML vai chamar
    ipcMain.handle('instalar-atualizacao', () => {
        autoUpdater.quitAndInstall(false, true); // Fecha o sistema e aplica a atualização
    });

}); // <-- ESTA CHAVE E PARÊNTESE ESTAVAM FALTANDO!

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