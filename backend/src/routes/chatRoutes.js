const express = require('express');
const { body } = require('express-validator');
const chatController = require('../controllers/chatController');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');

const router = express.Router();

router.use(authenticate);

router.post(
  '/',
  [
    body('clientId').optional({ nullable: true }).isUUID().withMessage('Cliente inválido.'),
    body('message').trim().notEmpty().withMessage('Mensagem não pode estar vazia.'),
  ],
  validate,
  chatController.chat
);

module.exports = router;
