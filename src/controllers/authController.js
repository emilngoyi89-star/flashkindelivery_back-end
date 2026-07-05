const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Import des notifications
const { sendOtpEmail, sendNewDeviceAlert,sendPasswordResetOtp,sendPasswordChangedConfirmation } = require('../services/notifyService');

// Générateur de token (30 jours)
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// ==========================================
// 1. INSCRIPTION (REGISTER)
// ==========================================
const register = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, role } = req.body;

    const allowRegistration = await prisma.systemSetting.findUnique({ where: { key: 'ALLOW_PARTNER_REGISTRATION' } });
    if (allowRegistration && allowRegistration.value === 'false') {
      return res.status(403).json({ success: false, message: "Les inscriptions publiques sont temporairement suspendues." });
    }

    const userExists = await prisma.user.findUnique({ where: { email } });
    if (userExists) {
      return res.status(400).json({ success: false, message: "Cet email est déjà utilisé." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let isActive = true;
    if (role === 'FLASHMAN' || role === 'DRIVER') {
      const autoApprove = await prisma.systemSetting.findUnique({ where: { key: 'AUTO_APPROVE_DRIVERS' } });
      if (autoApprove && autoApprove.value === 'false') isActive = false;
    }

    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        password: hashedPassword,
        role: role || 'PARTNER',
        isActive: isActive
      }
    });

    res.status(201).json({
      success: true,
      message: isActive ? "Inscription réussie !" : "Compte créé. En attente de validation Admin.",
      token: generateToken(user.id, user.role),
      user: { id: user.id, email: user.email, role: user.role, isActive: user.isActive }
    });

  } catch (error) {
    console.error("Erreur Register:", error);
    res.status(500).json({ success: false, message: "Erreur lors de l'inscription." });
  }
};

// ==========================================
// 2. CONNEXION (LOGIN - ÉTAPE 1)
// ==========================================
const generateTempToken = (id) => {
  return jwt.sign({ id, isTemp: true }, process.env.JWT_SECRET, { expiresIn: '15m' });
};

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ success: false, message: "Identifiants incorrects." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Identifiants incorrects." });

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Votre compte est en attente de validation ou désactivé." });
    }

    if (user.role !== 'ADMIN') {
      const maintenanceSetting = await prisma.systemSetting.findUnique({ where: { key: 'MAINTENANCE_MODE' } });
      if (maintenanceSetting && maintenanceSetting.value === 'true') {
        return res.status(503).json({ 
          success: false, 
          isMaintenance: true, 
          message: "La plateforme Flashkin est actuellement en maintenance. Veuillez réessayer plus tard." 
        });
      }
    }

    // --- LOGIQUE SÉCURITÉ : DÉTECTION APPAREIL ET OTP ---
    const deviceInfo = req.headers['user-agent'] || 'Appareil inconnu';
    const ipAddress = req.ip || req.connection.remoteAddress;

    const knownDevice = await prisma.device.findFirst({
      where: { userId: user.id, deviceInfo, ipAddress }
    });

    const isNewDevice = !knownDevice;

    if (user.twoFactorEnabled || isNewDevice) {
      const otpCode = generateOTP();
      const otpExpire = new Date(Date.now() + 10 * 60 * 1000); 
      const tempToken = generateTempToken(user.id); // Généré ici pour être envoyé

      await prisma.user.update({
        where: { id: user.id },
        data: { otpCode, otpExpire }
      });

      // ENVOI DU MAIL AVEC LE CODE ET LE TOKEN TEMPORAIRE POUR LE BOUTON
      await sendOtpEmail(user, otpCode, tempToken);
      
      if (isNewDevice) {
        await sendNewDeviceAlert(user, deviceInfo, ipAddress);
      }

      return res.status(200).json({
        success: true,
        requiresOtp: true,
        isNewDevice,
        tempToken,
        message: "Un code de sécurité a été envoyé."
      });
    }

    await prisma.device.update({
      where: { id: knownDevice.id },
      data: { lastLogin: new Date() }
    });

    res.status(200).json({
      success: true,
      token: generateToken(user.id, user.role),
      user: { id: user.id, email: user.email, role: user.role, balance: user.balance }
    });

  } catch (error) {
    console.error("Erreur Login:", error);
    res.status(500).json({ success: false, message: "Erreur lors de la connexion." });
  }
};

