const { ipcMain } = require('electron');
const db = require('../database/connection');

module.exports = function iniciarRotasProdutos() {
    
    // LISTAR TODOS
    ipcMain.handle('buscar-produtos', async () => {
        return new Promise((resolve, reject) => {
            db.all("SELECT * FROM produtos ORDER BY nome ASC", [], (err, linhas) => {
                if (err) reject(err.message);
                else resolve(linhas);
            });
        });
    });

    // BUSCAR POR CÓDIGO (Usado pelo Leitor de Código de Barras no PDV)
    ipcMain.handle('buscar-produto-por-codigo', async (event, codigo) => {
        return new Promise((resolve, reject) => {
            db.get("SELECT * FROM produtos WHERE codigo_barras = ?", [codigo], (err, linha) => {
                if (err) reject(err.message);
                else resolve(linha); // Retorna o produto ou undefined se não achar
            });
        });
    });

    // CRIAR
    ipcMain.handle('salvar-produto', async (event, prod) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO produtos (nome, medida, custo, venda, quantidade, codigo_barras) VALUES (?, ?, ?, ?, ?, ?)`,
                [prod.nome, prod.medida, prod.custo, prod.venda, prod.quantidade, prod.codigo_barras || null], 
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
            db.run(`UPDATE produtos SET nome = ?, medida = ?, custo = ?, venda = ?, quantidade = ?, codigo_barras = ? WHERE id = ?`,
                [prod.nome, prod.medida, prod.custo, prod.venda, prod.quantidade, prod.codigo_barras || null, prod.id],
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