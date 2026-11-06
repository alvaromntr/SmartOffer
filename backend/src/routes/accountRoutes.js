const express = require('express');
const { body } = require('express-validator');
const accountController = require('../controllers/accountController');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');

const router = express.Router();

router.use(authenticate);

router.delete(
  '/',
  [body('password').notEmpty().withMessage('Informe sua senha para confirmar.')],
  validate,
  accountController.deleteAccount
);

module.exports = router;
