const express = require('express');
const { body, param } = require('express-validator');
const productController = require('../controllers/productController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const validate = require('../middlewares/validate');

const router = express.Router();

router.use(authenticate);

router.get('/', productController.listProducts);

router.get(
  '/:id',
  [param('id').isUUID().withMessage('ID inválido.')],
  validate,
  productController.getProduct
);

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Nome é obrigatório.'),
    body('price').isFloat({ min: 0 }).withMessage('Preço deve ser um número válido e não negativo.'),
    body('description').optional({ nullable: true }).isString(),
  ],
  validate,
  productController.createProduct
);

router.put(
  '/:id',
  [
    param('id').isUUID().withMessage('ID inválido.'),
    body('price').optional().isFloat({ min: 0 }).withMessage('Preço deve ser um número válido e não negativo.'),
  ],
  validate,
  productController.updateProduct
);

router.delete(
  '/:id',
  [param('id').isUUID().withMessage('ID inválido.')],
  validate,
  authorize('admin'),
  productController.deleteProduct
);

module.exports = router;
