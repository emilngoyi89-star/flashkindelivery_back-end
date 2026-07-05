const prisma = require('../config/db');
const bcrypt = require('bcryptjs');

// --- 1. RÉCUPÉRER LE PROFIL & LES PARAMÈTRES ---
const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { 
        id: true, firstName: true, lastName: true, email: true, phone: true, 
        storeName: true, avatarUrl: true, role: true,
        // LES 3 CHAMPS DES PARAMÈTRES PARTENAIRES
        defaultAddress: true, defaultPhone: true, webhookUrl: true 
      }
    });
    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("🚨 ERREUR GET PROFILE :", error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// --- 2. MISE A JOUR INFO, AVATAR ET PARAMÈTRES ---
const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, storeName, avatarUrl, defaultAddress, defaultPhone, webhookUrl } = req.body;
    
    // Construction dynamique de l'objet de mise à jour.
    // Cela évite de remplacer une donnée existante par "undefined" si un champ n'est pas envoyé par le frontend.
    const dataToUpdate = {};
    if (firstName !== undefined) dataToUpdate.firstName = firstName;
    if (lastName !== undefined) dataToUpdate.lastName = lastName;
    if (phone !== undefined) dataToUpdate.phone = phone;
    if (storeName !== undefined) dataToUpdate.storeName = storeName;
    if (avatarUrl !== undefined) dataToUpdate.avatarUrl = avatarUrl; // Prise en charge du Base64
    if (defaultAddress !== undefined) dataToUpdate.defaultAddress = defaultAddress;
    if (defaultPhone !== undefined) dataToUpdate.defaultPhone = defaultPhone;
    if (webhookUrl !== undefined) dataToUpdate.webhookUrl = webhookUrl;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: dataToUpdate,
      select: { 
        id: true, firstName: true, lastName: true, email: true, phone: true, 
        storeName: true, avatarUrl: true, role: true,
        defaultAddress: true, defaultPhone: true, webhookUrl: true 
      }
    });
    
    res.status(200).json({ success: true, message: 'Données mises à jour avec succès', user });
  } catch (error) {
    console.error("🚨 ERREUR UPDATE PROFILE :", error);
    res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour' });
  }
};

// --- 3. CHANGER LE MOT DE PASSE (SÉCURISÉ) ---
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Tous les champs sont requis." });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    // Vérifier l'ancien mot de passe
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Ancien mot de passe incorrect' });
    }

    // Hasher et enregistrer le nouveau
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });

    res.status(200).json({ success: true, message: 'Mot de passe modifié avec succès 🔒' });
  } catch (error) {
    console.error("🚨 ERREUR PASSWORD :", error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// J'exporte les deux noms pour la fonction de mot de passe pour ne pas casser tes anciennes routes `userRoutes.js`
module.exports = { 
  getProfile, 
  updateProfile, 
  changePassword,
  updatePassword: changePassword 
};