const express = require('express');
const router = express.Router();

// 📦 On importe TOUTES nos fonctions du contrôleur
const { 
  createCommand, 
  getCommands, 
  updateCommand, 
  deleteCommand, 
  getPublicTracking,
  acceptCommand, 
  deliverCommand,
  getAvailableCommands,
  getMyAcceptedCommands, 
  getMyHistory,
  cancelCommand,
  revokeFlashman // 👈 LA CORRECTION EST ICI : on importe la fonction !
} = require('../controllers/commandController');

// 🛡️ On importe nos middlewares de sécurité
const { protect, authorize } = require('../middlewares/authMiddleware');

// ==========================================
// 🌍 ROUTES PUBLIQUES (CLIENT FINAL)
// ==========================================

// Suivi de commande sans connexion
router.get('/track/:code', getPublicTracking);


// ==========================================
// 🏪 ROUTES DES PARTENAIRES
// ==========================================

// Récupérer toutes les commandes du partenaire connecté
router.get('/', protect, getCommands);

// Créer une commande classique
router.post('/', protect, authorize('PARTNER'), createCommand);

// Modifier une commande (Sécurisé : interdit si déjà livré)
router.put('/:id', protect, authorize('PARTNER'), updateCommand);

// Supprimer une commande (Sécurisé : interdit si déjà livré)
router.delete('/:id', protect, authorize('PARTNER'), deleteCommand);


// ==========================================
// 🛵 ROUTES DES LIVREURS (FLASHMANS)
// ==========================================

// 📡 Radar : Voir les commandes en attente d'un livreur
router.get('/available', protect, authorize('FLASHMAN', 'DRIVER'), getAvailableCommands);

// 🎒 Mes courses : Voir les commandes que j'ai acceptées (En cours)
router.get('/my-routes', protect, authorize('FLASHMAN', 'DRIVER'), getMyAcceptedCommands);

// 📜 Historique : Voir les commandes que j'ai terminées
router.get('/my-history', protect, authorize('FLASHMAN', 'DRIVER'), getMyHistory);

// ✅ Action : Accepter une commande
router.put('/:id/accept', protect, authorize('FLASHMAN', 'DRIVER'), acceptCommand);

// 🏁 Action : Livrer la commande (La magie financière opère ici)
router.put('/:id/deliver', protect, authorize('FLASHMAN', 'DRIVER'), deliverCommand);

// ❌ Action : Annuler une commande
router.put('/:id/cancel', protect, authorize('FLASHMAN', 'DRIVER'), cancelCommand);
router.put('/:id/revoke', protect, authorize('PARTNER'), revokeFlashman);
module.exports = router;