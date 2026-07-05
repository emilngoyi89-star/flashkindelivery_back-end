const prisma = require('../config/db');
const notifyService = require('../services/notifyService');
const { nanoid } = require('nanoid');

// --- 1. CRÉATION DE LA COMMANDE ---
const createCommand = async (req, res) => {
  try {
    const { clientName, clientAddress, clientPhone, details, amountToCollect, deliveryFee } = req.body;
    const partnerId = req.user.id;

    const trackingCode = `FLK-${nanoid(6).toUpperCase()}`;
    const trackingExpire = new Date();
    trackingExpire.setDate(trackingExpire.getDate() + 7);

    const newCommand = await prisma.command.create({
      data: {
        clientName,
        clientAddress,
        clientPhone,
        details,                                      
        amountToCollect: parseFloat(amountToCollect), 
        deliveryFee: parseFloat(req.body.deliveryFee) || 0,               
        partnerId,
        trackingCode,      
        trackingExpire     
      }
    });

    const partner = await prisma.user.findUnique({ where: { id: req.user.id } });
    
    // Notification de création (Email + WA)
    await notifyService.sendLifecycleNotification({
      partner: partner,
      command: newCommand,
      statusType: 'CREATED'
    });

    res.status(201).json({
      success: true,
      message: 'Commande créée avec succès ! 📦',
      command: newCommand,
      trackingUrl: `http://localhost:5173/track/${trackingCode}` 
    });

  } catch (error) {
    console.error('Erreur lors de la création de la commande :', error);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// --- 2. RÉCUPÉRATION DES COMMANDES (PARTENAIRE / ADMIN) ---
const getCommands = async (req, res) => {
  try {
    let commands;
    if (req.user.role === 'ADMIN') {
      commands = await prisma.command.findMany({
        include: { flashman: true }, 
        orderBy: { createdAt: 'desc' }
      });
    } else {
      commands = await prisma.command.findMany({
        where: { partnerId: req.user.id },
        include: { flashman: true }, 
        orderBy: { createdAt: 'desc' }
      });
    }

    res.status(200).json({ success: true, count: commands.length, commands });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// --- 3. MODIFICATION DE COMMANDE (SÉCURISÉ) ---
const updateCommand = async (req, res) => {
  try {
    const { id } = req.params;
    const command = await prisma.command.findUnique({ where: { id } });

    if (!command) return res.status(404).json({ success: false, message: 'Commande introuvable.' });
    
    if (command.status === 'DELIVERED') {
      return res.status(403).json({ success: false, message: 'Action refusée : Cette commande est déjà livrée.' });
    }

    const updatedCommand = await prisma.command.update({
      where: { id },
      data: req.body 
    });

    res.status(200).json({ success: true, message: 'Commande modifiée avec succès.', command: updatedCommand });
  } catch (error) {
    console.error('Erreur modification :', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la modification.' });
  }
};

// --- 4. SUPPRESSION DE COMMANDE (SÉCURISÉ) ---
const deleteCommand = async (req, res) => {
  try {
    const { id } = req.params;
    const command = await prisma.command.findUnique({ where: { id } });

    if (!command) return res.status(404).json({ success: false, message: 'Commande introuvable.' });

    if (command.status === 'DELIVERED') {
      return res.status(403).json({ success: false, message: 'Suppression impossible : Le colis a déjà été livré.' });
    }

    await prisma.command.delete({ where: { id } });
    res.status(200).json({ success: true, message: 'Commande supprimée avec succès.' });
  } catch (error) {
    console.error('Erreur suppression :', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression.' });
  }
};

// --- 5. RÉCUPÉRATION DU SUIVI PUBLIC (POUR LE CLIENT FINAL) ---
const getPublicTracking = async (req, res) => {
  try {
    const { code } = req.params;
    
    const command = await prisma.command.findFirst({ 
      where: { trackingCode: code },
      include: { flashman: { select: { firstName: true, lastName: true } } } 
    });

    if (!command) {
      return res.status(404).json({ success: false, message: 'Lien de suivi invalide.' });
    }

    res.status(200).json({ success: true, command });
  } catch (error) {
    console.error('Erreur Tracking public :', error);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// --- 6. ACCEPTATION PAR LE LIVREUR ---
const acceptCommand = async (req, res) => {
  try {
    const commandId = req.params.id;

    if (req.user.role !== 'DRIVER' && req.user.role !== 'FLASHMAN') {
      return res.status(403).json({ success: false, message: 'Accès refusé. Réservé aux livreurs.' });
    }

    const updatedCommand = await prisma.command.update({
      where: { id: commandId },
      data: { flashmanId: req.user.id, status: 'ACCEPTED' }
    });

    const partner = await prisma.user.findUnique({ where: { id: updatedCommand.partnerId } });
    if (partner) {
      await notifyService.sendLifecycleNotification({
        partner: partner,
        command: updatedCommand,
        statusType: 'ACCEPTED'
      });
    }

    res.status(200).json({ success: true, message: 'Course acceptée ! 🏍️', command: updatedCommand });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur ou ID introuvable.' });
  }
};

// --- 7. LIVRER LA COMMANDE ET CRÉDITER LE PARTENAIRE ET LE LIVREUR ---
const deliverCommand = async (req, res) => {
  try {
    const { id } = req.params;
    const flashmanId = req.user.id;

    const command = await prisma.command.findUnique({ where: { id } });

    if (!command || command.flashmanId !== flashmanId){
      return res.status(403).json({ success: false, message: 'Non autorisé.' });
    }
    if (command.status === 'DELIVERED') {
      return res.status(400).json({ success: false, message: 'Déjà livrée.' });
    }

    const deliveryFee = command.deliveryFee || 0;
    const netToPartner = (command.amountToCollect || 0) - deliveryFee;

    await prisma.$transaction(async (tx) => {
      // A. Mettre à jour la commande
      await tx.command.update({
        where: { id },
        data: { status: 'DELIVERED' }
      });

      // B. Créditer le partenaire
      if (netToPartner > 0) {
        await tx.user.update({
          where: { id: command.partnerId },
          data: { balance: { increment: netToPartner } }
        });

        await tx.transaction.create({
          data: {
            amount: netToPartner,
            type: 'CREDIT',
            description: `Revenus de livraison - Commande de ${command.clientName}`,
            userId: command.partnerId
          }
        });
      }

      // C. Créditer le livreur
      if (deliveryFee > 0) {
        await tx.user.update({
          where: { id: flashmanId },
          data: { balance: { increment: deliveryFee } }
        });

        await tx.transaction.create({
          data: {
            amount: deliveryFee,
            type: 'CREDIT',
            description: `Gain de course - Commande de ${command.clientName}`,
            userId: flashmanId
          }
        });
      }
    });

    const partner = await prisma.user.findUnique({ where: { id: command.partnerId } });
    if (partner) {
      await notifyService.sendLifecycleNotification({
        partner: partner,
        command: command,
        statusType: 'DELIVERED'
      });
    }

    res.status(200).json({ success: true, message: 'Colis livré ! L\'argent a été transféré aux portefeuilles.' });
  } catch (error) {
    console.error('Erreur livraison:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// --- 8. RADAR INTELLIGENT : RÉCUPÉRER LES COMMANDES EN ATTENTE (ALGORITHME VIP) ---
const getAvailableCommands = async (req, res) => {
  try {
    const flashmanId = req.user.id;

    // 1. Récupérer le profil du livreur pour connaître sa note
    const flashman = await prisma.user.findUnique({
      where: { id: flashmanId },
      select: { averageRating: true, isActive: true }
    });

    // Sécurité : Si le compte a été suspendu par le système
    if (!flashman || !flashman.isActive) {
      return res.status(403).json({ success: false, message: "Votre compte est suspendu. Veuillez contacter le support." });
    }

    // 2. Définir le statut VIP (>= 4 étoiles)
    const isVip = flashman.averageRating >= 4.0;
    
    // 3. Préparer le filtre de temps (Délai de 3 minutes pour les non-VIPs)
    let timeFilter = {};
    if (!isVip) {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000); // Il y a 3 minutes
      timeFilter = { lte: threeMinutesAgo }; // "lte" = less than or equal to
    }

    // 4. Rechercher les commandes sur le Radar
    const commands = await prisma.command.findMany({
      where: { 
        status: 'RECEIVED',
        flashmanId: null, // Commande libre
        ...(isVip ? {} : { createdAt: timeFilter }) // 👈 L'ALGORITHME MAGIQUE EST LÀ
      },
      include: {
        partner: {
          select: { firstName: true, lastName: true, storeName: true }
        }
        
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ success: true, commands });
  } catch (error) {
    console.error("Erreur récupération courses:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};

// --- 9. MES COURSES : RÉCUPÉRER LES COURSES ACCEPTÉES (FLASHMAN) ---
const getMyAcceptedCommands = async (req, res) => {
  try {
    const commands = await prisma.command.findMany({
      where: {
        flashmanId: req.user.id,
        status: 'ACCEPTED'
      },
      include: {
        partner: {
          select: { firstName: true, lastName: true, storeName: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.status(200).json({ success: true, commands });
  } catch (error) {
    console.error("Erreur récupération courses acceptées :", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};

// --- 10. HISTORIQUE : RÉCUPÉRER L'HISTORIQUE DES COURSES (FLASHMAN) ---
const getMyHistory = async (req, res) => {
  try {
    const commands = await prisma.command.findMany({
      where: {
        flashmanId: req.user.id,
        status: { in: ['DELIVERED', 'CANCELLED'] }
      },
      include: {
        partner: {
          select: { storeName: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.status(200).json({ success: true, commands });
  } catch (error) {
    console.error("Erreur récupération historique livreur :", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};

// --- 11. ANNULER UNE COMMANDE (FLASHMAN) ---
const cancelCommand = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body; 
    const flashmanId = req.user.id;

    const command = await prisma.command.findUnique({ where: { id } });

    if (!command || command.flashmanId !== flashmanId) {
      return res.status(403).json({ success: false, message: 'Non autorisé.' });
    }

    if (command.status === 'DELIVERED') {
      return res.status(400).json({ success: false, message: 'Impossible d\'annuler une commande déjà livrée.' });
    }

    const updatedCommand = await prisma.command.update({
      where: { id },
      data: { 
        status: 'CANCELLED',
        details: `${command.details} | ⚠️ Annulé : ${reason}`
      }
    });

    const partner = await prisma.user.findUnique({ where: { id: command.partnerId } });
    if (partner) {
      await notifyService.sendLifecycleNotification({
        partner: partner,
        command: updatedCommand,
        statusType: 'CANCELLED',
        cancelReason: reason
      });
    }

    res.status(200).json({ success: true, message: 'Livraison annulée et signalée.' });
  } catch (error) {
    console.error('Erreur annulation :', error);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// --- 12. RÉVOQUER UN LIVREUR (PARTENAIRE) ---
const revokeFlashman = async (req, res) => {
  try {
    const { id } = req.params;
    const partnerId = req.user.id;

    const command = await prisma.command.findUnique({ where: { id } });

    if (!command || command.partnerId !== partnerId) {
      return res.status(403).json({ success: false, message: 'Non autorisé.' });
    }

    if (command.status !== 'ACCEPTED') {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez révoquer un livreur que si la course est en transit (ACCEPTED).' });
    }

    const flashmanId = command.flashmanId;

    await prisma.$transaction(async (tx) => {
      // 1. Remettre la commande à disposition de tous
      await tx.command.update({
        where: { id },
        data: { 
          status: 'RECEIVED', 
          flashmanId: null 
        }
      });

      // 2. Pénaliser le livreur fautif
      await tx.user.update({
        where: { id: flashmanId },
        data: { totalCancelled: { increment: 1 } }
      });
    });

    res.status(200).json({ success: true, message: 'Le livreur a été révoqué. La commande est de nouveau disponible sur le radar.' });
  } catch (error) {
    console.error('Erreur révocation :', error);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

module.exports = { 
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
  revokeFlashman
};