const app = require('./app');
const { PORT } = require('./config/env');
const prisma = require('./config/db');
// 1. L'importation (en haut avec les autres imports)
const balanceRoutes = require('./routes/balanceRoutes');
// NETTOYEUR DU SERVEUR 
const cron = require('node-cron');
// Tâche automatique : s'exécute tous les jours à 00:00
cron.schedule('0 0 * * *', async () => {
  console.log('--- 🧹 Nettoyage des liens de suivi expirés ---');
  try {
    const result = await prisma.command.updateMany({
      where: {
        trackingExpire: { lt: new Date() } // Si la date d'expiration est passée
      },
      data: {
        trackingCode: null, // On efface le code pour désactiver le lien
      }
    });
    console.log(`${result.count} liens expirés ont été désactivés.`);
  } catch (error) {
    console.error('Erreur lors du nettoyage des liens :', error);
  }
});

const startServer = async () => {
  try {
    // Vérification de la connexion à la base de données
    await prisma.$connect();
    console.log('✅ Base de données connectée (Supabase/PostgreSQL)');

    app.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    });
   
  } catch (error) {
    console.error('❌ Erreur lors du démarrage du serveur :', error);
    process.exit(1);
  }
};

startServer();