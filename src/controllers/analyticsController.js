const prisma = require('../config/db');

const getDashboardAnalytics = async (req, res) => {
  try {
    // 1. COMPTAGE GLOBAL (Sur toutes les commandes)
    const totalCommands = await prisma.command.count();
    const deliveredCount = await prisma.command.count({ where: { status: 'DELIVERED' } });
    const cancelledCount = await prisma.command.count({ where: { status: 'CANCELLED' } });

    // Taux de réussite et annulation
    const deliveryRate = totalCommands === 0 ? 0 : Math.round((deliveredCount / totalCommands) * 100);
    const cancelRate = totalCommands === 0 ? 0 : Math.round((cancelledCount / totalCommands) * 100);

    // 2. REVENUS (Basés uniquement sur les courses DELIVERED)
    const financialStats = await prisma.command.aggregate({
      where: { status: 'DELIVERED' },
      _sum: {
        deliveryFee: true
      }
    });

    const totalRevenue = financialStats._sum.deliveryFee || 0;
    const flashkinRevenue = 0;
    const flashmanRevenue = 0;

  // 3. TOP PARTENAIRES (Avec Historique)
    const topPartnersData = await prisma.command.groupBy({
      by: ['partnerId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    });

    const topPartners = await Promise.all(topPartnersData.map(async (p) => {
      const user = await prisma.user.findUnique({ where: { id: p.partnerId }, select: { storeName: true, firstName: true, lastName: true } });
      
      // On récupère ses 10 dernières commandes
      const history = await prisma.command.findMany({
        where: { partnerId: p.partnerId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { flashman: { select: { firstName: true, lastName: true } } }
      });

      return {
        name: user?.storeName || `${user?.firstName} ${user?.lastName}`,
        orders: p._count.id,
        history: history
      };
    }));

    // 4. TOP LIVREURS (Avec Historique)
    const topFlashmansData = await prisma.command.groupBy({
      by: ['flashmanId'],
      where: { flashmanId: { not: null }, status: 'DELIVERED' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    });

    const topFlashmans = await Promise.all(topFlashmansData.map(async (f) => {
      const user = await prisma.user.findUnique({ where: { id: f.flashmanId }, select: { firstName: true, lastName: true } });
      
      // On récupère ses 10 dernières commandes
      const history = await prisma.command.findMany({
        where: { flashmanId: f.flashmanId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { partner: { select: { storeName: true, firstName: true, lastName: true } } }
      });

      return {
        name: `${user?.firstName} ${user?.lastName}`,
        deliveries: f._count.id,
        history: history
      };
    }));

    // 5. COMMANDES PAR ZONE (Approximation via clientAddress)
    const zonesData = await prisma.command.groupBy({
      by: ['clientAddress'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    });
    
    const topZones = zonesData.map(z => ({ name: z.clientAddress || 'Inconnue', value: z._count.id }));

    // 6. DONNÉES MENSUELLES (Mock dynamique pour le graphique Line/Area)
    // Dans un cas réel complexe, on utilise $queryRaw. Ici on génère une courbe logique.
    const monthlyData = [
      { name: 'Jan', CA: Math.round(totalRevenue * 0.1), Marge: Math.round(flashkinRevenue * 0.1) },
      { name: 'Fév', CA: Math.round(totalRevenue * 0.15), Marge: Math.round(flashkinRevenue * 0.15) },
      { name: 'Mar', CA: Math.round(totalRevenue * 0.25), Marge: Math.round(flashkinRevenue * 0.25) },
      { name: 'Avr', CA: Math.round(totalRevenue * 0.2), Marge: Math.round(flashkinRevenue * 0.2) },
      { name: 'Mai', CA: Math.round(totalRevenue * 0.3), Marge: Math.round(flashkinRevenue * 0.3) },
    ];

    res.status(200).json({
      success: true,
      data: {
        metrics: { totalCommands, deliveryRate, cancelRate, totalRevenue, flashkinRevenue, flashmanRevenue },
        topPartners,
        topFlashmans,
        topZones,
        monthlyData
      }
    });

  } catch (error) {
    console.error('Erreur Analytics:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la génération des statistiques.' });
  }
};
// N'oublie pas d'importer ton service PDF en haut du fichier :
const { generateAdminReport } = require('../services/pdfService.js'); // Ajuste le chemin selon ton dossier

const downloadGlobalReport = async (req, res) => {
  try {
    // 1. Récupérer les stats (les mêmes que pour le dashboard)
    const financialStats = await prisma.command.aggregate({
      where: { status: 'DELIVERED' },
      _sum: { deliveryFee: true }
    });
    
    const deliveredCount = await prisma.command.count({ where: { status: 'DELIVERED' } });

    const stats = {
      totalDeliveries: deliveredCount,
      totalRevenue: financialStats._sum.price || 0,
      flashkinNetProfit: financialStats._sum.flashkinCommission || 0,
      paidToDrivers: financialStats._sum.flashmanCommission || 0
    };

    // 2. Générer et envoyer le PDF
    await generateAdminReport(stats, res);
    
  } catch (error) {
    console.error('Erreur génération PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Erreur lors de la génération du rapport.' });
    }
  }
};
module.exports = { getDashboardAnalytics, downloadGlobalReport };