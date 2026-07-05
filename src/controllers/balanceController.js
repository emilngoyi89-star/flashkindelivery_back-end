const prisma = require('../config/db');
const { generatePartnerReceipt } = require('../services/pdfService');

// --- 1. RÉCUPÉRER LE SOLDE ET L'HISTORIQUE ---
const getBalanceData = async (req, res) => {
  try {
    const userId = req.user.id;

    // Récupérer l'utilisateur (pour le solde actuel)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true }
    });

    // Récupérer l'historique des Transactions (Revenus) et des Retraits
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20 // Les 20 dernières
    });

    const withdrawals = await prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({
      success: true,
      balance: user.balance,
      transactions,
      withdrawals
    });
  } catch (error) {
    console.error('Erreur getBalanceData:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// --- 2. DEMANDER UN RETRAIT (CASHOUT) ---
const requestWithdrawal = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, method, phone } = req.body;

    const withdrawAmount = parseFloat(amount);

    if (!withdrawAmount || withdrawAmount < 10) {
      return res.status(400).json({ success: false, message: 'Le retrait minimum est de 10$.' });
    }

    // TRANSACTION ATOMIQUE
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });

      if (user.balance < withdrawAmount) {
        throw new Error('Solde insuffisant.');
      }

      // 1. Déduire l'argent du solde
      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: withdrawAmount } }
      });

      // 2. Créer la demande de retrait (PENDING)
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          amount: withdrawAmount,
          userId: userId,
          status: 'PENDING'
        }
      });

      // 3. Créer la trace comptable de DEBIT
      await tx.transaction.create({
        data: {
          amount: withdrawAmount,
          type: 'DEBIT',
          description: `Demande de retrait (${method})`,
          userId: userId
        }
      });

      return { user, withdrawal };
    });

    // 4. GÉNÉRER ET ENVOYER LE PDF EN RÉPONSE DIRECTE (Téléchargement immédiat)
    const transactionData = {
      amount: withdrawAmount,
      method: method,
      phone: phone
    };

    // On utilise notre service PDF pour renvoyer le fichier au navigateur !
    await generatePartnerReceipt(result.user, transactionData, res);

  } catch (error) {
    console.error('Erreur requestWithdrawal:', error);
    if (error.message === 'Solde insuffisant.') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};
// --- 3. BOUTON MAGIQUE DE TEST (À supprimer plus tard) ---
const addTestMoney = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // On force l'ajout de 50$ et on crée une fausse transaction
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { balance: { increment: 50 } } }),
      prisma.transaction.create({
        data: { amount: 50, type: 'CREDIT', description: 'Gains de test (Bouton Magique) 🚀', userId }
      })
    ]);

    res.status(200).json({ success: true, message: '50$ ajoutés !' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur test' });
  }
};

// N'oublie pas d'ajouter addTestMoney dans ton export à la fin !
module.exports = { getBalanceData, requestWithdrawal, addTestMoney };