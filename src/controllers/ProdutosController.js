const { ipcMain } = require('electron');
const db = require('../database/connection');

module.exports = function iniciarRotasProdutos() {
    
    // LISTAR
    ipcMain.handle('buscar-produtos', async () => {
        return new Promise((resolve, reject) => {
            db.all("SELECT * FROM produtos ORDER BY nome ASC", [], (err, linhas) => {
                if (err) reject(err.message);
                else resolve(linhas);
            });
        });
    });

    // CRIAR
    ipcMain.handle('salvar-produto', async (event, prod) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO produtos (nome, medida, custo, venda, quantidade) VALUES (?, ?, ?, ?, ?)`,
                [prod.nome, prod.medida, prod.custo, prod.venda, prod.quantidade], 
                function(err) {
                    if (err) reject(err.message);
                    else resolve(this.lastID); 
                }
            );
        });
    });

    // EDITAR
    ipcMain.handle('atualizar-produto', async (event, prod) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE produtos SET nome = ?, medida = ?, custo = ?, venda = ?, quantidade = ? WHERE id = ?`,
                [prod.nome, prod.medida, prod.custo, prod.venda, prod.quantidade, prod.id],
                function(err) {
                    if (err) reject(err.message);
                    else resolve(true);
                }
            );
        });
    });

    // EXCLUIR
    ipcMain.handle('excluir-produto', async (event, id) => {
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM produtos WHERE id = ?`, [id], (err) => {
                if (err) reject(err.message);
                else resolve(true);
            });
        });
    });
};