const express = require('express');
const router = express.Router();
const { getTransactions, getUsers, updateUserStatus, getStats } = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Transactions and users — accessible by admin and superadmin
router.get('/transactions', authenticate, authorize('admin', 'superadmin'), getTransactions);
router.get('/users', authenticate, authorize('admin', 'superadmin'), getUsers);
router.patch('/users/:id/status', authenticate, authorize('admin', 'superadmin'), updateUserStatus);

// Stats — superadmin only
router.get('/stats', authenticate, authorize('superadmin'), getStats);

module.exports = router;
