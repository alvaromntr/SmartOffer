const db = require('../config/db');
const geminiService = require('../services/geminiService');


const MAX_CLIENTS_IN_GENERAL_CONTEXT = 60;

async function buildClientContext(clientId) {
  const clientResult = await db.query(
    'SELECT id, name FROM clients WHERE id = $1 AND is_active = TRUE',
    [clientId]
  );
  if (clientResult.rows.length === 0) {
    const err = new Error('Cliente não encontrado.');
    err.statusCode = 404;
    throw err;
  }
  const client = clientResult.rows[0];

  const salesResult = await db.query(
    `SELECT p.name AS product_name, s.quantity, s.unit_price, s.sale_date
     FROM sales s
     JOIN products p ON p.id = s.product_id
     WHERE s.client_id = $1
     ORDER BY s.sale_date DESC`,
    [clientId]
  );

  const catalogResult = await db.query(
    `SELECT name, description, price FROM products WHERE is_active = TRUE ORDER BY name ASC`
  );

  return { client, purchaseHistory: salesResult.rows, catalog: catalogResult.rows };
}

async function buildGeneralContext() {
  const clientsResult = await db.query(
    `SELECT id, name FROM clients WHERE is_active = TRUE ORDER BY name ASC LIMIT $1`,
    [MAX_CLIENTS_IN_GENERAL_CONTEXT]
  );

  const salesResult = await db.query(
    `SELECT s.client_id, p.name AS product_name, s.quantity, s.sale_date
     FROM sales s
     JOIN products p ON p.id = s.product_id
     WHERE s.client_id = ANY($1::uuid[])
     ORDER BY s.sale_date DESC`,
    [clientsResult.rows.map((c) => c.id)]
  );

  const catalogResult = await db.query(
    `SELECT name, description, price FROM products WHERE is_active = TRUE ORDER BY name ASC`
  );

  const salesByClient = {};
  for (const s of salesResult.rows) {
    if (!salesByClient[s.client_id]) salesByClient[s.client_id] = [];
    salesByClient[s.client_id].push(s);
  }

  const clients = clientsResult.rows.map((c) => ({
    ...c,
    purchaseHistory: salesByClient[c.id] || [],
  }));

  return { clients, catalog: catalogResult.rows, totalClients: clientsResult.rows.length };
}

function buildSystemInstructionForClient({ client, purchaseHistory, catalog }) {
  const historyText = purchaseHistory.length
    ? purchaseHistory
        .map((s) => `- ${s.product_name} (qtd: ${s.quantity}, preço unit.: R$ ${s.unit_price}, data: ${s.sale_date})`)
        .join('\n')
    : 'Nenhuma compra registrada até o momento.';

  const catalogText = catalog.length
    ? catalog.map((p) => `- ${p.name} (R$ ${p.price})${p.description ? `: ${p.description}` : ''}`).join('\n')
    : 'Nenhum produto cadastrado no catálogo.';

  return `Você é o assistente de recomendação de produtos do sistema SmartOffer.
Sua função é analisar o histórico de compras de um cliente específico e sugerir produtos do catálogo
disponível que possam ser do interesse dele, de forma natural e conversacional, em português do Brasil.

Cliente atual: ${client.name}

Histórico de compras deste cliente:
${historyText}

Catálogo de produtos disponíveis para sugestão:
${catalogText}

Instruções:
- Baseie suas sugestões apenas nos produtos listados no catálogo acima.
- Considere padrões no histórico de compras (categorias, frequência, ticket médio) ao sugerir.
- Se o cliente não tiver histórico, sugira produtos populares ou peça mais contexto ao usuário.
- Seja objetivo e explique brevemente o motivo de cada sugestão.
- Responda sempre em português do Brasil.`;
}

function buildSystemInstructionGeneral({ clients, catalog, totalClients }) {
  const clientsText = clients.length
    ? clients
        .map((c) => {
          const items = c.purchaseHistory.length
            ? c.purchaseHistory.map((s) => `${s.product_name} (qtd: ${s.quantity}, ${s.sale_date})`).join('; ')
            : 'sem compras registradas';
          return `- ${c.name}: ${items}`;
        })
        .join('\n')
    : 'Nenhum cliente cadastrado.';

  const catalogText = catalog.length
    ? catalog.map((p) => `- ${p.name} (R$ ${p.price})${p.description ? `: ${p.description}` : ''}`).join('\n')
    : 'Nenhum produto cadastrado no catálogo.';

  const limitNote =
    totalClients >= MAX_CLIENTS_IN_GENERAL_CONTEXT
      ? `\nObservação: a lista abaixo foi limitada aos primeiros ${MAX_CLIENTS_IN_GENERAL_CONTEXT} clientes cadastrados.`
      : '';

  return `Você é o assistente de recomendação do sistema SmartOffer, em modo GERAL (visão de toda a carteira de clientes).
Sua função é ajudar o vendedor a decidir, entre TODOS os clientes cadastrados, quais têm mais chance
de se interessar por um produto — seja um item já cadastrado no catálogo, seja um produto novo que
acabou de chegar e o usuário está descrevendo agora na conversa.

Catálogo de produtos cadastrados atualmente:
${catalogText}

Clientes cadastrados e o que cada um já comprou:
${clientsText}${limitNote}

Instruções:
- Se o usuário descrever um produto novo (ainda não cadastrado no catálogo), use a descrição dele
  para julgar quais clientes teriam interesse, comparando com o histórico de compras de cada um.
- Se o usuário perguntar sobre um produto já existente no catálogo, use o histórico de compras
  normalmente para indicar os clientes mais propensos.
- Responda citando os NOMES dos clientes recomendados, em ordem de relevância, com uma breve
  justificativa para cada um (ex.: "já comprou itens parecidos", "compra com frequência", etc.).
- Se não houver dados suficientes para uma recomendação segura, seja honesto sobre isso e sugira
  o que ajudaria (ex.: mais vendas registradas).
- Responda sempre em português do Brasil.`;
}

function parseHistory(history) {
  return (history || [])
    .filter((h) => h && h.text && (h.role === 'user' || h.role === 'model'))
    .map((h) => ({ role: h.role, text: h.text }));
}

async function chat(req, res, next) {
  try {
    const { clientId, message, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message é obrigatório.' });
    }

    let systemInstruction;
    let auditDetails;

    if (clientId) {
      const context = await buildClientContext(clientId);
      systemInstruction = buildSystemInstructionForClient(context);
      auditDetails = { entity: 'client', entityId: clientId };
    } else {
      const context = await buildGeneralContext();
      systemInstruction = buildSystemInstructionGeneral(context);
      auditDetails = { entity: 'client', entityId: null };
    }

    const messages = [...parseHistory(history), { role: 'user', text: message }];

    const reply = await geminiService.generateChatResponse(messages, systemInstruction);

    await req.audit('AI_CHAT_MESSAGE', {
      entity: auditDetails.entity,
      entityId: auditDetails.entityId,
      statusCode: 200,
      details: { mode: clientId ? 'client' : 'general', messageLength: message.length },
    });

    return res.json({ reply });
  } catch (err) {
    return next(err);
  }
}

module.exports = { chat };
