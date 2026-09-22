
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function generateChatResponse(messages, systemInstruction) {
  if (!GEMINI_API_KEY) {
    const err = new Error('GEMINI_API_KEY não configurada no servidor. Configure o arquivo .env.');
    err.statusCode = 503;
    throw err;
  }

  const body = {
    contents: messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const MAX_ATTEMPTS = 3;
  const RETRYABLE_STATUS = [429, 500, 503];

  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';

      if (!text) {
        const err = new Error('A IA não retornou nenhuma sugestão. Tente reformular a pergunta.');
        err.statusCode = 502;
        throw err;
      }

      return text;
    }

    const errorBody = await response.text().catch(() => '');
    console.error(`[geminiService] Erro na API do Gemini (tentativa ${attempt}/${MAX_ATTEMPTS}):`, response.status, errorBody);
    lastError = { status: response.status, body: errorBody };

    const shouldRetry = RETRYABLE_STATUS.includes(response.status) && attempt < MAX_ATTEMPTS;
    if (shouldRetry) {
      const waitMs = attempt * 1500;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    break;
  }

  console.error('[geminiService] Falha definitiva após retries:', lastError);
  const err = new Error(
    lastError?.status === 503 || lastError?.status === 429
      ? 'A IA está com alta demanda no momento. Aguarde alguns segundos e tente novamente.'
      : 'Não foi possível obter uma resposta da IA no momento. Tente novamente em instantes.'
  );
  err.statusCode = 502;
  throw err;
}

module.exports = { generateChatResponse };