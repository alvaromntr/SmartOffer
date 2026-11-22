// Roda antes de cada arquivo de teste. Define variáveis de ambiente falsas,
// para os testes não dependerem do arquivo .env nem de serviços externos.
process.env.JWT_SECRET = 'segredo-somente-para-testes';
process.env.BCRYPT_SALT_ROUNDS = '4'; // custo baixo só para os testes ficarem rápidos
process.env.GEMINI_API_KEY = 'chave-falsa-de-teste';
delete process.env.JWT_EXPIRES_IN; // usa o padrão do sistema (8h)
