const { PrismaClient } = require('@prisma/client');

// On instancie le client Prisma
// Log d'erreurs activé pour faciliter le débogage en développement
const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

/**
 * Test de connexion immédiat (optionnel mais recommandé)
 * Cela permet de savoir dès l'importation si Prisma est opérationnel.
 */
const connectDB = async () => {
  try {
    await prisma.$connect();
    // On ne fait pas de console.log ici pour ne pas polluer le terminal,
    // le succès sera confirmé dans server.js
  } catch (error) {
    console.error('❌ Prisma n\'a pas pu se connecter à la base de données.');
    console.error(error.message);
  }
};

// On lance le test de connexion en arrière-plan
connectDB();

module.exports = prisma;