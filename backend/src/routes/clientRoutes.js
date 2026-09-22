const express = require('express');
const { body, param } = require('express-validator');
const clientController = require('../controllers/clientController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const validate = require('../middlewares/validate');

const router = express.Router();

router.use(authenticate);

router.get('/', clientController.listClients);

router.get(
  '/:id',
  [param('id').isUUID().withMessage('ID inválido.')],
  validate,
  clientController.getClient
);

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Nome é obrigatório.'),
    body('email').isEmail().withMessage('E-mail inválido.'),
    body('phone').optional({ nullable: true }).isString(),
    body('notes').optional({ nullable: true }).isString(),
  ],
  validate,
  clientController.createClient
);

router.put(
  '/:id',
  [
    param('id').isUUID().withMessage('ID inválido.'),
    body('email').optional().isEmail().withMessage('E-mail inválido.'),
  ],
  validate,
  clientController.updateClient
);

router.delete(
  '/:id',
  [param('id').isUUID().withMessage('ID inválido.')],
  validate,
  authorize('admin'),
  clientController.deleteClient
);

module.exports = router;
