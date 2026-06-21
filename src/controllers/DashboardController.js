const { ipcMain } = require('electron');
const db = require('../database/connection');

// Função auxiliar (parecida com a que você fez nas Vendas) 
// para simplificar as consultas que retornam apenas um valor
const getAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err.message);
            else resolve(row);
        });
    });
};

module.exports = function iniciarRotasDashboard() {
    
    // BUSCAR RESUMO PARA A TELA INICIAL (DASHBOARD)
    ipcMain.handle('buscar-resumo-dashboard', async () => {
        try {
            // Consulta o banco de dados
            const clientes = await getAsync("SELECT COUNT(*) AS total FROM clientes");
            const produtos = await getAsync("SELECT COUNT(*) AS total FROM produtos");
            const vendas = await getAsync("SELECT SUM(total) AS receita FROM vendas");

            // Retorna um objeto consolidado para o front-end
            return {
                totalClientes: clientes ? clientes.total : 0,
                totalProdutos: produtos ? produtos.total : 0,
                receitaTotal: (vendas && vendas.receita) ? vendas.receita : 0
            };

        } catch (error) {
            console.error("Erro ao carregar dashboard:", error);
            throw new Error(error); // Retorna o erro para o IPC
        }
    });

};