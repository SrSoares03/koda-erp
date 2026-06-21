const { ipcMain } = require('electron');
const db = require('../database/connection');

// Funções auxiliares para o Banco de Dados
const runAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
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

const allAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

module.exports = function iniciarRotasFinanceiras() {

    // 1. VERIFICAR SE EXISTE CAIXA ABERTO
    ipcMain.handle('verificar-caixa-aberto', async () => {
        try {
            const caixa = await getAsync(`SELECT * FROM caixas WHERE status = 'ABERTO' ORDER BY id DESC LIMIT 1`);
            return caixa || null;
        } catch (error) {
            console.error("Erro ao verificar caixa:", error);
            throw new Error(error.message);
        }
    });

    // 2. ABRIR O CAIXA
    ipcMain.handle('abrir-caixa', async (event, valor_inicial) => {
        try {
            // Garante que não tem outro caixa aberto
            const aberto = await getAsync(`SELECT id FROM caixas WHERE status = 'ABERTO'`);
            if (aberto) throw new Error("Já existe um caixa aberto no momento.");

            const insert = await runAsync(
                `INSERT INTO caixas (valor_inicial, status) VALUES (?, 'ABERTO')`,
                [valor_inicial]
            );
            return { sucesso: true, caixaId: insert.lastID };
        } catch (error) {
            console.error("Erro ao abrir caixa:", error);
            throw new Error(error.message);
        }
    });

    // 3. LANÇAR MOVIMENTAÇÃO MANUAL (Entradas avulsas ou Saídas/Despesas)
    ipcMain.handle('lancar-movimentacao', async (event, mov) => {
        try {
            const insert = await runAsync(
                `INSERT INTO movimentacoes (caixa_id, tipo, descricao, valor, forma_pagamento) 
                 VALUES (?, ?, ?, ?, ?)`,
                [mov.caixa_id, mov.tipo, mov.descricao, mov.valor, mov.forma_pagamento]
            );
            return { sucesso: true, movId: insert.lastID };
        } catch (error) {
            console.error("Erro ao lançar movimentação:", error);
            throw new Error(error.message);
        }
    });

    // 4. BUSCAR RESUMO DO CAIXA ATUAL (Para exibir na tela financeira)
    ipcMain.handle('resumo-caixa', async (event, caixa_id) => {
        try {
            const caixa = await getAsync(`SELECT * FROM caixas WHERE id = ?`, [caixa_id]);
            const movimentacoes = await allAsync(`SELECT * FROM movimentacoes WHERE caixa_id = ? ORDER BY id DESC`, [caixa_id]);
            
            // Calcula os totais (Entradas e Saídas)
            let totalEntradas = 0;
            let totalSaidas = 0;

            movimentacoes.forEach(m => {
                if (m.tipo === 'ENTRADA') totalEntradas += m.valor;
                if (m.tipo === 'SAIDA') totalSaidas += m.valor;
            });

            const saldoAtual = caixa.valor_inicial + totalEntradas - totalSaidas;

            return {
                caixa,
                movimentacoes,
                totais: {
                    entradas: totalEntradas,
                    saidas: totalSaidas,
                    saldoAtual: saldoAtual
                }
            };
        } catch (error) {
            console.error("Erro ao buscar resumo do caixa:", error);
            throw new Error(error.message);
        }
    });

    // 5. FECHAR O CAIXA
    ipcMain.handle('fechar-caixa', async (event, dadosFechamento) => {
        try {
            await runAsync(
                `UPDATE caixas 
                 SET data_fechamento = datetime('now', 'localtime'), 
                     valor_final_sistema = ?, 
                     valor_final_informado = ?, 
                     status = 'FECHADO' 
                 WHERE id = ?`,
                [dadosFechamento.valor_final_sistema, dadosFechamento.valor_final_informado, dadosFechamento.caixa_id]
            );
            return { sucesso: true };
        } catch (error) {
            console.error("Erro ao fechar caixa:", error);
            throw new Error(error.message);
        }
    });
};