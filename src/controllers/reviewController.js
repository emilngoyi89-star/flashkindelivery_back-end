const prisma = require('../config/db');

// --- 1. SOUMETTRE UNE ÉVALUATION (PARTENAIRE) ---
const submitReview = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const { commandId } = req.params;
    const { rating, comment } = req.body;

    const parsedRating = parseInt(rating);
    if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ success: false, message: 'La note doit être comprise entre 1 et 5.' });
    }

    // 1. Vérifier la commande
    const command = await prisma.command.findUnique({
      where: { id: commandId },
      include: { review: true }
    });

    if (!command || command.partnerId !== partnerId) {
      return res.status(403).json({ success: false, message: 'Non autorisé.' });
    }
  // Remplace la condition de vérification dans submitReview :
if (command.status !== 'DELIVERED' && command.status !== 'CANCELLED') {
  return res.status(400).json({ success: false, message: 'Vous ne pouvez noter qu\'une course livrée ou annulée.' });
}
    if (command.review) {
      return res.status(400).json({ success: false, message: 'Cette course a déjà été évaluée.' });
    }

    const flashmanId = command.flashmanId;

    // 2. Transaction Prisma : Créer l'avis + Recalculer la moyenne du livreur
    await prisma.$transaction(async (tx) => {
      // Créer la note
      await tx.review.create({
        data: {
          rating: parsedRating,
          comment: comment || null,
          commandId: commandId,
          flashmanId: flashmanId
        }
      });

      // Récupérer toutes les notes du livreur pour recalculer sa moyenne
      const allReviews = await tx.review.findMany({
        where: { flashmanId: flashmanId },
        select: { rating: true }
      });

      const totalScore = allReviews.reduce((sum, rev) => sum + rev.rating, 0);
      const newAverage = parseFloat((totalScore / allReviews.length).toFixed(1));

      // Mettre à jour le profil du livreur
      await tx.user.update({
        where: { id: flashmanId },
        data: { 
          averageRating: newAverage,
          totalCompleted: { increment: 1 } // On valide une livraison réussie de plus
        }
      });
      
      // ⚠️ GESTION DES AVERTISSEMENTS (Si la note globale chute sous 3.5)
      // 🚀 NOUVEAU : Déclencheur de sanction automatique
if (newAverage < 3.0) {
  const flashman = await tx.user.findUnique({ where: { id: flashmanId } });
  await notifyService.sendPerformanceWarning(flashman, newAverage);
  
  // Si c'est vraiment trop bas, on le suspend automatiquement
  if (newAverage < 2.0) {
    await tx.user.update({ where: { id: flashmanId }, data: { isActive: false } });
  }
}
    });

    res.status(200).json({ success: true, message: 'Merci pour votre évaluation ! Le profil du livreur a été mis à jour.' });
  } catch (error) {
    console.error('Erreur notation :', error);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

module.exports = { submitReview };