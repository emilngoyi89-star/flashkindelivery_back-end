const prisma = require('../config/db');
const pdfService = require('../services/pdfService');

const downloadDriverReceipt = async (req, res) => {
  try {
    // 1. Sécurité : Seul un Livreur peut télécharger ça
    if (req.user.role !== 'DRIVER') {
      return res.status(403).json({ success: false, message: 'Accès réservé aux Flashmans.' });
    }

    // 2. On récupère les infos fraîches du livreur (dont son solde/balance)
    const driver = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    // 3. On génère le PDF
    pdfService.generateDriverReceipt(driver, res);

  } catch (error) {
    console.error('Erreur PDF Livreur :', error);
    res.status(500).json({ success: false, message: 'Erreur génération PDF.' });
  }
};


// --- RÉCUPÉRER LES STATISTIQUES DU LIVREUR (DASHBOARD) ---
const getFlashmanStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 1. Infos du profil de base (Pour la réputation)
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      select: { averageRating: true, totalCompleted: true, totalCancelled: true }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayDeliveries = await prisma.command.count({
      where: {
        flashmanId: userId,
        status: 'DELIVERED',
        updatedAt: { gte: today }
      }
    });

    const todayCommands = await prisma.command.findMany({
      where: {
        flashmanId: userId,
        status: 'DELIVERED',
        updatedAt: { gte: today }
      },
      select: { deliveryFee: true }
    });

    const todayEarnings = todayCommands.reduce((sum, cmd) => sum + (cmd.deliveryFee || 0), 0);

    res.status(200).json({
      success: true,
      stats: {
        todayDeliveries,
        todayEarnings,
        totalDeliveries: userProfile.totalCompleted, // On utilise la vraie donnée Prisma
        averageRating: userProfile.averageRating,     // 👈 NOUVEAU
        totalCancelled: userProfile.totalCancelled    // 👈 NOUVEAU
      }
    });
  } catch (error) {
    console.error("🔴 Erreur stats livreur :", error);
    res.status(500).json({ success: false, message: 'Erreur lors du calcul des statistiques.' });
  }
};
module.exports = { downloadDriverReceipt, 
 getFlashmanStats };