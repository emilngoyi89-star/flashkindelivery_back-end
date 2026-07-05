const { GoogleGenerativeAI } = require('@google/generative-ai');
const prisma = require('../config/db');
const { nanoid } = require('nanoid');
const notifyService = require('../services/notifyService');

const parseOrderText = async (req, res) => {
  try {
    const { rawText } = req.body;
    const partnerId = req.user.id;

    if (!rawText) {
      return res.status(400).json({ success: false, message: 'Texte manquant' });
    }

    // 1. Récupérer les données réelles du partenaire
    const products = await prisma.product.findMany({ 
      where: { partnerId, isActive: true },
      select: { id: true, name: true, price: true, stock: true }
    });
    
    const zones = await prisma.deliveryZone.findMany({ 
      where: { isActive: true },
      select: { id: true, name: true, communes: true, totalPrice: true }
    });

    if (products.length === 0) {
      return res.status(400).json({ success: false, message: 'Votre catalogue est vide. Ajoutez des produits avant de créer une commande intelligente.' });
    }

    // 2. INJECTER LE CONTEXTE À L'IA
    const prompt = `
      Tu es un assistant logistique expert pour le service de livraison "Flashkin".
      Ton rôle est d'analyser un texte de commandes en vrac et de le structurer STRICTEMENT selon la base de données.

      CATALOGUE PRODUITS DISPONIBLES :
      ${JSON.stringify(products)}

      ZONES DE LIVRAISON ET TARIFS :
      ${JSON.stringify(zones)}

      Texte brut du client :
      "${rawText}"

      RÈGLES D'ANALYSE FINANCIÈRE ET LOGISTIQUE :
      1. FRAIS DE LIVRAISON (deliveryFee) : Identifie la commune dans le texte. Trouve la zone correspondante dans les ZONES fournies, et récupère la valeur "totalPrice". Si la commune est introuvable, déduis une valeur logique ou mets 0.
      
      2. IDENTIFICATION DU PRODUIT :
         - CAS A (Dans le catalogue) : Si le produit est dans le CATALOGUE, ajoute-le dans le tableau "items" avec son "id", son prix exact ("unitPrice") et la quantité.
         - CAS B (Hors catalogue) : Si le produit N'EST PAS dans le catalogue, laisse "items" vide : []. Ensuite, remplis "customProductName" (le nom de l'article) et "customProductPrice" (le prix de l'article s'il est mentionné).

      3. CALCUL GLOBAL (TRÈS IMPORTANT) :
         - Si le texte mentionne le montant TOTAL que le client final doit donner au livreur (ex: "Le client paie 30$ en tout"), mets ce montant exact dans la clé "totalAmountMentioned".

      4. FORMAT DE RÉPONSE ATTENDU (JSON STRICT UNIQUEMENT) :
      [
        {
          "clientName": "Nom du client (ou Inconnu)",
          "clientPhone": "Numéro de téléphone (ou Non spécifié)",
          "clientAddress": "Adresse détaillée avec la commune",
          "deliveryFee": 5.0,
          "items": [
            { "productId": "id-réel", "quantity": 1, "unitPrice": 10.0 }
          ],
          "customProductName": "Nom du produit (si hors catalogue)",
          "customProductPrice": 20.0,
          "totalAmountMentioned": 25.0
        }
      ]
    `;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    const parsedOrders = JSON.parse(responseText);
    if (!Array.isArray(parsedOrders)) {
      throw new Error("Format JSON invalide retourné par l'IA.");
    }

    const savedCommands = [];

    // 3. VÉRIFICATION ET CALCULS AVANCÉS
    await prisma.$transaction(async (tx) => {
      for (const order of parsedOrders) {
        
        let totalItemsPrice = 0;
        let detailsString = [];

        // --- A. GESTION DES ARTICLES ---
        if (order.items && order.items.length > 0) {
          // Si c'est un produit connu du catalogue
          for (const item of order.items) {
            const productDB = products.find(p => p.id === item.productId);
            
            if (!productDB) throw new Error(`Produit introuvable dans le catalogue.`);
            if (productDB.stock < item.quantity) throw new Error(`Stock insuffisant pour : ${productDB.name}`);

            totalItemsPrice += item.unitPrice * item.quantity;
            detailsString.push(`${item.quantity}x ${productDB.name}`);
          }
        } else {
          // Si c'est un produit hors catalogue
          totalItemsPrice = order.customProductPrice || 0;
          detailsString.push(order.customProductName || 'Course / Colis externe');
        }

        // --- B. CALCUL DU MONTANT À COLLECTER ---
        let amountToCollect = 0;

        if (order.totalAmountMentioned && order.totalAmountMentioned > 0) {
          // Si l'IA a trouvé un "Total à payer" dicté dans le texte (ex: "Il va payer 30$")
          amountToCollect = order.totalAmountMentioned;
        } else {
          // Sinon, on additionne logiquement le prix des produits + la livraison
          amountToCollect = totalItemsPrice + (order.deliveryFee || 0);
        }

        const trackingCode = `FLK-${nanoid(6).toUpperCase()}`;
        const trackingExpire = new Date();
        trackingExpire.setDate(trackingExpire.getDate() + 7);

        // --- C. CRÉATION EN BASE DE DONNÉES ---
        const newCommand = await tx.command.create({
          data: {
            clientName: order.clientName || 'Client Inconnu',
            clientPhone: order.clientPhone || 'Non spécifié',
            clientAddress: order.clientAddress || 'Adresse non spécifiée',
            details: detailsString.join(' | '),
            amountToCollect: parseFloat(amountToCollect),
            deliveryFee : parseFloat(order.deliveryFee) || 0,
            partnerId: partnerId,
            trackingCode: trackingCode,
            trackingExpire: trackingExpire,
            // On s'assure de ne pas faire planter Prisma si `items` est vide
            orderLines: {
              create: (order.items || []).map(item => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice
              }))
            }
          },
          include: { orderLines: true }
        });
        
        savedCommands.push({
          ...newCommand,
          trackingUrl: `http://localhost:5173/track/${trackingCode}`
        });
      }
    }, {
      maxWait: 10000, 
      timeout: 30000  
    });

    // 4. NOTIFICATION SI TOUT S'EST BIEN PASSÉ
    const partner = await prisma.user.findUnique({ where: { id: partnerId } });
    if (partner && savedCommands.length > 0) {
      await notifyService.sendLifecycleNotification({
        partner: partner,
        command: { clientName: `${savedCommands.length} commande(s)` },
        statusType: 'BULK_CREATED'
      });
    }

    res.status(200).json({ 
      success: true, 
      message: `${savedCommands.length} commandes créées avec succès !`, 
      commands: savedCommands 
    });

  } catch (error) {
    console.error("🚨 ERREUR FLASHKIN AI :", error);
    res.status(400).json({ 
      success: false, 
      message: error.message || "Erreur lors de l'extraction de la commande." 
    });
  }
};


