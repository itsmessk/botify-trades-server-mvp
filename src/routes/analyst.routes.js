const express = require('express');
const router = express.Router();
const { createSignal, getSignals, getSubscribers, getProfile } = require('../controllers/analyst.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All analyst routes require authentication and analyst role
router.use(authenticate, authorize('analyst'));

router.post('/signal', createSignal);
router.get('/signals', getSignals);
router.get('/subscribers', getSubscribers);
router.get('/profile', getProfile);

module.exports = router;
