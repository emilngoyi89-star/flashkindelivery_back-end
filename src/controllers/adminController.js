const prisma = require('../config/db');
const pdfService = require('../services/pdfService');
const notifyService = require('../services/notifyService');

// --- STATISTIQUES DU DASHBOARD ---
const getDashboardStats = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Accès strictement réservé à la Direction.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const statsAggregation = await prisma.command.aggregate({
      where: { status: 'DELIVERED' }, 
      _sum: { deliveryFee: true },
      _count: { id: true }
    });

    const totalCommands = await prisma.command.count();
    
    const todayCommands = await prisma.command.count({
      where: { createdAt: { gte: today } }
    });

    const activeFlashmans = await prisma.user.count({
      where: { 
        role: 'DRIVER', 
        isActive: true 
      }
    });

    const alertsCount = await prisma.command.count({
      where: { 
        status: 'CANCELLED', 
        createdAt: { gte: today } 
      }
    });

    const recentCommandsForChart = await prisma.command.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true, deliveryFee: true, status: true }
    });

    const chartDataMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayName = d.toLocaleDateString('fr-FR', { weekday: 'short' }); 
      chartDataMap[dayName] = { name: dayName, revenus: 0, commandes: 0 };
    }

    recentCommandsForChart.forEach(cmd => {
      const dayName = cmd.createdAt.toLocaleDateString('fr-FR', { weekday: 'short' });
      if (chartDataMap[dayName]) {
        chartDataMap[dayName].commandes += 1;
        if (cmd.status === 'DELIVERED') {
          chartDataMap[dayName].revenus += (cmd.deliveryFee || 0);
        }
      }
    });

    const chartData = Object.values(chartDataMap);

    const recentActivityRaw = await prisma.command.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        flashman: { select: { firstName: true } }
      }
    });

    const recentActivity = recentActivityRaw.map(cmd => ({
      id: cmd.id,
      type: cmd.status,
      text: cmd.status === 'DELIVERED' 
        ? `Commande ${cmd.trackingCode || 'FLK'} livrée par ${cmd.flashman?.firstName || 'un livreur'}` 
        : cmd.status === 'CANCELLED'
        ? `Commande ${cmd.trackingCode || 'FLK'} annulée`
        : `Nouvelle commande ${cmd.trackingCode || 'FLK'} créée`,
      time: cmd.createdAt,
      status: cmd.status === 'DELIVERED' ? 'success' : cmd.status === 'CANCELLED' ? 'danger' : 'info'
    }));

    res.status(200).json({
      success: true,
      stats: {
        totalRevenue: statsAggregation._sum.deliveryFee || 0,
        flashkinNetProfit: 0,
        paidToDrivers: 0,
        totalDeliveries: statsAggregation._count.id || 0,
        totalCommands,
        todayCommands,
        activeFlashmans,
        alertsCount,
        chartData,
        recentActivity
      }
    });

  } catch (error) {
    console.error('Erreur lors de la génération des statistiques :', error);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// --- GÉNÉRATION DE RAPPORTS PDF ---
const downloadReport = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Accès refusé.' });
    }

    const stats = await prisma.command.aggregate({
      where: { status: 'DELIVERED' },
      _sum: { deliveryFee: true },
      _count: { id: true }
    });

    const formattedStats = {
      totalRevenue: stats._sum.deliveryFee || 0,
      flashkinNetProfit: 0,
      paidToDrivers: 0,
      totalDeliveries: stats._count.id || 0
    };

    pdfService.generateAdminReport(formattedStats, res);

  } catch (error) {
    console.error('Erreur PDF :', error);
    res.status(500).json({ success: false, message: 'Erreur génération PDF.' });
  }
};

// --- GESTION DES UTILISATEURS ---
const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        averageRating: true,
        ordersAsPartner: { select: { deliveryFee: true, status: true } }, 
        ordersAsFlashman: { select: { id: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const formattedUsers = users.map(user => {
      let ordersCount = 0;
      let revenue = 0;

      if (user.role === 'PARTNER') {
        ordersCount = user.ordersAsPartner?.length || 0;
        revenue = user.ordersAsPartner?.filter(c => c.status === 'DELIVERED').reduce((sum, cmd) => sum + (cmd.deliveryFee || 0), 0) || 0;
      } else {
        ordersCount = user.ordersAsFlashman?.length || 0;
      }

      return {
        id: user.id,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Utilisateur',
        email: user.email,
        phone: user.phone || 'Non spécifié',
        role: user.role === 'DRIVER' ? 'FLASHMAN' : user.role,
        status: user.isActive ? 'ACTIVE' : 'SUSPENDED',
        date: user.createdAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
        orders: ordersCount,
        revenue: revenue,
        rating: user.averageRating || 0,
      };
    });

    res.status(200).json({ success: true, users: formattedUsers });
  } catch (error) {
    console.error("Erreur getAllUsers :", error);
    res.status(500).json({ success: false, message: 'Erreur lors du chargement des utilisateurs.' });
  }
};

