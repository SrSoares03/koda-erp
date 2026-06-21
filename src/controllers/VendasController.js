const { ipcMain, BrowserWindow } = require('electron');
const db = require('../database/connection');

// Funções auxiliares
const runAsync = (query, params = []) => new Promise((resolve, reject) => {
    db.run(query, params, function (err) { err ? reject(err) : resolve(this); });
});

const allAsync = (query, params = []) => new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => { err ? reject(err) : resolve(rows); });
});

const getAsync = (query, params = []) => new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => { err ? reject(err) : resolve(row); });
});

module.exports = function iniciarRotasVendas() {
    
    // 1. ROTA: Alimentar o PDV
    ipcMain.handle('buscar-dados-venda', async () => {
        try {
            const clientes = await allAsync("SELECT id, nome FROM clientes ORDER BY nome ASC");
            const produtos = await allAsync("SELECT * FROM produtos ORDER BY nome ASC");
            return { clientes, produtos };
        } catch (error) {
            console.error("Erro PDV:", error);
            throw new Error(error.message);
        }
    });

    // 2. ROTA: Buscar Vendas
    ipcMain.handle('buscar-vendas', async () => {
        try {
            return await allAsync(`
                SELECT vendas.*, clientes.nome AS nome_cliente 
                FROM vendas 
                LEFT JOIN clientes ON vendas.cliente_id = clientes.id
                ORDER BY vendas.id DESC
            `);
        } catch (error) {
            console.error("Erro buscar vendas:", error);
            throw new Error(error.message);
        }
    });

    // 3. ROTA: Buscar Dados para o Recibo
    ipcMain.handle('buscar-dados-recibo', async (event, vendaId) => {
        try {
            const venda = await getAsync("SELECT * FROM vendas WHERE id = ?", [vendaId]);
            const itens = await allAsync(`
                SELECT itens_venda.*, produtos.nome 
                FROM itens_venda 
                JOIN produtos ON itens_venda.produto_id = produtos.id 
                WHERE venda_id = ?`, [vendaId]);
            
            return {
                vendaId: venda.id,
                cliente_id: venda.cliente_id,
                total: venda.total,
                forma_pagamento: venda.forma_pagamento,
                itens: itens
            };
        } catch (error) {
            throw new Error("Erro ao buscar dados do recibo.");
        }
    });

    // 4. ROTA: Salvar Venda
    ipcMain.handle('salvar-venda-completa', async (event, dadosVenda) => {
        try {
            await runAsync("BEGIN TRANSACTION");
            const insertVenda = await runAsync(
                `INSERT INTO vendas (cliente_id, total, forma_pagamento) VALUES (?, ?, ?)`,
                [dadosVenda.cliente_id, dadosVenda.total, dadosVenda.forma_pagamento]
            );
            const vendaId = insertVenda.lastID;

            for (const item of dadosVenda.itens) {
                await runAsync(
                    `INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)`,
                    [vendaId, item.produto_id, item.quantidade, item.preco_unitario]
                );
            }

            if (dadosVenda.forma_pagamento === 'A Prazo') {
                const data = new Date();
                data.setDate(data.getDate() + 30);
                await runAsync(
                    `INSERT INTO contas (tipo, descricao, valor, data_vencimento, status) VALUES ('RECEBER', ?, ?, ?, 'PENDENTE')`,
                    [`Venda #${vendaId}`, dadosVenda.total, data.toISOString().split('T')[0]]
                );
            } else {
                await runAsync(
                    `INSERT INTO movimentacoes (caixa_id, venda_id, tipo, descricao, valor, forma_pagamento) VALUES (NULL, ?, 'ENTRADA', 'Venda PDV', ?, ?)`,
                    [vendaId, dadosVenda.total, dadosVenda.forma_pagamento]
                );
            }
            await runAsync("COMMIT");
            return { sucesso: true, vendaId: vendaId };
        } catch (error) {
            await runAsync("ROLLBACK").catch(() => {});
            throw new Error(error.message); 
        }
    });

    // 5. ROTA: Cancelar Venda
    ipcMain.handle('cancelar-venda', async (event, vendaId) => {
        try {
            await runAsync("BEGIN TRANSACTION");
            const venda = await getAsync(`SELECT * FROM vendas WHERE id = ?`, [vendaId]);
            if (!venda) throw new Error("Venda não encontrada.");

            if (venda.forma_pagamento === 'A Prazo') {
                await runAsync(`DELETE FROM contas WHERE descricao LIKE ? AND status = 'PENDENTE'`, [`Venda #${vendaId}%`]);
            } else {
                await runAsync(
                    `INSERT INTO movimentacoes (caixa_id, tipo, descricao, valor, forma_pagamento) VALUES (NULL, 'SAIDA', ?, ?, ?)`,
                    [`Estorno Venda #${vendaId}`, venda.total, venda.forma_pagamento]
                );
            }
            await runAsync(`DELETE FROM vendas WHERE id = ?`, [vendaId]);
            await runAsync("COMMIT");
            return { sucesso: true };
        } catch (error) {
            await runAsync("ROLLBACK").catch(() => {});
            throw new Error(error.message);
        }
    });

    // 6. ROTA: Imprimir Recibo
    ipcMain.handle('imprimir-recibo', async (event, dadosRecibo) => {
        let printWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true } });
        try {
            const config = await getAsync("SELECT * FROM configuracoes LIMIT 1");
            const cliente = dadosRecibo.cliente_id ? await getAsync("SELECT * FROM clientes WHERE id = ?", [dadosRecibo.cliente_id]) : null;

            const gerarVia = (via) => `
                <div class="container-recibo">
                    <div class="header-grid">
                        <div class="logo-area">
                            ${config?.logo ? `<img src="${config.logo}" style="max-height: 70px; max-width: 140px;">` : '<div style="width:100px; height:60px; border:1px solid #ccc; font-size:9px;">LOGO</div>'}
                        </div>
                        <div class="empresa-area">
                            <h1 style="margin:0; font-size:16px;">${config?.nome_fantasia || 'NOME DA EMPRESA'}</h1>
                            <p style="margin:2px 0; font-size:10px;">${config?.endereco_completo || ''}</p>
                            <p style="margin:0; font-size:10px;">CNPJ: ${config?.documento || ''} | TEL: ${config?.telefone || ''}</p>
                        </div>
                    </div>
                    
                    <div class="header" style="border-top:1px solid #000; margin-top:10px;">
                        <h2 style="font-size: 14px; margin: 5px 0; text-align: center;">RECIBO DE ENTREGA - PEDIDO #${dadosRecibo.vendaId}</h2>
                    </div>

                    <div class="cliente-info">
                        <strong>CLIENTE:</strong> ${cliente?.nome || 'CLIENTE AVULSO'} | 
                        <strong>CPF/CNPJ:</strong> ${cliente?.documento || '---'} <br>
                        <strong>ENDEREÇO:</strong> ${cliente?.endereco || '---'} | 
                        <strong>TEL:</strong> ${cliente?.telefone || '---'}
                    </div>

                    <table class="tabela-itens">
                        <thead>
                            <tr>
                                <th style="text-align: left;">Descrição</th>
                                <th style="text-align: center;">Qtd</th>
                                <th style="text-align: right;">Vl.Unit</th>
                                <th style="text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dadosRecibo.itens.map(i => `
                                <tr>
                                    <td>${i.nome}</td>
                                    <td style="text-align: center;">${i.quantidade}</td>
                                    <td style="text-align: right;">R$ ${i.preco_unitario.toFixed(2).replace('.',',')}</td>
                                    <td style="text-align: right;">R$ ${(i.quantidade * i.preco_unitario).toFixed(2).replace('.',',')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div class="total-bar">TOTAL: R$ ${dadosRecibo.total.toFixed(2).replace('.',',')}</div>
                    <div style="font-size: 11px; margin-top:5px;"><strong>PAGAMENTO:</strong> ${dadosRecibo.forma_pagamento}</div>
                    
                    <div class="assinatura">
                        <p>_________________________________________________</p>
                        <p>Assinatura do Recebedor (${via})</p>
                    </div>
                </div>
            `;

            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Arial', sans-serif; padding: 0; margin: 0; }
                    /* Cada via ocupa 48% da altura da folha, deixando espaço para margens */
                    .container-recibo { 
                        width: 95%; 
                        height: 46vh; 
                        margin: 5px auto; 
                        padding: 10px; 
                        border: 2px solid #000; 
                        border-radius: 10px;
                        box-sizing: border-box;
                        display: flex;
                        flex-direction: column;
                    }
                    .header-grid { display: flex; align-items: center; justify-content: space-between; }
                    .logo-area { flex: 0 0 120px; }
                    .empresa-area { flex: 1; text-align: right; }
                    .cliente-info { font-size: 10px; border: 1px solid #000; padding: 4px; margin: 5px 0; background: #f9f9f9; }
                    .tabela-itens { width: 100%; border-collapse: collapse; margin-top: 5px; }
                    .tabela-itens th { font-size: 10px; border-bottom: 2px solid #000; padding: 3px; }
                    .tabela-itens td { font-size: 10px; padding: 3px; border-bottom: 1px solid #eee; }
                    .total-bar { text-align: right; font-size: 14px; font-weight: bold; border-top: 1px solid #000; padding-top: 3px; margin-top: auto; }
                    .assinatura { margin-top: 10px; text-align: center; font-size: 9px; }
                </style>
            </head>
            <body>
                ${gerarVia('1ª VIA - CLIENTE')}
                ${gerarVia('2ª VIA - LOJA')}
            </body>
            </html>`;

            printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

            return new Promise((resolve) => {
                printWindow.webContents.on('did-finish-load', () => {
                    // pageSize 'A4' garantirá que o conteúdo caiba inteiramente na folha
                    printWindow.webContents.print({ pageSize: 'A4', silent: false }, () => {
                        printWindow.close();
                        resolve({ sucesso: true });
                    });
                });
            });
        } catch (error) {
            printWindow.close();
            throw error;
        }
    });
};