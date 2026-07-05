const prisma = require('../config/db');

// Récupérer toutes les zones actives pour le catalogue du partenaire
const getZones = async (req, res) => {
  try {
    const zones = await prisma.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: { totalPrice: 'asc' } // On trie du moins cher au plus cher
    });

    res.status(200).json({
      success: true,
      count: zones.length,
      zones
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des zones :', error);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

module.exports = { getZones };