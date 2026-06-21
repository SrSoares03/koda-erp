const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // 1. Função para INVOCAR o backend e esperar resposta
    invoke: (canal, dados) => {
        // LISTA BRANCA DEFINITIVA
        const canaisPermitidos = [
            'buscar-resumo-dashboard',
            'buscar-dados-venda',
            'salvar-venda-completa',
            'buscar-vendas',
            'cancelar-venda',
            'imprimir-recibo',
            'buscar-clientes',
            'salvar-cliente',
            'atualizar-cliente',
            'excluir-cliente',
            'buscar-produtos',
            'salvar-produto',
            'atualizar-produto',
            'excluir-produto',
            'verificar-caixa-aberto',
            'abrir-caixa',
            'lancar-movimentacao',
            'resumo-caixa',
            'buscar-configuracoes',
            'salvar-configuracoes',
            'fechar-caixa',
            'buscar-contas',
            'salvar-conta',
            'baixar-conta',
            'fazer-login',
            'excluir-conta',
            'buscar-produto-por-codigo',
            'instalar-atualizacao' // <-- Atualizador adicionado aqui!
        ];

        if (canaisPermitidos.includes(canal)) {
            return ipcRenderer.invoke(canal, dados);
        } else {
            console.error(`Bloqueado: Tentativa de acesso a canal não autorizado (${canal})`);
            throw new Error('Acesso Negado');
        }
    },
    
    // 2. Função para ESCUTAR eventos que vêm do main.js sozinhos (ex: download pronto)
    on: (channel, func) => {
        let validChannels = ['atualizacao-baixada'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    }
});