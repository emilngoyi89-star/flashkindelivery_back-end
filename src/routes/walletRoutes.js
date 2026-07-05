const express = require('express');
const router = express.Router();
const { 
  getWalletData, requestWithdrawal, downloadWithdrawalReceipt, cancelWithdrawal, updateWithdrawal 
} = require('../controllers/walletController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/', protect, getWalletData);
router.post('/withdraw', protect, requestWithdrawal);
router.get('/withdraw/:id/pdf', protect, downloadWithdrawalReceipt); // Route d'impression
router.put('/withdraw/:id', protect, updateWithdrawal);
router.delete('/withdraw/:id', protect, cancelWithdrawal);

module.exports = router;