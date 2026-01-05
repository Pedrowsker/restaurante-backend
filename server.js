require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

/* CORS aberto (Vercel, navegador, testes) */
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

/*
  ❗❗❗ ATENÇÃO ❗❗❗
  NO RENDER, USA-SE APENAS DATABASE_URL
  NÃO use DB_HOST, DB_USER, DB_PASSWORD etc
*/
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* Health check */
app.get('/', (req, res) => {
  res.send('Backend funcionando');
});

/* Teste de banco */
app.get('/teste-banco', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro no banco');
  }
});

/* Criar pedido */
app.post('/pedido', async (req, res) => {
  const { nome_cliente, itens } = req.body;

  if (!nome_cliente || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ erro: 'Dados inválidos' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const pedidoResult = await client.query(
      'INSERT INTO pedidos (nome_cliente) VALUES ($1) RETURNING id',
      [nome_cliente]
    );

    const pedidoId = pedidoResult.rows[0].id;

    for (const item of itens) {
      await client.query(
        'INSERT INTO itens_pedido (pedido_id, produto, quantidade) VALUES ($1, $2, $3)',
        [pedidoId, item.produto, item.quantidade]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      mensagem: 'Pedido criado com sucesso',
      pedido_id: pedidoId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

app.delete('/pedidos', async (req, res) => {
  try {
    await pool.query('DELETE FROM pedidos');
    res.json({ mensagem: 'Todos os pedidos removidos' });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao limpar pedidos' });
  }
});


/* Listar pedidos */
app.get('/pedidos', async (req, res) => {
  try {
    const pedidosResult = await pool.query(
      'SELECT * FROM pedidos ORDER BY criado_em ASC'
    );

    const pedidos = pedidosResult.rows;

    for (let pedido of pedidos) {
      const itensResult = await pool.query(
        'SELECT produto, quantidade FROM itens_pedido WHERE pedido_id = $1',
        [pedido.id]
      );
      pedido.itens = itensResult.rows;
    }

    res.json(pedidos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao buscar pedidos' });
  }
});

/* Buscar pedido por ID */
app.get('/pedido/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pedidoResult = await pool.query(
      'SELECT id, nome_cliente, status FROM pedidos WHERE id = $1',
      [id]
    );

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    const pedido = pedidoResult.rows[0];

    const itensResult = await pool.query(
      'SELECT produto, quantidade FROM itens_pedido WHERE pedido_id = $1',
      [id]
    );

    pedido.itens = itensResult.rows;

    res.json(pedido);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao buscar pedido' });
  }
});

/* Atualizar status */
app.put('/pedido/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ erro: 'Status não informado' });
  }

  try {
    await pool.query(
      'UPDATE pedidos SET status = $1 WHERE id = $2',
      [status, id]
    );

    res.json({ mensagem: 'Status atualizado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao atualizar status' });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
