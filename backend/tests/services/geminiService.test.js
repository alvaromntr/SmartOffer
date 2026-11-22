const { generateChatResponse } = require('../../src/services/geminiService');

const mensagens = [{ role: 'user', text: 'Que produto sugerir?' }];

function respostaOk(texto) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }),
  };
}

function respostaErro(status) {
  return { ok: false, status, text: async () => 'erro simulado' };
}

describe('services/geminiService', () => {
  const fetchOriginal = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // Faz a espera entre tentativas ser instantânea nos testes.
    jest.spyOn(global, 'setTimeout').mockImplementation((fn) => {
      fn();
      return 0;
    });
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  test('devolve o texto da resposta da IA', async () => {
    global.fetch.mockResolvedValue(respostaOk('Sugiro a cadeira.'));
    await expect(generateChatResponse(mensagens, 'instrução')).resolves.toBe('Sugiro a cadeira.');
  });

  test('envia a chave no cabeçalho, as mensagens e a instrução de sistema', async () => {
    global.fetch.mockResolvedValue(respostaOk('ok'));
    await generateChatResponse(mensagens, 'Você é um assistente.');

    const [url, opcoes] = global.fetch.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('generateContent');
    expect(opcoes.headers['x-goog-api-key']).toBe('chave-falsa-de-teste');

    const corpo = JSON.parse(opcoes.body);
    expect(corpo.contents).toEqual([{ role: 'user', parts: [{ text: 'Que produto sugerir?' }] }]);
    expect(corpo.systemInstruction).toEqual({ parts: [{ text: 'Você é um assistente.' }] });
  });

  test('sem instrução de sistema, o campo não é enviado', async () => {
    global.fetch.mockResolvedValue(respostaOk('ok'));
    await generateChatResponse(mensagens);
    const corpo = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(corpo).not.toHaveProperty('systemInstruction');
  });

  test('resposta vazia da IA gera erro 502', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) });
    await expect(generateChatResponse(mensagens)).rejects.toMatchObject({ statusCode: 502 });
  });

  test('tenta de novo quando a API devolve 503 e usa a resposta seguinte', async () => {
    global.fetch.mockResolvedValueOnce(respostaErro(503)).mockResolvedValueOnce(respostaOk('deu certo'));
    await expect(generateChatResponse(mensagens)).resolves.toBe('deu certo');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('desiste depois de 3 tentativas com 503 e avisa sobre alta demanda', async () => {
    global.fetch.mockResolvedValue(respostaErro(503));
    await expect(generateChatResponse(mensagens)).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('alta demanda'),
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('erro que não deve ser repetido (400) falha na primeira tentativa', async () => {
    global.fetch.mockResolvedValue(respostaErro(400));
    await expect(generateChatResponse(mensagens)).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('Não foi possível'),
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('sem GEMINI_API_KEY o serviço responde 503', async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    let servico;
    jest.isolateModules(() => {
      servico = require('../../src/services/geminiService');
    });
    process.env.GEMINI_API_KEY = original;

    await expect(servico.generateChatResponse(mensagens)).rejects.toMatchObject({ statusCode: 503 });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
