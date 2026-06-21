const { ipcMain } = require('electron');
const db = require('../database/connection');

// Funções auxiliares de Banco de Dados
const allAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const getAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

module.exports = function iniciarRotasDashboard() {
    ipcMain.handle('buscar-resumo-dashboard', async () => {
        try {
            // 1. KPIs Básicos
            const { totalClientes } = await getAsync("SELECT COUNT(*) as totalClientes FROM clientes") || { totalClientes: 0 };
            const { totalProdutos } = await getAsync("SELECT COUNT(*) as totalProdutos FROM produtos") || { totalProdutos: 0 };
            
            // Receita do Mês Atual
            const { receitaTotal } = await getAsync(`
                SELECT SUM(total) as receitaTotal FROM vendas 
                WHERE strftime('%Y-%m', data_venda) = strftime('%Y-%m', 'now', 'localtime')
            `) || { receitaTotal: 0 };

            // 2. Gráfico 1: Vendas dos últimos 7 dias
            const vendasSemana = await allAsync(`
                SELECT date(data_venda) as data, SUM(total) as total_dia
                FROM vendas
                WHERE data_venda >= date('now', '-7 days', 'localtime')
                GROUP BY date(data_venda)
                ORDER BY date(data_venda) ASC
            `);

            // 3. Gráfico 2: Top 5 Produtos mais vendidos
            const produtosMaisVendidos = await allAsync(`
                SELECT p.nome, SUM(iv.quantidade) as total_vendido
                FROM itens_venda iv
                JOIN produtos p ON iv.produto_id = p.id
                GROUP BY p.id
                ORDER BY total_vendido DESC
                LIMIT 5
            `);

            return {
                totalClientes,
                totalProdutos,
                receitaTotal: receitaTotal || 0,
                vendasSemana,
                produtosMaisVendidos
            };
        } catch (error) {
            console.error("Erro no Dashboard:", error);
            throw new Error(error.message);
        }
    });
};