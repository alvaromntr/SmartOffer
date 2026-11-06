const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const authenticate = require('../middlewares/authenticate');

const router = express.Router();

router.use(authenticate);

router.get('/', dashboardController.getSummary);

module.exports = router;
