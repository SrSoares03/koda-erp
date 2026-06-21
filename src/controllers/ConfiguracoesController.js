const { ipcMain } = require('electron');
const db = require('../database/connection');

const getAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const runAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

module.exports = function iniciarRotasConfiguracoes() {
    
    // Buscar os dados do assinante
    ipcMain.handle('buscar-configuracoes', async () => {
        try {
            const config = await getAsync("SELECT * FROM configuracoes LIMIT 1");
            return config;
        } catch (error) {
            console.error("Erro ao buscar dados do assinante:", error);
            throw new Error(error.message);
        }
    });

    // Salvar/Atualizar os dados do assinante
    ipcMain.handle('salvar-configuracoes', async (event, config) => {
        try {
            await runAsync(
                `UPDATE configuracoes 
                 SET razao_social = ?, nome_fantasia = ?, documento = ?, inscricao_estadual = ?, 
                     telefone = ?, email = ?, cep = ?, endereco_completo = ?, logo = ?
                 WHERE id = 1`,
                [config.razao_social, config.nome_fantasia, config.documento, config.inscricao_estadual, 
                 config.telefone, config.email, config.cep, config.endereco_completo, config.logo]
            );
            return { sucesso: true };
        } catch (error) {
            console.error("Erro ao salvar dados do assinante:", error);
            throw new Error(error.message);
        }
    });
};