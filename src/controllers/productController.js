const prisma = require('../config/db');
const { protect } = require('../middlewares/authMiddleware');
// 1. Ajouter un nouveau produit au catalogue
const createProduct = async (req, res) => {
  try {
    const { name, category, description, imageUrl, price, stock, sku } = req.body;
    const partnerId = req.user.id; // Récupéré via le middleware d'auth

    if (!name || !category || price === undefined || stock === undefined) {
      return res.status(400).json({ success: false, message: "Champs obligatoires manquants (nom, catégorie, prix, stock)." });
    }

    const newProduct = await prisma.product.create({
      data: {
        name,
        category,
        description,
        imageUrl,
        price: parseFloat(price),
        stock: parseInt(stock),
        sku,
        partnerId
      }
    });

    res.status(201).json({ success: true, message: "Produit ajouté avec succès !", product: newProduct });
  } catch (error) {
    console.error("🚨 Erreur création produit :", error);
    res.status(500).json({ success: false, message: "Erreur lors de l'ajout du produit." });
  }
};

// 2. Récupérer tous les produits du partenaire connecté
const getPartnerProducts = async (req, res) => {
  try {
    const partnerId = req.user.id;

    const products = await prisma.product.findMany({
      where: { partnerId, isActive: true },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("🚨 Erreur récupération produits :", error);
    res.status(500).json({ success: false, message: "Erreur lors de la récupération du catalogue." });
  }
};

// 3. Modifier un produit existant (mettre à jour le stock ou le prix)
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const partnerId = req.user.id;
    const { name, category, description, imageUrl, price, stock, sku, isActive } = req.body;

    // Vérifier si le produit appartient bien au partenaire
    const product = await prisma.product.findFirst({ where: { id, partnerId } });
    if (!product) {
      return res.status(404).json({ success: false, message: "Produit introuvable ou non autorisé." });
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        name,
        category,
        description,
        imageUrl,
        price: price !== undefined ? parseFloat(price) : undefined,
        stock: stock !== undefined ? parseInt(stock) : undefined,
        sku,
        isActive
      }
    });

    res.status(200).json({ success: true, message: "Produit mis à jour !", product: updatedProduct });
  } catch (error) {
    console.error("🚨 Erreur modification produit :", error);
    res.status(500).json({ success: false, message: "Erreur lors de la mise à jour." });
  }
};

// 4. Désactiver un produit (suppression logique pour ne pas casser l'historique des commandes)
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const partnerId = req.user.id;

    const product = await prisma.product.findFirst({ where: { id, partnerId } });
    if (!product) {
      return res.status(404).json({ success: false, message: "Produit introuvable ou non autorisé." });
    }

    // On passe isActive à false au lieu de delete pour garder la cohérence avec les anciennes commandes
    await prisma.product.update({
      where: { id },
      data: { isActive: false }
    });

    res.status(200).json({ success: true, message: "Produit retiré du catalogue avec succès." });
  } catch (error) {
    console.error("🚨 Erreur suppression produit :", error);
    res.status(500).json({ success: false, message: "Erreur lors de la suppression." });
  }
};

module.exports = { createProduct, getPartnerProducts, updateProduct, deleteProduct };