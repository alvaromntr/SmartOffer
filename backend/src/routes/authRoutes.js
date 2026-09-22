const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Nome é obrigatório.'),
    body('email').isEmail().withMessage('E-mail inválido.').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('A senha deve ter no mínimo 8 caracteres.'),
    body('acceptTerms').equals('true').withMessage('É necessário aceitar os termos.'),
  ],
  validate,
  authController.register
);

router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('E-mail inválido.').normalizeEmail(),
    body('password').notEmpty().withMessage('Senha é obrigatória.'),
  ],
  validate,
  authController.login
);

router.get('/me', authenticate, authController.me);

module.exports = router;
