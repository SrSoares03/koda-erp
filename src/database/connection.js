const { app } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const caminhoBanco = path.join(app.getPath('userData'), 'banco_erp.db');

const db = new sqlite3.Database(caminhoBanco, (err) => {
    if (err) console.error('Erro ao abrir o banco:', err.message);
    else console.log('✅ Banco de dados SQLite conectado em:', caminhoBanco);
});

// Habilita as chaves estrangeiras
db.run("PRAGMA foreign_keys = ON");

// Criação das tabelas
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT, medida TEXT, custo REAL, venda REAL, quantidade REAL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL, documento TEXT, telefone TEXT, email TEXT
    )`);

    // ==========================================
    // AS LINHAS DE RESET FICAM AQUI, SOLTAS NO JAVASCRIPT:
    db.run("DROP TABLE IF EXISTS movimentacoes");
    db.run("DROP TABLE IF EXISTS caixas");
    // ==========================================

    // Tabela Cabeçalho da Venda (O "Recibo")
    db.run(`CREATE TABLE IF NOT EXISTS vendas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_venda TEXT DEFAULT (datetime('now', 'localtime')),
        cliente_id INTEGER,
        total REAL NOT NULL,
        forma_pagamento TEXT NOT NULL,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
    )`);

    // NOVA TABELA: Itens da Venda (O que foi comprado)
    db.run(`CREATE TABLE IF NOT EXISTS itens_venda (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER NOT NULL,
        produto_id INTEGER NOT NULL,
        quantidade REAL NOT NULL,
        preco_unitario REAL NOT NULL,
        FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
        FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT
    )`);

    // TABELA: Controle de Caixa
    db.run(`CREATE TABLE IF NOT EXISTS caixas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_abertura TEXT DEFAULT (datetime('now', 'localtime')),
        valor_inicial REAL NOT NULL,
        data_fechamento TEXT,
        valor_final_sistema REAL,
        valor_final_informado REAL,
        status TEXT DEFAULT 'ABERTO' 
    )`);

    // TABELA: Fluxo de Caixa (Tudo que entra e sai)
    db.run(`CREATE TABLE IF NOT EXISTS movimentacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caixa_id INTEGER,
        venda_id INTEGER, 
        tipo TEXT NOT NULL, 
        descricao TEXT NOT NULL,
        valor REAL NOT NULL,
        forma_pagamento TEXT, 
        data TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (caixa_id) REFERENCES caixas(id) ON DELETE RESTRICT,
        FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE
    )`);

    // ==========================================
    // TABELA: Dados do Assinante (Minha Empresa)
    // ==========================================
    db.run("DROP TABLE IF EXISTS configuracoes"); // Pode remover depois do primeiro teste
    
    db.run(`CREATE TABLE IF NOT EXISTS configuracoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        razao_social TEXT,
        nome_fantasia TEXT DEFAULT 'Minha Loja',
        documento TEXT,
        inscricao_estadual TEXT,
        telefone TEXT,
        email TEXT,
        cep TEXT,
        endereco_completo TEXT,
        logo TEXT
    )`);

    // Cria um registro vazio por padrão para o usuário poder editar depois
    db.get("SELECT COUNT(*) AS total FROM configuracoes", [], (err, row) => {
        if (!err && row.total === 0) {
            db.run(`INSERT INTO configuracoes (nome_fantasia) VALUES ('Minha Loja')`);
        }
    }); 
    // ==========================================
    // TABELA: Contas a Pagar e Receber
    // ==========================================
    db.run(`CREATE TABLE IF NOT EXISTS contas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL, -- 'PAGAR' ou 'RECEBER'
        descricao TEXT NOT NULL,
        valor REAL NOT NULL,
        data_vencimento TEXT NOT NULL,
        data_pagamento TEXT,
        status TEXT DEFAULT 'PENDENTE' -- 'PENDENTE' ou 'PAGO'
    )`);
});

// Exporta o banco para ser usado nos controllers
module.exports = db;