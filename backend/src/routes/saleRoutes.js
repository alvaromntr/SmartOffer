const express = require('express');
const { body, param, query } = require('express-validator');
const saleController = require('../controllers/saleController');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');

const router = express.Router();

router.use(authenticate);

router.get(
  '/',
  [query('clientId').optional().isUUID().withMessage('clientId inválido.')],
  validate,
  saleController.listSales
);

router.post(
  '/',
  [
    body('clientId').isUUID().withMessage('Cliente inválido.'),
    body('productId').isUUID().withMessage('Produto inválido.'),
    body('quantity').optional().isInt({ min: 1 }).withMessage('Quantidade deve ser um número inteiro positivo.'),
    body('saleDate').optional().isISO8601().withMessage('Data inválida.'),
  ],
  validate,
  saleController.createSale
);

router.delete(
  '/:id',
  [param('id').isUUID().withMessage('ID inválido.')],
  validate,
  saleController.deleteSale
);

module.exports = router;
