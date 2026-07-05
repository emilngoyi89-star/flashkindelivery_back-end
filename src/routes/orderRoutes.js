const express = require('express');
const router = express.Router();

// On importe notre contrôleur de commandes
const { createSingleOrder } = require('../controllers/orderController');

// On importe nos deux vigiles depuis le middleware
const { protect, authorize } = require('../middlewares/authMiddleware');

// --- ROUTES PROTÉGÉES ---

// Route POST pour créer une commande (Saisie classique)
// 1. protect : Vérifie que l'utilisateur est bien connecté
// 2. authorize('PARTNER') : Vérifie que l'utilisateur est strictement un partenaire
router.post('/', protect, authorize('PARTNER'), createSingleOrder);

module.exports = router;