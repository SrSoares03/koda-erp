const { ipcMain } = require('electron');
const db = require('../database/connection');

module.exports = function iniciarRotasClientes() {
    
    // LISTAR
    ipcMain.handle('buscar-clientes', async () => {
        return new Promise((resolve, reject) => {
            db.all("SELECT * FROM clientes ORDER BY nome ASC", [], (err, linhas) => {
                if (err) reject(err.message);
                else resolve(linhas);
            });
        });
    });

    // CRIAR
    ipcMain.handle('salvar-cliente', async (event, cli) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO clientes (nome, documento, telefone, email, endereco) VALUES (?, ?, ?, ?, ?)`,
                [cli.nome, cli.documento, cli.telefone, cli.email, cli.endereco],
                function(err) {
                    if (err) reject(err.message);
                    else resolve(this.lastID);
                }
            );
        });
    });

    // EDITAR
    ipcMain.handle('atualizar-cliente', async (event, cli) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE clientes SET nome = ?, documento = ?, telefone = ?, email = ?, endereco = ? WHERE id = ?`,
                [cli.nome, cli.documento, cli.telefone, cli.email, cli.endereco, cli.id],
                function(err) {
                    if (err) reject(err.message);
                    else resolve(true);
                }
            );
        });
    });

    // EXCLUIR
    ipcMain.handle('excluir-cliente', async (event, id) => {
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM clientes WHERE id = ?`, [id], (err) => {
                if (err) reject(err.message);
                else resolve(true);
            });
        });
    });
};