const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    await prisma.user.update({
      where: { id },
      data: { isActive: isActive }
    });

    res.status(200).json({ success: true, message: `Statut de l'utilisateur mis à jour.` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors de la modification du statut.' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id } });
    res.status(200).json({ success: true, message: 'Utilisateur définitivement supprimé.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Impossible de supprimer cet utilisateur (il est probablement lié à des commandes historiques).' });
  }
};
// --- FINANCE & TRANSACTIONS (ADMIN) ---

// 1. Récupérer toutes les demandes et transactions
const getFinanceData = async (req, res) => {
  try {
    const pendingWithdrawals = await prisma.withdrawalRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        user: { select: { firstName: true, lastName: true, role: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // On utilise exactement les valeurs de ton enum WithdrawalStatus
    const historyWithdrawals = await prisma.withdrawalRequest.findMany({
      where: { 
        status: { in: ['APPROVED', 'REJECTED'] } 
      },
      include: {
        user: { select: { firstName: true, lastName: true, role: true } }
      },
      orderBy: { updatedAt: 'desc' },
      take: 50
    });

    const recentTransactions = await prisma.transaction.findMany({
      include: {
        user: { select: { firstName: true, role: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.status(200).json({
      success: true,
      pendingWithdrawals,
      historyWithdrawals,
      recentTransactions
    });
  } catch (error) {
    console.error("Erreur getFinanceData :", error);
    res.status(500).json({ success: false, message: 'Erreur lors du chargement des finances.' });
  }
};

// 2. Traiter une demande de retrait (Accepter / Refuser)
const handleWithdrawalRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body; 

    const withdrawal = await prisma.withdrawalRequest.findUnique({ 
      where: { id },
      include: { user: true }
    });

    if (!withdrawal) return res.status(404).json({ success: false, message: 'Demande introuvable.' });
    if (withdrawal.status !== 'PENDING') return res.status(400).json({ success: false, message: 'Cette demande a déjà été traitée.' });

  

    if (action === 'ACCEPT') {
      // 🟢 UTILISATION DU STATUT 'APPROVED'
      await prisma.withdrawalRequest.update({
        where: { id },
        data: { status: 'APPROVED' } 
      });
      
      notifyService.sendAdminWithdrawalAction(withdrawal.user, withdrawal.amount, withdrawal.method, 'ACCEPTED');
      return res.status(200).json({ success: true, message: 'Retrait validé et transféré.' });
    
    } else if (action === 'REJECT') {
      // 🔴 UTILISATION DU STATUT 'REJECTED'
      await prisma.$transaction(async (tx) => {
        await tx.withdrawalRequest.update({
          where: { id },
          data: { status: 'REJECTED' }
        });

        await tx.user.update({
          where: { id: withdrawal.userId },
          data: { balance: { increment: withdrawal.amount } }
        });

        await tx.transaction.create({
          data: {
            amount: withdrawal.amount,
            type: 'CREDIT',
            description: `Remboursement suite au refus du retrait (${reason || 'Non spécifié'})`,
            userId: withdrawal.userId
          }
        });
      });

      notifyService.sendAdminWithdrawalAction(withdrawal.user, withdrawal.amount, withdrawal.method, 'REJECTED', reason);
      return res.status(200).json({ success: true, message: 'Retrait refusé, fonds recrédités.' });
    }

    res.status(400).json({ success: false, message: 'Action invalide.' });

  } catch (error) {
    console.error("Erreur handleWithdrawal :", error);
    res.status(500).json({ success: false, message: 'Erreur lors du traitement financier.' });
  }
};
// ==========================================
// 🚁 COMMAND CENTER (RADAR LOGISTIQUE)
// ==========================================

// 1. Récupérer l'intégralité des courses en temps réel
const getAllCommandsForAdmin = async (req, res) => {
  try {
    const commands = await prisma.command.findMany({
      include: {
        partner: { select: { firstName: true, lastName: true, storeName: true } },
        flashman: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const formattedCommands = commands.map(cmd => ({
      id: cmd.id,
      tracking: cmd.trackingCode || 'FLK-EN-ATTENTE',
      partner: cmd.partner?.storeName || `${cmd.partner?.firstName} ${cmd.partner?.lastName}`,
      client: cmd.clientName,
      phone: cmd.clientPhone,
      address: cmd.clientAddress,
      status: cmd.status,
      flashman: cmd.flashman ? cmd.flashman.firstName : null,
      deliveryFee: cmd.deliveryFee,
      cod: cmd.amountToCollect,
      date: new Date(cmd.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit' }),
      details: cmd.details
    }));

    res.status(200).json({ success: true, commands: formattedCommands });
  } catch (error) {
    console.error("Erreur getAllCommandsForAdmin :", error);
    res.status(500).json({ success: false, message: 'Erreur lors du chargement du radar.' });
  }
};

// 2. Action "God Mode" : Forcer l'annulation d'une course
const forceCancelCommand = async (req, res) => {
  try {
    const { id } = req.params;
    
    const command = await prisma.command.findUnique({ where: { id } });
    if (!command) return res.status(404).json({ success: false, message: 'Course introuvable.' });

    await prisma.command.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    res.status(200).json({ success: true, message: "Course annulée de force avec succès." });
  } catch (error) {
    console.error("Erreur forceCancelCommand :", error);
    res.status(500).json({ success: false, message: "Erreur lors de l'annulation." });
  }
};
// 3. Récupérer la liste des Flashmans actifs pour la réassignation
const getActiveFlashmans = async (req, res) => {
  try {
    const flashmans = await prisma.user.findMany({
      where: { 
        role: 'FLASHMAN', // Ou 'FLASHMAN' selon ton Enum
        isActive: true 
      },
      select: { 
        id: true, 
        firstName: true, 
        lastName: true, 
        phone: true 
      }
    });

    res.status(200).json({ success: true, flashmans });
  } catch (error) {
    console.error("Erreur getActiveFlashmans :", error);
    res.status(500).json({ success: false, message: 'Erreur lors du chargement des livreurs.' });
  }
};

// Dans ta fonction reassignCommand :
const reassignCommand = async (req, res) => {
  try {
    const { id } = req.params;
    const { flashmanId } = req.body;

    // 1. On récupère la commande AVEC les infos du partenaire pour la notif
    const command = await prisma.command.findUnique({ 
      where: { id },
      include: { partner: true } 
    });

    if (!command) return res.status(404).json({ success: false, message: 'Course introuvable.' });

    // 2. Mise à jour
    await prisma.command.update({
      where: { id },
      data: { 
        flashmanId: flashmanId,
        status: 'IN_PROGRESS' 
      }
    });

    // 3. 🔔 DÉCLENCHEMENT NOTIFICATION (C'est ici que ça manquait)
    // On notifie le partenaire que la course a été réassignée
    await notifyService.sendLifecycleNotification({
      partner: command.partner,
      command: { ...command, status: 'IN_PROGRESS' }, // On passe le nouveau statut
      statusType: 'ACCEPTED' // On réutilise le template 'ACCEPTED' qui convient au "En route"
    }).catch(e => console.error("Erreur notif réassignation :", e));

    res.status(200).json({ success: true, message: "Course réassignée avec succès." });
  } catch (error) {
    console.error("Erreur reassignCommand :", error);
    res.status(500).json({ success: false, message: "Erreur lors de la réassignation." });
  }
};
// ==========================================
// ⚙️ CATALOGUE & AUTOMATISATIONS (SETTINGS)
// ==========================================

// --- GESTION DU CATALOGUE (ZONES) ---
const getAdminZones = async (req, res) => {
  try {
    const zones = await prisma.deliveryZone.findMany({ orderBy: { totalPrice: 'asc' } });
    res.status(200).json({ success: true, zones });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors du chargement du catalogue.' });
  }
};

const upsertZone = async (req, res) => {
  try {
    const { id, name, communes, totalPrice, agencyMargin, isActive } = req.body;
    
    if (id) {
      // Mise à jour
      const updated = await prisma.deliveryZone.update({
        where: { id },
        data: { name, communes, totalPrice: parseFloat(totalPrice), agencyMargin: parseFloat(agencyMargin), isActive }
      });
      return res.status(200).json({ success: true, message: 'Zone mise à jour.', zone: updated });
    } else {
      // Création
      const created = await prisma.deliveryZone.create({
        data: { name, communes, totalPrice: parseFloat(totalPrice), agencyMargin: parseFloat(agencyMargin), isActive: true }
      });
      return res.status(201).json({ success: true, message: 'Nouvelle zone créée.', zone: created });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors de la sauvegarde de la zone.' });
  }
};
  // --- SUPPRIMER UNE ZONE ---
const deleteZone = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.deliveryZone.delete({ where: { id } });
    res.status(200).json({ success: true, message: 'Zone supprimée avec succès.' });
  } catch (error) {
    console.error("Erreur deleteZone :", error);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression de la zone.' });
  }
};

// --- GESTION DES RÉGLAGES (CRON) ---
const getSystemSettings = async (req, res) => {
  try {
    const settings = await prisma.systemSetting.findMany();
    // Transformation en objet { clé: valeur } pour le frontend
    const formattedSettings = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});
    
    res.status(200).json({ success: true, settings: formattedSettings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors du chargement des paramètres.' });
  }
};

const updateSystemSettings = async (req, res) => {
  try {
    const { settings } = req.body; // Un objet { CRON_WAKEUP_ACTIVE: 'true', CRON_MESSAGE: '...' }
    
    // On utilise un upsert pour chaque paramètre
    for (const [key, value] of Object.entries(settings)) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      });
    }

    res.status(200).json({ success: true, message: 'Paramètres système sauvegardés avec succès.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors de la sauvegarde des paramètres.' });
  }

};
module.exports = { 
  getDashboardStats, 
  downloadReport, 
  getAllUsers, 
  toggleUserStatus, 
  deleteUser,
  getFinanceData,
  handleWithdrawalRequest,
  getAllCommandsForAdmin,
  forceCancelCommand,
  getActiveFlashmans, 
  reassignCommand,
  getAdminZones, 
  upsertZone, 
  getSystemSettings,
  updateSystemSettings,
  deleteZone
};