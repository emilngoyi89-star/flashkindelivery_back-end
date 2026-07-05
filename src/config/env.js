require('dotenv').config();

const requiredEnvs = ['PORT', 'DATABASE_URL', 'JWT_SECRET'];

requiredEnvs.forEach((envVar) => {
  if (!process.env[envVar]) {
    console.error(`🚨 ERREUR CRITIQUE : La variable d'environnement ${envVar} est manquante.`);
    process.exit(1);
  }
});

module.exports = {
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  NODE_ENV: process.env.NODE_ENV || 'development'
};