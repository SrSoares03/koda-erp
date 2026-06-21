const { ipcMain } = require('electron');
const db = require('../database/connection');

// Funções auxiliares
const runAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
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

const getAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

module.exports = function iniciarRotasContas() {

    // 1. LISTAR TODAS AS CONTAS
    ipcMain.handle('buscar-contas', async () => {
        try {
            // Retorna as contas organizadas por data de vencimento
            return await allAsync("SELECT * FROM contas ORDER BY data_vencimento ASC");
        } catch (error) {
            console.error("Erro ao buscar contas:", error);
            throw new Error(error.message);
        }
    });

    // 2. CADASTRAR NOVA CONTA (A PAGAR OU RECEBER)
    ipcMain.handle('salvar-conta', async (event, conta) => {
        try {
            const insert = await runAsync(
                `INSERT INTO contas (tipo, descricao, valor, data_vencimento, status) VALUES (?, ?, ?, ?, 'PENDENTE')`,
                [conta.tipo, conta.descricao, conta.valor, conta.data_vencimento]
            );
            return { sucesso: true, id: insert.lastID };
        } catch (error) {
            console.error("Erro ao salvar conta:", error);
            throw new Error(error.message);
        }
    });

    // 3. DAR BAIXA EM UMA CONTA (INTEGRAÇÃO COM O CAIXA)
    ipcMain.handle('baixar-conta', async (event, contaId) => {
        try {
            // Inicia uma transação para garantir que se o caixa estiver fechado, nada mude
            await runAsync("BEGIN TRANSACTION");

            // A. Verifica se há um caixa aberto no momento para receber/pagar o dinheiro
            const caixaAberto = await getAsync(`SELECT id FROM caixas WHERE status = 'ABERTO'`);
            if (!caixaAberto) throw new Error("CAIXA_FECHADO");

            // B. Busca os dados da conta que vai ser baixada
            const conta = await getAsync(`SELECT * FROM contas WHERE id = ?`, [contaId]);
            if (!conta) throw new Error("Conta não encontrada.");
            if (conta.status === 'PAGO') throw new Error("Esta conta já foi baixada.");

            // C. Atualiza o status da conta para PAGO
            await runAsync(
                `UPDATE contas SET status = 'PAGO', data_pagamento = datetime('now', 'localtime') WHERE id = ?`,
                [contaId]
            );

            // D. Copia o valor automaticamente para o Fluxo de Caixa (movimentacoes)
            const tipoMovimentacao = conta.tipo === 'RECEBER' ? 'ENTRADA' : 'SAIDA';
            const descricaoMov = `${conta.tipo === 'RECEBER' ? 'Recb.' : 'Pagamento:'} ${conta.descricao}`;
            
            await runAsync(
                `INSERT INTO movimentacoes (caixa_id, tipo, descricao, valor, forma_pagamento) 
                 VALUES (?, ?, ?, ?, 'Dinheiro')`,
                [caixaAberto.id, tipoMovimentacao, descricaoMov, conta.valor]
            );

            await runAsync("COMMIT");
            return { sucesso: true };

        } catch (error) {
            try { await runAsync("ROLLBACK"); } catch (e) {}
            console.error("Erro ao baixar conta:", error);
            throw new Error(error.message);
        }
    });

    // 4. EXCLUIR CONTA PENDENTE
    ipcMain.handle('excluir-conta', async (event, id) => {
        try {
            await runAsync(`DELETE FROM contas WHERE id = ?`, [id]);
            return { sucesso: true };
        } catch (error) {
            console.error("Erro ao excluir conta:", error);
            throw new Error(error.message);
        }
    });
};