const analyzeEmergencyIncident = async (req, res) => {
  try {
    const { category, responses } = req.body;
    const flashman = req.user;

    if (!category || !responses || !Array.isArray(responses)) {
      return res.status(400).json({ success: false, message: "Données d'incident incomplètes." });
    }

    // 1. INITIALISATION DE GEMINI POUR L'ANALYSE DE CRISE
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const emergencyPrompt = `
      Tu es un expert en gestion de crises, d'accidents et de sécurité pour la compagnie logistique "Flashkin".
      Tu reçois un rapport d'incident de terrain envoyé par un coursier à moto (un Flashman).
      
      INFORMATIONS DU COURSIER :
      - Nom : ${flashman.firstName} ${flashman.lastName}
      - Téléphone : ${flashman.phone || 'Non spécifié'}
      - Catégorie déclarée : ${category.toUpperCase()}

      QUESTIONNAIRE DE TERRAIN COMPLÉTÉ :
      ${responses.map((r, i) => `Question ${i+1}: ${r.question}\nRéponse: ${r.answer}`).join('\n')}

      TA MISSION :
      Analyse ces réponses pour générer un rapport d'alerte ultra-clair destiné à la Direction Logistique (Landry Emil).
      Le rapport doit être structuré de manière professionnelle avec des indicateurs visuels (émojis).
      
      FORMAT DE RÉPONSE ATTENDU (Texte brut propre, direct, sans balises markdown complexes externes) :
      🚨 ALERTE INCIDENT CRITIQUE - FLASHKIN 🚨
      ---------------------------------------------
      • Catégorie : [Nom de la catégorie]
      • Émis par : [Prénom Nom du Flashman] ([Téléphone])
      • Niveau de Gravité : [CRITIQUE / ÉLEVÉ / MOYEN]
      
      [RÉSUMÉ DU DIAGNOSTIC IA]
      (Fais un résumé synthétique de ce qui se passe concrètement sur le terrain en 3-4 lignes max).

      [PLAN D'ACTION IMMÉDIAT POUR L'ADMIN]
      - Action 1 : ...
      - Action 2 : ...
      ---------------------------------------------
      Statut : Transmis automatiquement pour intervention immédiate.
    `;

    console.log("🧠 [EMERGENCY AI] Analyse du rapport d'incident en cours par Gemini...");
    const result = await model.generateContent(emergencyPrompt);
    const summaryReport = result.response.text().trim();

    // 2. DISPATCHING DE L'ALERTE PAR WHATSAPP À L'ADMINISTRATEUR (Landry Emil)
    console.log("📨 [EMERGENCY AI] Envoi de la notification d'urgence à la tour de contrôle...");
    await notifyService.sendEmergencyAlert({
      phone: "243810472671",
      summaryReport,
      controlTowerEmail: process.env.CONTROL_TOWER_EMAIL || process.env.ADMIN_EMAIL || 'flashkindelivrary@gmail.com'
    });

    res.status(200).json({ 
      success: true, 
      summary: summaryReport,
      message: "L'incident a été analysé avec succès par l'IA et transmis en priorité à la Direction."
    });

  } catch (error) {
    console.error("🚨 Erreur diagnostic IA d'urgence :", error);
    res.status(500).json({ success: false, message: "Échec du traitement de l'urgence par l'IA." });
  }
};

module.exports = { parseOrderText, analyzeEmergencyIncident };