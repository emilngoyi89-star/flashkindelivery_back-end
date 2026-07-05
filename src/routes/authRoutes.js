const express = require('express');
const router = express.Router();

// 1. On importe le middleware de sécurité (Très important pour bloquer l'accès à getMe)
const { protect } = require('../middlewares/authMiddleware');

// 2. On importe toutes nos fonctions depuis le contrôleur
const { 
  register, 
  login,
  verifyOtp,
  forgotPassword, 
  resetPassword,
  getMe
} = require('../controllers/authController');


// --- ROUTES PUBLIQUES (Pas besoin d'être connecté) ---

// Route POST pour créer un compte
router.post('/register', register);

// Route POST pour se connecter
router.post('/login', login);
router.post('/verify-otp', verifyOtp);
// Route réinitialisation mot de passe (Demande de lien)
router.post('/forgot-password', forgotPassword);

// Route réinitialisation mot de passe (Nouveau mot de passe)
router.post('/reset-password', resetPassword);


// --- ROUTES PROTÉGÉES (Il faut un Token valide) ---

// Route GET pour récupérer son propre profil et rester connecté
router.get('/me', protect, getMe);

module.exports = router;