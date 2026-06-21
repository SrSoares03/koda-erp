const { ipcMain } = require('electron');
const db = require('../database/connection');

const getAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

module.exports = function iniciarRotasUsuarios() {
    
    // Rota para validar usuário e senha
    ipcMain.handle('fazer-login', async (event, credenciais) => {
        try {
            // Busca o usuário no banco
            const usuario = await getAsync(
                "SELECT id, nome, cargo FROM usuarios WHERE usuario = ? AND senha = ?",
                [credenciais.usuario, credenciais.senha]
            );

            if (usuario) {
                return { sucesso: true, dados: usuario };
            } else {
                return { sucesso: false, mensagem: "Usuário ou senha incorretos." };
            }
        } catch (error) {
            console.error("Erro no login:", error);
            throw new Error("Erro interno ao validar login.");
        }
    });
};