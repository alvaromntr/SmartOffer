const jwt = require('jsonwebtoken');
const { generateToken, verifyToken } = require('../../src/utils/jwt');

const usuario = { id: 'u1', email: 'ana@teste.com', role: 'user', password_hash: 'nao-deve-ir-no-token' };

describe('utils/jwt', () => {
  test('generateToken cria um token com sub, email e role', () => {
    const decoded = verifyToken(generateToken(usuario));
    expect(decoded).toMatchObject({ sub: 'u1', email: 'ana@teste.com', role: 'user' });
  });

  test('o token não carrega o hash da senha', () => {
    const decoded = jwt.decode(generateToken(usuario));
    expect(decoded).not.toHaveProperty('password_hash');
  });

  test('o token expira em 8 horas por padrão', () => {
    const decoded = jwt.decode(generateToken(usuario));
    expect(decoded.exp - decoded.iat).toBe(8 * 60 * 60);
  });

  test('verifyToken recusa token expirado', () => {
    const expirado = jwt.sign({ sub: 'u1' }, process.env.JWT_SECRET, { expiresIn: -10 });
    expect(() => verifyToken(expirado)).toThrow(/expired/);
  });

  test('verifyToken recusa token assinado com outro segredo', () => {
    const falso = jwt.sign({ sub: 'u1' }, 'outro-segredo');
    expect(() => verifyToken(falso)).toThrow(/invalid signature/);
  });

  test('verifyToken recusa texto que não é token', () => {
    expect(() => verifyToken('isso-nao-e-um-token')).toThrow();
  });

  test('o módulo não carrega sem JWT_SECRET', () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    jest.isolateModules(() => {
      expect(() => require('../../src/utils/jwt')).toThrow(/JWT_SECRET/);
    });
    process.env.JWT_SECRET = original;
  });
});
