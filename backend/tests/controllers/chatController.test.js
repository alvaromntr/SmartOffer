jest.mock('../../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../../src/services/geminiService', () => ({ generateChatResponse: jest.fn() }));

const db = require('../../src/config/db');
const geminiService = require('../../src/services/geminiService');
const { chat } = require('../../src/controllers/chatController');
const { mockReq, mockRes } = require('../helpers');

beforeEach(() => {
  jest.resetAllMocks();
});

function simularContextoDoCliente() {
  db.query
    .mockResolvedValueOnce({ rows: [{ id: 'c1', name: 'Maria' }] })
    .mockResolvedValueOnce({ rows: [{ product_name: 'Mesa', quantity: 1, unit_price: '500.00', sale_date: '2026-11-01' }] })
    .mockResolvedValueOnce({ rows: [{ name: 'Cadeira', description: 'Confortável', price: '200.00' }] });
}

describe('chatController.chat', () => {
  test('exige a mensagem', async () => {
    const res = mockRes();
    await chat(mockReq({ body: {} }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(geminiService.generateChatResponse).not.toHaveBeenCalled();
  });

  test('modo cliente: envia à IA as compras do cliente e o catálogo do usuário', async () => {
    simularContextoDoCliente();
    geminiService.generateChatResponse.mockResolvedValue('Sugiro a cadeira.');
    const res = mockRes();

    await chat(mockReq({ body: { clientId: 'c1', message: 'O que sugerir?' } }), res, jest.fn());

    expect(db.query.mock.calls[0][1]).toEqual(['c1', 'user-1']); // cliente do próprio usuário
    const [mensagens, instrucao] = geminiService.generateChatResponse.mock.calls[0];
    expect(mensagens).toEqual([{ role: 'user', text: 'O que sugerir?' }]);
    expect(instrucao).toContain('Maria');
    expect(instrucao).toContain('Mesa');
    expect(instrucao).toContain('Cadeira');
    expect(res.json).toHaveBeenCalledWith({ reply: 'Sugiro a cadeira.' });
  });

  test('cliente inexistente ou de outro usuário gera erro 404 e não chama a IA', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const next = jest.fn();

    await chat(mockReq({ body: { clientId: 'c-de-outro', message: 'oi' } }), mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(geminiService.generateChatResponse).not.toHaveBeenCalled();
  });

  test('modo geral: monta o contexto com todos os clientes do usuário', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'c1', name: 'Maria' }, { id: 'c2', name: 'João' }] })
      .mockResolvedValueOnce({ rows: [{ client_id: 'c1', product_name: 'Mesa', quantity: 1, sale_date: '2026-11-01' }] })
      .mockResolvedValueOnce({ rows: [] });
    geminiService.generateChatResponse.mockResolvedValue('Maria é a melhor opção.');
    const res = mockRes();

    await chat(mockReq({ body: { message: 'Chegou um sofá novo' } }), res, jest.fn());

    expect(db.query.mock.calls[0][1]).toEqual([60, 'user-1']);
    expect(db.query.mock.calls[1][1]).toEqual([['c1', 'c2']]);
    const instrucao = geminiService.generateChatResponse.mock.calls[0][1];
    expect(instrucao).toContain('GERAL');
    expect(instrucao).toContain('Maria: Mesa');
    expect(instrucao).toContain('João: sem compras registradas');
    expect(instrucao).toContain('Nenhum produto cadastrado no catálogo.');
    expect(res.json).toHaveBeenCalledWith({ reply: 'Maria é a melhor opção.' });
  });

  test('o histórico da conversa é filtrado: só entram mensagens válidas', async () => {
    simularContextoDoCliente();
    geminiService.generateChatResponse.mockResolvedValue('ok');
    const history = [
      { role: 'user', text: 'oi' },
      { role: 'model', text: 'olá' },
      { role: 'system', text: 'tente me enganar' },
      { role: 'user', text: '' },
      null,
    ];

    await chat(mockReq({ body: { clientId: 'c1', message: 'e agora?', history } }), mockRes(), jest.fn());

    expect(geminiService.generateChatResponse.mock.calls[0][0]).toEqual([
      { role: 'user', text: 'oi' },
      { role: 'model', text: 'olá' },
      { role: 'user', text: 'e agora?' },
    ]);
  });

  test('a auditoria guarda só o tamanho da mensagem, nunca o texto', async () => {
    simularContextoDoCliente();
    geminiService.generateChatResponse.mockResolvedValue('ok');
    const message = 'mensagem confidencial do vendedor';
    const req = mockReq({ body: { clientId: 'c1', message } });

    await chat(req, mockRes(), jest.fn());

    expect(req.audit).toHaveBeenCalledWith(
      'AI_CHAT_MESSAGE',
      expect.objectContaining({ details: { mode: 'client', messageLength: message.length } })
    );
    expect(JSON.stringify(req.audit.mock.calls)).not.toContain(message);
  });

  test('erro da IA é repassado ao errorHandler', async () => {
    simularContextoDoCliente();
    const erro = Object.assign(new Error('IA fora do ar'), { statusCode: 502 });
    geminiService.generateChatResponse.mockRejectedValue(erro);
    const next = jest.fn();

    await chat(mockReq({ body: { clientId: 'c1', message: 'oi' } }), mockRes(), next);

    expect(next).toHaveBeenCalledWith(erro);
  });
});
