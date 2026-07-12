const cron = require('node-cron');
const prisma = require('../config/db');
const notifyService = require('./notifyService');

const initWakeUpCron = () => {
  console.log("🟢 [CRON] Moteur de réveil dynamique initialisé (Tick: 1 min)...");

  // On tourne TOUTES LES MINUTES (* * * * *) en silence pour vérifier les réglages
  cron.schedule('* * * * *', async () => { 
    try {
      // 1. EST-CE QUE LE CRON EST ACTIF ?
      const activeSetting = await prisma.systemSetting.findUnique({ where: { key: 'CRON_WAKEUP_ACTIVE' } });
      if (!activeSetting || activeSetting.value !== 'true') return;

      // 2. VÉRIFICATION DE L'INTERVALLE (Les fameuses minutes personnalisées)
      const intervalSetting = await prisma.systemSetting.findUnique({ where: { key: 'CRON_WAKEUP_INTERVAL' } });
      const intervalMinutes = parseInt(intervalSetting?.value || '10', 10); // 10 minutes par défaut
      
      const currentMinute = new Date().getMinutes();
      // Si la minute actuelle n'est pas un multiple de notre intervalle, on arrête là et on attend.
      if (currentMinute % intervalMinutes !== 0) return;

      console.log(`🔍 [CRON] Exécution de la boucle de relance (Intervalle: ${intervalMinutes} min)...`);
      
      // On cherche les commandes créées il y a plus de 3 minutes et non assignées
      const timeLimit = new Date(Date.now() - 3 * 60 * 1000); 
      
      const abandonedCount = await prisma.command.count({
        where: { status: 'RECEIVED', flashmanId: null, createdAt: { lte: timeLimit } }
      });

      if (abandonedCount === 0) {
        console.log("✨ [CRON] Radar fluide : Aucune commande en souffrance.");
        return;
      }

      console.log(`🚨 [CRON] ${abandonedCount} commande(s) en souffrance détectée(s) !`);

      // 3. RÉCUPÉRATION DU MESSAGE
      const messageSetting = await prisma.systemSetting.findUnique({ where: { key: 'CRON_WAKEUP_MESSAGE' } });
      const customMessageTemplate = messageSetting?.value || "Debout {{name}} ! 🔥\nIl y a {{count}} nouvelle(s) commande(s) en attente.";

      const activeFlashmans = await prisma.user.findMany({
        where: { role: 'FLASHMAN', isActive: true } 
      });

      for (const flashman of activeFlashmans) {
        // Alerte Email
        await notifyService.sendWakeUpAlert(flashman, abandonedCount);

        // Alerte WhatsApp
        if (flashman.phone && notifyService.sendWhatixoNotification) {
          const personalizedMessage = customMessageTemplate
            .replace('{{name}}', flashman.firstName)
            .replace('{{count}}', abandonedCount);
            
          const whatsappText = `⚡ *FLASHKIN DISPATCH | URGENCE*\n\n${personalizedMessage}\n\n🔗 *Ouvrir le Radar :*\flashkindelivery.netlify.app/dashboard`;
          
          notifyService.sendWhatixoNotification(flashman.phone, whatsappText)
            .catch(err => console.error(`[CRON WA ERROR] Pour ${flashman.phone}:`, err.message));
        }
      }

    } catch (error) {
      console.error("🔴 Erreur critique Cron :", error);
    }
  });
};

module.exports = { initWakeUpCron };