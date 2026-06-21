const { ipcMain, BrowserWindow } = require('electron');
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

module.exports = function iniciarRotasVendas() {
    
    // 1. ROTA: Alimentar o PDV
    ipcMain.handle('buscar-dados-venda', async () => {
        try {
            const clientes = await allAsync("SELECT id, nome FROM clientes ORDER BY nome ASC");
            const produtos = await allAsync("SELECT * FROM produtos WHERE quantidade > 0 ORDER BY nome ASC");
            return { clientes, produtos };
        } catch (error) {
            console.error("Erro ao buscar dados para venda:", error);
            throw new Error(error.message);
        }
    });

    // 2. ROTA: Salvar a Venda + Roteamento (Caixa ou Contas a Receber)
    ipcMain.handle('salvar-venda-completa', async (event, dadosVenda) => {
        try {
            await runAsync("BEGIN TRANSACTION");

            const caixaAberto = await getAsync(`SELECT id FROM caixas WHERE status = 'ABERTO'`);
            if (!caixaAberto) throw new Error("CAIXA_FECHADO"); 

            // A. Insere a Venda principal
            const insertVenda = await runAsync(
                `INSERT INTO vendas (cliente_id, total, forma_pagamento) VALUES (?, ?, ?)`,
                [dadosVenda.cliente_id, dadosVenda.total, dadosVenda.forma_pagamento]
            );
            const vendaId = insertVenda.lastID;

            // B. Insere os itens e dá baixa no estoque
            for (const item of dadosVenda.itens) {
                await runAsync(
                    `INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)`,
                    [vendaId, item.produto_id, item.quantidade, item.preco_unitario]
                );
                await runAsync(
                    `UPDATE produtos SET quantidade = quantidade - ? WHERE id = ?`,
                    [item.quantidade, item.produto_id]
                );
            }

            // ==========================================
            // C. LÓGICA DE SEPARAÇÃO: CAIXA OU RECEBÍVEL
            // ==========================================
            if (dadosVenda.forma_pagamento === 'A Prazo') {
                // Se for a prazo, calcula vencimento para daqui a 30 dias
                const dataAtual = new Date();
                dataAtual.setDate(dataAtual.getDate() + 30);
                const vencimentoStr = dataAtual.toISOString().split('T')[0]; // Formato YYYY-MM-DD

                // Joga para Contas a Receber
                await runAsync(
                    `INSERT INTO contas (tipo, descricao, valor, data_vencimento, status) 
                     VALUES ('RECEBER', ?, ?, ?, 'PENDENTE')`,
                    [`Venda #${vendaId} (A Prazo)`, dadosVenda.total, vencimentoStr]
                );
            } else {
                // Pagamento imediato, joga direto na gaveta do caixa
                await runAsync(
                    `INSERT INTO movimentacoes (caixa_id, venda_id, tipo, descricao, valor, forma_pagamento) 
                     VALUES (?, ?, 'ENTRADA', 'Venda PDV', ?, ?)`,
                    [caixaAberto.id, vendaId, dadosVenda.total, dadosVenda.forma_pagamento]
                );
            }

            await runAsync("COMMIT");
            return { sucesso: true, vendaId: vendaId };

        } catch (error) {
            try { await runAsync("ROLLBACK"); } catch (rollbackErr) { console.error(rollbackErr); }
            console.error("Erro na transação de venda:", error);
            throw new Error(error.message); 
        }
    });

    // 3. ROTA: Histórico de Vendas
    ipcMain.handle('buscar-vendas', async () => {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT vendas.*, clientes.nome AS nome_cliente 
                FROM vendas 
                LEFT JOIN clientes ON vendas.cliente_id = clientes.id
                ORDER BY vendas.id DESC
            `;
            db.all(sql, [], (err, linhas) => {
                if (err) reject(err.message);
                else resolve(linhas);
            });
        });
    });

    // 4. ROTA: Cancelar Venda (Estorno Inteligente)
    ipcMain.handle('cancelar-venda', async (event, vendaId) => {
        try {
            await runAsync("BEGIN TRANSACTION");

            const caixaAberto = await getAsync(`SELECT id FROM caixas WHERE status = 'ABERTO'`);
            if (!caixaAberto) throw new Error("CAIXA_FECHADO");

            const venda = await getAsync(`SELECT * FROM vendas WHERE id = ?`, [vendaId]);
            if (!venda) throw new Error("Venda não encontrada.");

            // Devolve os produtos
            const itens = await allAsync(`SELECT produto_id, quantidade FROM itens_venda WHERE venda_id = ?`, [vendaId]);
            for (const item of itens) {
                await runAsync(
                    `UPDATE produtos SET quantidade = quantidade + ? WHERE id = ?`,
                    [item.quantidade, item.produto_id]
                );
            }

            // ==========================================
            // LÓGICA DE ESTORNO DE CAIXA OU RECEBÍVEL
            // ==========================================
            if (venda.forma_pagamento === 'A Prazo') {
                // Se foi a prazo, a gente apenas deleta a cobrança pendente
                await runAsync(`DELETE FROM contas WHERE descricao LIKE ? AND status = 'PENDENTE'`, [`Venda #${vendaId}%`]);
            } else {
                // Se foi à vista, tira o dinheiro da gaveta do caixa atual
                await runAsync(
                    `INSERT INTO movimentacoes (caixa_id, tipo, descricao, valor, forma_pagamento) 
                     VALUES (?, 'SAIDA', ?, ?, ?)`,
                    [caixaAberto.id, `Estorno Venda #${vendaId}`, venda.total, venda.forma_pagamento]
                );
            }

            // Apaga a venda
            await runAsync(`DELETE FROM vendas WHERE id = ?`, [vendaId]);

            await runAsync("COMMIT");
            return { sucesso: true };

        } catch (error) {
            try { await runAsync("ROLLBACK"); } catch (e) {}
            console.error("Erro ao cancelar venda:", error);
            throw new Error(error.message);
        }
    });

    // 5. ROTA: Impressão do Cupom (Recibo Não Fiscal)
    ipcMain.handle('imprimir-recibo', async (event, dadosRecibo) => {
        try {
            let printWindow = new BrowserWindow({
                show: false,
                webPreferences: { nodeIntegration: true }
            });

            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        font-family: 'Courier New', Courier, monospace;
                        width: 300px;
                        margin: 0; padding: 10px; font-size: 12px; color: #000;
                    }
                    .center { text-align: center; }
                    .bold { font-weight: bold; }
                    .line { border-bottom: 1px dashed #000; margin: 8px 0; }
                    table { width: 100%; font-size: 12px; border-collapse: collapse; }
                    .right { text-align: right; }
                    .td-qtd { width: 15%; }
                    .td-nome { width: 55%; }
                    .td-valor { width: 30%; text-align: right; }
                </style>
            </head>
            <body>
                <div class="center bold" style="font-size: 16px;">KODA ERP</div>
                <div class="center">CNPJ: 00.000.000/0001-00</div>
                <div class="center">Rua de Exemplo, 123</div>
                <div class="line"></div>
                <div class="center bold">CUPOM NÃO FISCAL</div>
                <div class="line"></div>
                <div>Venda Nº: ${dadosRecibo.vendaId}</div>
                <div>Data: ${new Date().toLocaleString('pt-BR')}</div>
                <div class="line"></div>
                <table>
                    ${dadosRecibo.itens.map(i => `
                        <tr>
                            <td class="td-qtd">${i.quantidade}x</td>
                            <td class="td-nome">${i.nome}</td>
                            <td class="td-valor">R$ ${(i.quantidade * i.preco_unitario).toFixed(2).replace('.', ',')}</td>
                        </tr>
                    `).join('')}
                </table>
                <div class="line"></div>
                <div class="right bold" style="font-size: 14px;">TOTAL: R$ ${dadosRecibo.total.toFixed(2).replace('.', ',')}</div>
                <div class="right">Pagamento: ${dadosRecibo.forma_pagamento}</div>
                <div class="line"></div>
                <div class="center">Obrigado pela preferência!</div>
                <div class="center">Volte sempre.</div>
            </body>
            </html>
            `;

            printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

            printWindow.webContents.on('did-finish-load', () => {
                printWindow.webContents.print({ silent: false, printBackground: true }, (success, errorType) => {
                    if (!success && errorType !== 'Cancelled') {
                        console.error("Falha ao imprimir:", errorType);
                    }
                    printWindow.close(); 
                });
            });

            return { sucesso: true };
        } catch (error) {
            console.error("Erro ao gerar recibo:", error);
            throw new Error(error.message);
        }
    });
};