const express = require('express');
const router = express.Router();
const { getBalanceData, requestWithdrawal,addTestMoney } = require('../controllers/balanceController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Récupérer les données financières du partenaire
router.get('/', protect, authorize('PARTNER'), getBalanceData);

// Demander un retrait et télécharger le PDF
router.post('/withdraw', protect, authorize('PARTNER'), requestWithdrawal);
// 👇 LA ROUTE DE TEST
router.post('/test-money', protect, authorize('PARTNER'), addTestMoney);

module.exports = router;