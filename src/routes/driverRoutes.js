const express = require('express');
const router = express.Router();
const { getFlashmanStats } = require('../controllers/driverController');

// 🛡️ IMPORTATION CORRIGÉE : On utilise les vrais noms de tes fonctions de sécurité
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');

// GET /api/drivers/stats
router.get('/stats', authenticateToken, authorizeRole('FLASHMAN', 'DRIVER'), getFlashmanStats);

module.exports = router;