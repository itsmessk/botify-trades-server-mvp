const express = require('express');
const router = express.Router();
const { ibkrConnect, subscribe, unsubscribe, getAnalysts, getTrades } = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All user routes require authentication and user role
router.use(authenticate, authorize('user'));

router.post('/ibkr-connect', ibkrConnect);
router.post('/subscribe/:analystId', subscribe);
router.delete('/unsubscribe/:analystId', unsubscribe);
router.get('/analysts', getAnalysts);
router.get('/trades', getTrades);

module.exports = router;
