const prisma = require('../config/db');

// 1. POUR L'ADMIN : Scanner et fusionner toutes les alertes
const getAdminNotifications = async (req, res) => {
  try {
    // A. Demandes de retrait en attente
    const pendingWithdrawals = await prisma.withdrawalRequest.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { firstName: true, lastName: true, role: true } } },
      orderBy: { createdAt: 'desc' }
    });

    // B. Nouveaux utilisateurs (inscrits dans les dernières 48h)
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const newUsers = await prisma.user.findMany({
      where: {
        role: { in: ['PARTNER', 'DRIVER', 'FLASHMAN'] },
        createdAt: { gte: fortyEightHoursAgo }
      },
      select: { id: true, firstName: true, lastName: true, role: true, storeName: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });

    // C. Incidents & Litiges (depuis la table Notification)
    const incidents = await prisma.notification.findMany({
      where: { type: { in: ['INCIDENT', 'LITIGE'] }, isRead: false },
      include: { user: { select: { firstName: true, lastName: true, phone: true } } },
      orderBy: { createdAt: 'desc' }
    });

    // --- FUSION ET FORMATAGE UNIFIÉ ---
    const alerts = [
      ...pendingWithdrawals.map(w => ({
        id: `withdraw-${w.id}`,
        type: 'CASHOUT',
        title: 'Demande de Retrait',
        message: `${w.user.firstName} ${w.user.lastName} demande un transfert de ${w.amount} $.`,
        date: w.createdAt,
        actionLink: '/admin/finance'
      })),
      ...newUsers.map(u => ({
        id: `user-${u.id}`,
        type: 'NEW_USER',
        title: `Nouveau ${u.role === 'PARTNER' ? 'Partenaire' : 'Livreur'}`,
        message: `${u.firstName} ${u.lastName} ${u.storeName ? `(${u.storeName})` : ''} a rejoint la plateforme.`,
        date: u.createdAt,
        actionLink: '/admin/users'
      })),
      ...incidents.map(i => ({
        id: `inc-${i.id}`,
        type: i.type,
        title: i.type === 'INCIDENT' ? '🚨 URGENCE LIVREUR' : '⚠️ LITIGE DÉCLARÉ',
        message: i.message,
        contact: i.user?.phone || 'Non spécifié',
        date: i.createdAt,
        actionLink: '/admin/commands'
      }))
    ];

    // Tri global par date (le plus récent en haut)
    alerts.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Compteur pour la cloche rouge
    const unreadCount = alerts.length;

    res.status(200).json({ success: true, alerts, unreadCount });
  } catch (error) {
    console.error("Erreur getAdminNotifications:", error);
    res.status(500).json({ success: false, message: "Erreur de chargement des notifications." });
  }
};

// 2. POUR LE FLASHMAN : Le bouton S.O.S (Incident)
const reportIncident = async (req, res) => {
  try {
    const { message } = req.body;
    const flashmanId = req.user.id; // Récupéré via le token

    await prisma.notification.create({
      data: {
        type: 'INCIDENT',
        message: message || "Livreur en détresse : Besoin d'assistance immédiate !",
        userId: flashmanId
      }
    });

    res.status(200).json({ success: true, message: "Alerte envoyée au Control Tower avec succès." });
  } catch (error) {
    console.error("Erreur reportIncident:", error);
    res.status(500).json({ success: false, message: "Impossible d'envoyer l'alerte." });
  }
};

module.exports = { getAdminNotifications, reportIncident };