const { hashPassword, comparePassword } = require('../../src/utils/password');

describe('utils/password', () => {
  test('o hash gerado não é a senha em texto', async () => {
    const hash = await hashPassword('Senha1234');
    expect(hash).not.toBe('Senha1234');
    expect(hash.startsWith('$2')).toBe(true); // formato do bcrypt
  });

  test('a mesma senha gera hashes diferentes (salt aleatório)', async () => {
    const h1 = await hashPassword('Senha1234');
    const h2 = await hashPassword('Senha1234');
    expect(h1).not.toBe(h2);
  });

  test('comparePassword aceita a senha correta', async () => {
    const hash = await hashPassword('Senha1234');
    await expect(comparePassword('Senha1234', hash)).resolves.toBe(true);
  });

  test('comparePassword recusa uma senha incorreta', async () => {
    const hash = await hashPassword('Senha1234');
    await expect(comparePassword('outra-senha', hash)).resolves.toBe(false);
  });
});