// ==========================================
// 2.bis. VÉRIFICATION OTP (LOGIN - ÉTAPE 2)
// ==========================================
const verifyOtp = async (req, res) => {
  try {
    const { tempToken, otpCode } = req.body;

    if (!tempToken || !otpCode) {
      return res.status(400).json({ success: false, message: "Le token temporaire et le code OTP sont requis." });
    }

    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    if (!decoded.isTemp) {
      return res.status(400).json({ success: false, message: "Token invalide." });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    
    if (!user || user.otpCode !== otpCode) {
      return res.status(401).json({ success: false, message: "Code OTP incorrect." });
    }

    if (new Date() > user.otpExpire) {
      return res.status(401).json({ success: false, message: "Le code OTP a expiré. Veuillez vous reconnecter." });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: null, otpExpire: null }
    });

    const deviceInfo = req.headers['user-agent'] || 'Appareil inconnu';
    const ipAddress = req.ip || req.connection.remoteAddress;

    await prisma.device.upsert({
      where: { userId_deviceInfo_ipAddress: { userId: user.id, deviceInfo, ipAddress } },
      update: { lastLogin: new Date() },
      create: { userId: user.id, deviceInfo, ipAddress }
    });

    res.status(200).json({
      success: true,
      token: generateToken(user.id, user.role),
      user: { id: user.id, email: user.email, role: user.role, balance: user.balance },
      message: "Connexion réussie."
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: "Session expirée, veuillez vous reconnecter." });
    }
    console.error("Erreur Verify OTP:", error);
    res.status(500).json({ success: false, message: "Erreur lors de la vérification du code." });
  }
};

// ==========================================
// 3. GET ME
// ==========================================
const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, balance: true, isActive: true }
    });
    if (!user) return res.status(404).json({ success: false, message: "Utilisateur introuvable." });
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erreur serveur." });
  }
};

// ==========================================
// 4. MOT DE PASSE OUBLIÉ
// ==========================================
// ==========================================
// 1. DEMANDE DE RÉINITIALISATION (GÉNÉRATION OTP)
// ==========================================
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "L'adresse e-mail est requise." });
    }

    // Recherche de l'utilisateur
    const user = await prisma.user.findUnique({ where: { email } });

    // Sécurité : On ne révèle pas si l'email existe ou non aux attaquants
    // NOUVEAU : On bloque si l'utilisateur n'existe pas
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "Aucun compte trouvé avec cette adresse e-mail." 
      });
    }

    // Génération d'un code OTP à 6 chiffres
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Le code expire dans 10 minutes
    const resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000);

    // Sauvegarde du code dans la base de données (on réutilise le champ du token)
    await prisma.user.update({
      where: { email },
      data: { 
        resetPasswordToken: otpCode, 
        resetPasswordExpire 
      }
    });

    // Envoi de l'OTP via Email (Premium HTML) et WhatsApp (Whatixo)
    await sendPasswordResetOtp(user, otpCode);

    res.status(200).json({ 
      success: true, 
      message: "Si ce compte existe, un code a été envoyé par E-mail et WhatsApp." 
    });

  } catch (error) {
    console.error("❌ Erreur ForgotPassword:", error);
    res.status(500).json({ success: false, message: "Erreur serveur lors de la demande." });
  }
};

// ==========================================
// 2. VALIDATION OTP ET CHANGEMENT DU MOT DE PASSE
// ==========================================
// ==========================================
// 2. VALIDATION OTP (AVEC OU SANS CHANGEMENT DE MDP)
// ==========================================
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "L'e-mail et le code OTP sont requis." });
    }

    // 1. Vérification du code OTP
    const user = await prisma.user.findFirst({
      where: { 
        email: email,
        resetPasswordToken: otp, 
        resetPasswordExpire: { gt: new Date() } // Le code ne doit pas être expiré
      }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Code invalide ou expiré." });
    }

    // 2. Préparation de la mise à jour (On détruit le code OTP dans tous les cas)
    let updateData = {
      resetPasswordToken: null,
      resetPasswordExpire: null
    };
    
  // 3. Choix A : L'utilisateur veut changer son mot de passe
    if (newPassword) {
      if (newPassword.length < 8) { // PASSÉ À 8 ICI
        return res.status(400).json({ success: false, message: "Le mot de passe doit faire au moins 8 caractères." });
      }
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(newPassword, salt);
    }
    // 4. Mise à jour de la base de données
    await prisma.user.update({
      where: { id: user.id },
      data: updateData
    });

    // 5. Envoi du mail de confirmation SEULEMENT s'il a changé de mot de passe
    if (newPassword) {
      await sendPasswordChangedConfirmation(user.email, user.firstName);
    }

    // 6. CONNEXION DIRECTE (Génération du Token JWT)
    // ⚠️ Assure-toi d'utiliser la même logique de token que dans ton login classique
    const token = jwt.sign(
      { id: user.id, role: user.role }, 
      process.env.JWT_SECRET || 'ton_secret_jwt_par_defaut', 
      { expiresIn: '7d' }
    );

    // 7. Réponse avec le token pour connecter l'utilisateur côté Frontend
    res.status(200).json({ 
      success: true, 
      message: newPassword ? "Mot de passe modifié et connexion réussie !" : "Connexion réussie via le code !",
      token: token,
      user: {
        id: user.id,
        firstName: user.firstName,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error("❌ Erreur validation OTP:", error);
    res.status(500).json({ success: false, message: "Erreur serveur lors de la validation." });
  }
};
module.exports = { register, login, getMe, forgotPassword, resetPassword, verifyOtp };