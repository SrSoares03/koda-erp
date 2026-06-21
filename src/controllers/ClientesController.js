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
    ipcMain.handle('salvar-cliente', async (event, cliente) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO clientes (nome, documento, telefone, email) VALUES (?, ?, ?, ?)`,
                [cliente.nome, cliente.documento, cliente.telefone, cliente.email],
                function(err) {
                    if (err) reject(err.message);
                    else resolve(this.lastID);
                }
            );
        });
    });

    // EDITAR
    ipcMain.handle('atualizar-cliente', async (event, cliente) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE clientes SET nome = ?, documento = ?, telefone = ?, email = ? WHERE id = ?`,
                [cliente.nome, cliente.documento, cliente.telefone, cliente.email, cliente.id],
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