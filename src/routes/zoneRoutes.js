const express = require('express');
const router = express.Router();
const { getZones } = require('../controllers/zoneController');
const { protect } = require('../middlewares/authMiddleware');

// Route protégée : le partenaire doit être connecté pour voir les tarifs
router.get('/', protect, getZones);

module.exports = router;