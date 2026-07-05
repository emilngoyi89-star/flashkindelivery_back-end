const express = require('express');
const router = express.Router();

// On importe tes middlewares de sécurité
const { protect } = require('../middlewares/authMiddleware');

// On importe avec LES BONS NOMS depuis ton contrôleur
const { parseOrderText, analyzeEmergencyIncident } = require('../controllers/aiController'); 

// --- ROUTE 1 : Pour le Partenaire (Création en masse) ---
router.post('/parse-order', protect, parseOrderText);

// --- ROUTE 2 : Pour le Flashman (Cellule de crise IA) ---
router.post('/emergency', protect, analyzeEmergencyIncident);

module.exports = router;