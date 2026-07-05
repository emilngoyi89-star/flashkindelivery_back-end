const prisma = require('../config/db');
const bcrypt = require('bcryptjs'); // 👈 Ajout pour vérifier le mot de passe
const { generatePartnerReceipt } = require('../services/pdfService');
const notifyService = require('../services/notifyService'); // 👈 Ajout pour les emails de sécurité

// --- 1. RÉCUPÉRER TOUTES LES INFOS DU PORTEFEUILLE ---
const getWalletData = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur introuvable." });
    }

    const credits = await prisma.transaction.aggregate({
      where: { userId, type: 'CREDIT' },
      _sum: { amount: true }
    });
    const totalEarned = credits._sum.amount || 0;

    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    const withdrawals = await prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({
      success: true,
      data: { balance: user.balance, totalEarned, transactions, withdrawals }
    });
  } catch (error) {
    console.error("🔴 Erreur Wallet Data :", error);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// --- 2. DEMANDER UN RETRAIT (SÉCURISÉ PAR MOT DE PASSE) ---
const requestWithdrawal = async (req, res) => {
  try {
    const userId = req.user.id;
    // 👇 On récupère le mot de passe envoyé par le frontend
    const { amount, method, phone, password } = req.body; 
    const withdrawAmount = parseFloat(amount);

    if (!withdrawAmount || withdrawAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Montant invalide.' });
    }

    if (!password) {
      return res.status(400).json({ success: false, message: 'Le mot de passe est requis pour des raisons de sécurité.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    // 🔒 VÉRIFICATION DU MOT DE PASSE
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      // ⚠️ ALERTE : Mot de passe incorrect
      // On déclenche l'email d'alerte en arrière-plan (sans bloquer la réponse)
      notifyService.sendWithdrawalSecurityAlert(user).catch(err => console.error("Erreur Mail Alerte:", err));
      
      return res.status(400).json({ 
        success: false, 
        message: 'Mot de passe incorrect. Pour votre sécurité, une alerte a été envoyée.' 
      });
    }

    if (user.balance < withdrawAmount) {
      return res.status(400).json({ success: false, message: 'Fonds insuffisants.' });
    }

    let createdWithdrawal = null;

    // 🔄 TRANSACTION PRISMA
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: withdrawAmount } }
      });

      createdWithdrawal = await tx.withdrawalRequest.create({
        data: { amount: withdrawAmount, method, phone, status: 'PENDING', userId }
      });

      await tx.transaction.create({
        data: {
          amount: withdrawAmount,
          type: 'DEBIT',
          description: `Retrait vers ${method} (${phone})`,
          userId
        }
      });
    });

    // ✅ SUCCÈS : Envoi de l'email de confirmation en arrière-plan
    notifyService.sendWithdrawalSuccessEmail(user, withdrawAmount, method).catch(err => console.error("Erreur Mail Succès:", err));

    res.status(200).json({ 
      success: true, 
      message: 'Demande de retrait validée avec succès !', 
      withdrawalId: createdWithdrawal.id 
    });
  } catch (error) {
    console.error("🔴 Erreur Retrait :", error);
    res.status(500).json({ success: false, message: 'Erreur lors du traitement.' });
  }
};

// --- 3. IMPRESSION EN DIRECT DU REÇU PDF DE RETRAIT ---
const downloadWithdrawalReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const withdrawal = await prisma.withdrawalRequest.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!withdrawal || (withdrawal.userId !== userId && req.user.role !== 'ADMIN')) {
      return res.status(404).json({ success: false, message: 'Demande introuvable.' });
    }

    const mockPartner = {
      id: withdrawal.user.id,
      firstName: withdrawal.user.firstName,
      lastName: withdrawal.user.lastName
    };

    const transactionData = {
      method: withdrawal.method,
      phone: withdrawal.phone,
      amount: withdrawal.amount
    };

    await generatePartnerReceipt(mockPartner, transactionData, res);

  } catch (error) {
    console.error("🔴 Erreur PDF Extraction :", error);
    res.status(500).json({ success: false, message: 'Erreur génération document.' });
  }
};

// --- 4. ANNULER UNE DEMANDE DE RETRAIT EN ATTENTE ---
const cancelWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal || withdrawal.userId !== userId) {
      return res.status(404).json({ success: false, message: 'Demande introuvable.' });
    }
    if (withdrawal.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Impossible d\'annuler un retrait déjà validé.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.withdrawalRequest.delete({ where: { id } });
      await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: withdrawal.amount } }
      });
      await tx.transaction.create({
        data: {
          amount: withdrawal.amount,
          type: 'CREDIT',
          description: `Restitution suite à l'annulation du retrait ${withdrawal.method}`,
          userId
        }
      });
    });

    res.status(200).json({ success: true, message: 'Demande annulée, solde recrédité.' });
  } catch (error) {
    console.error("🔴 Erreur annulation :", error);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// --- 5. MODIFIER UNE DEMANDE EN ATTENTE ---
const updateWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { method, phone } = req.body;
    const userId = req.user.id;

    const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal || withdrawal.userId !== userId) {
      return res.status(404).json({ success: false, message: 'Demande introuvable.' });
    }
    if (withdrawal.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Retrait déjà verrouillé par la comptabilité.' });
    }

    const updated = await prisma.withdrawalRequest.update({
      where: { id },
      data: { method, phone }
    });

    res.status(200).json({ success: true, message: 'Coordonnées mises à jour.', data: updated });
  } catch (error) {
    console.error("🔴 Erreur modif :", error);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

module.exports = { getWalletData, requestWithdrawal, downloadWithdrawalReceipt, cancelWithdrawal, updateWithdrawal };