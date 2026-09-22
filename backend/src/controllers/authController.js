const db = require('../config/db');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateToken } = require('../utils/jwt');
const auditService = require('../services/auditService');

const TERMS_VERSION = '1.0';
const PRIVACY_VERSION = '1.0';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MINUTES = 15;

async function register(req, res, next) {
  const { name, email, password, acceptTerms } = req.body;

  try {
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres.' });
    }
    if (!acceptTerms) {
      return res.status(400).json({
        error: 'É necessário aceitar o Termo de Uso e a Política de Privacidade para criar uma conta.',
      });
    }

    const passwordHash = await hashPassword(password);

    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, name, email, role, created_at`,
      [name.trim(), email.trim().toLowerCase(), passwordHash]
    );

    const user = result.rows[0];

    await db.query(
      `INSERT INTO user_consents (user_id, terms_version, privacy_version, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, TERMS_VERSION, PRIVACY_VERSION, req.ip, req.headers['user-agent']]
    );

    await auditService.logAction({
      userId: user.id,
      userEmail: user.email,
      action: 'USER_REGISTER',
      entity: 'user',
      entityId: user.id,
      method: req.method,
      path: req.originalUrl,
      statusCode: 201,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(201).json({
      message: 'Usuário criado com sucesso.',
      user,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }
    return next(err);
  }
}

async function login(req, res, next) {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const result = await db.query(
      `SELECT id, name, email, password_hash, role, is_active, failed_login_attempts, locked_until
       FROM users WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    const genericError = { error: 'E-mail ou senha inválidos.' };

    if (result.rows.length === 0) {
      await auditService.logAction({
        userEmail: email,
        action: 'LOGIN_FAILED',
        method: req.method,
        path: req.originalUrl,
        statusCode: 401,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { reason: 'user_not_found' },
      });
      return res.status(401).json(genericError);
    }

    const user = result.rows[0];

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await auditService.logAction({
        userId: user.id,
        userEmail: user.email,
        action: 'LOGIN_BLOCKED',
        method: req.method,
        path: req.originalUrl,
        statusCode: 423,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(423).json({
        error: `Conta temporariamente bloqueada por excesso de tentativas. Tente novamente após ${new Date(
          user.locked_until
        ).toLocaleTimeString('pt-BR')}.`,
      });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Esta conta está desativada. Contate o administrador.' });
    }

    const passwordMatches = await comparePassword(password, user.password_hash);

    if (!passwordMatches) {
      const attempts = user.failed_login_attempts + 1;
      const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + LOCK_TIME_MINUTES * 60 * 1000)
        : null;

      await db.query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
        [attempts, lockedUntil, user.id]
      );

      await auditService.logAction({
        userId: user.id,
        userEmail: user.email,
        action: 'LOGIN_FAILED',
        method: req.method,
        path: req.originalUrl,
        statusCode: 401,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { attempts, locked: shouldLock },
      });

      return res.status(401).json(genericError);
    }

    await db.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [user.id]
    );

    const token = generateToken(user);

    await auditService.logAction({
      userId: user.id,
      userEmail: user.email,
      action: 'LOGIN_SUCCESS',
      method: req.method,
      path: req.originalUrl,
      statusCode: 200,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({
      message: 'Login realizado com sucesso.',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const result = await db.query(
      `SELECT id, name, email, role, created_at FROM users WHERE id = $1`,
      [req.user.sub]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    return res.json({ user: result.rows[0] });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, me };
