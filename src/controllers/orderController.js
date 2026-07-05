const prisma = require('../config/db');
// On importera les services de notification (WhatsApp/Email) plus tard ici

const createSingleOrder = async (req, res) => {
  try {
    const { clientName, clientPhone, clientAddress, details, amountToCollect, deliveryFee } = req.body;
    
    // req.user.id vient de ton middleware d'authentification (celui qui lit le JWT)
    const partnerId = req.user.id; 

    // 1. Création de la commande dans la base de données
    const newOrder = await prisma.command.create({
      data: {
        clientName,
        clientPhone,
        clientAddress,
        details,
        amountToCollect: parseFloat(amountToCollect),
        deliveryFee: parseFloat(deliveryFee) || 0,
        partnerId
      }
    });

    // 2. TODO : Déclencher l'alerte temps réel (Socket.io) pour les livreurs
    
    // 3. TODO : Envoyer la notification WhatsApp et E-mail

    // 4. Réponse au Frontend
    res.status(201).json({ 
      success: true, 
      message: "Commande enregistrée avec succès !", 
      order: newOrder 
    });

  } catch (error) {
    console.error('Erreur lors de la création de la commande:', error);
    res.status(500).json({ success: false, message: 'Erreur interne du serveur.' });
  }
};

module.exports = { createSingleOrder };