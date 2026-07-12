// 1. On force la lecture du .env ici, sécurité absolue !
require('dotenv').config(); 

const nodemailer = require('nodemailer');
const axios = require('axios'); 

console.log("🔒 EMAIL_USER chargé :", process.env.EMAIL_USER ? "OUI" : "NON");
console.log("🔒 EMAIL_PASS chargé :", process.env.EMAIL_PASS ? "OUI" : "NON");

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', // On pointe directement vers le serveur de Google
  port: 587,              // Render exige ce port sécurisé
  secure: false,           // Active le SSL (obligatoire avec le port 465)
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // 👇 Voici le bloc ajouté pour contourner la sécurité de Render 👇
  tls: {
    rejectUnauthorized: false
  }
});

const COLORS = {
  blue: '#24445c',
  yellow: '#f4c414',
  lightGray: '#f8f9fa'
};

// L'URL de ton frontend (à changer en prod par ton vrai domaine)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ==========================================
// 📱 INTÉGRATION WHATSAPP REELLE (WHATIXO)
// ==========================================
const sendWhatixoNotification = async (phone, message) => {
  if (!phone) {
    console.log("⚠️ [WHATIXO TRACE] Impossible d'envoyer le WhatsApp : Numéro manquant.");
    return;
  }
  
  // 🛠️ CORRECTIF WHATIXO : On retire les espaces et le signe + pour l'API
  const cleanPhone = phone.replace(/[\+\s\-]/g, '');
  console.log(`📡 [WHATIXO TRACE] Tentative d'envoi vers l'URL : ${process.env.WHATIXO_API_URL} pour le numéro : ${cleanPhone}`);

  try {
    const response = await axios.post(
      process.env.WHATIXO_API_URL, 
      {
        deviceId: process.env.WHATIXO_DEVICE_ID,
        to: cleanPhone,
        text: message
      }, 
      {
        headers: { 
          'Authorization': `Bearer ${process.env.WHATIXO_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`🟢 [WHATIXO TRACE] WhatsApp envoyé avec succès au ${cleanPhone}. Réponse :`, response.data);
  } catch (error) {
    console.error("🔴 [WHATIXO TRACE CRITIQUE] L'envoi a échoué !");
    console.error("-> Erreur message :", error.message);
    if (error.response) {
      console.error("-> Erreur détails Whatixo :", error.response.data);
    }
  }
};

const sendEmergencyAlert = async ({ phone, summaryReport, controlTowerEmail }) => {
  const emailToSend = controlTowerEmail || process.env.CONTROL_TOWER_EMAIL || process.env.ADMIN_EMAIL || 'flashkindelivrary@gmail.com';
  const subject = '🚨 ALERTE URGENCE FLASHKIN - Rapport critique';
  const htmlContent = `
    <p style="color: #555; font-size: 16px; line-height: 1.5;">Un incident d'urgence a été signalé et analysé par l'IA.</p>
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 25px 0; border-radius: 8px;">
      <h3 style="margin-top: 0; color: #b91c1c; font-size: 16px;">Rapport d'incident</h3>
      <p style="color: #444; font-size: 14px; white-space: pre-line;">${summaryReport}</p>
    </div>
    <p style="color: #555; font-size: 14px;">Cet email confirme l'alerte envoyée par WhatsApp et garantit que la tour de contrôle reçoive la notification.</p>
  `;

  if (emailToSend) {
    try {
      await transporter.sendMail({
        from: `"Flashkin Sécurité" <${process.env.EMAIL_USER}>`,
        to: emailToSend,
        subject,
        html: generateEmailHTML('Tour de contrôle', subject, htmlContent, 'VOIR LE DASHBOARD', `${FRONTEND_URL}/dashboard`)
      });
      console.log(`📧 [ALERTE URGENCE] Email envoyé à ${emailToSend}`);
    } catch (error) {
      console.error(`❌ [ALERTE URGENCE] Échec envoi email à ${emailToSend} :`, error.message);
    }
  } else {
    console.log('⚠️ [ALERTE URGENCE] Aucun email de tour de contrôle configuré. Email non envoyé.');
  }

  if (phone) {
    await sendWhatixoNotification(phone, summaryReport);
  }
};

// ==========================================
// ✉️ GÉNÉRATEUR DE TEMPLATE EMAIL PREMIUM
// ==========================================
const generateEmailHTML = (partnerName, title, contentHTML, callToActionText = "ACCÉDER À MON DASHBOARD", link = `${FRONTEND_URL}/dashboard`) => {
  return `
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <div style="font-family: 'Inter', 'Segoe UI', Arial, sans-serif; max-width: 600px; width: 100%; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; box-sizing: border-box;">
      
      <div style="background-color: ${COLORS.blue}; padding: 25px 15px; text-align: center;">
        <h1 style="color: ${COLORS.yellow}; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">Flashkin Delivery</h1>
        <p style="color: #ffffff; margin-top: 5px; font-size: 14px; opacity: 0.8;">${title}</p>
      </div>

      <div style="padding: 30px 20px; background-color: #ffffff; box-sizing: border-box;">
        <h2 style="color: ${COLORS.blue}; font-size: 20px; margin-top: 0;">Bonjour ${partnerName},</h2>
        
        ${contentHTML}

        <div style="text-align: center; margin-top: 35px; margin-bottom: 10px;">
          <a href="${link}" style="background-color: #24445c; color: #f4c414; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 15px; font-weight: bold; white-space: nowrap; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">${callToActionText}</a>
        </div>
      </div>

      <div style="background-color: ${COLORS.lightGray}; padding: 20px; text-align: center; color: #999; font-size: 11px; border-top: 1px solid #eee; line-height: 1.5;">
        Ceci est un message automatique de votre système logistique.<br>
        <strong><a href="https://flashkindelivrary.com" style="color: #999; text-decoration: none;">Flashkin Logistique - flashkinsupport.com</a></strong><br>
        Kinshasa, RDC
      </div>
    </div>
  `;
};

// ==========================================
// 🚀 LE DISPATCHER PRINCIPAL DU CYCLE DE VIE
// ==========================================
const sendLifecycleNotification = async ({ partner, command, statusType, cancelReason }) => {
  console.log(`\n🚀 [LifeCycle] Déclenchement pour : [${statusType}] | Commande ID : ${command?.id || 'Inconnu'}`);

  if (!partner) {
    console.log("❌ [LifeCycle] Échec : Partenaire introuvable.");
    return;
  }

  let subject = '';
  let emailTitle = '';
  let htmlContent = '';
  let whatsappMessage = '';
  let actionText = '';
  let actionLink = '';
  
  const refCode = command?.trackingCode || 'REF-GEN';
  const trackingUrl = `${FRONTEND_URL}/track/${refCode}`;
  const dashboardUrl = `${FRONTEND_URL}/dashboard`;

  switch (statusType) {
    case 'CREATED':
      subject = `📜 Confirmation de course - #${refCode}`;
      emailTitle = "Nouvelle livraison enregistrée";
      actionText = "VOIR LE SUIVI EN DIRECT";
      actionLink = trackingUrl;
      htmlContent = `
        <p style="color: #555; font-size: 16px; line-height: 1.5;">Votre commande a été ajoutée à notre système de dispatch avec succès.</p>
        <div style="background-color: ${COLORS.lightGray}; border-radius: 6px; padding: 20px; margin: 25px 0; border-left: 4px solid ${COLORS.yellow};">
          <h3 style="margin-top: 0; color: ${COLORS.blue}; font-size: 16px;">DÉTAILS DE LA COURSE</h3>
          <div style="margin-bottom: 10px; color: #444; font-size: 14px;"><strong style="display: inline-block; width: 90px;">Client :</strong> ${command.clientName}</div>
          <div style="margin-bottom: 10px; color: #444; font-size: 14px;"><strong style="display: inline-block; width: 90px;">Téléphone :</strong> ${command.clientPhone}</div>
          <div style="margin-bottom: 15px; color: #444; font-size: 14px;"><strong style="display: inline-block; width: 90px;">Produit :</strong> ${command.details}</div>
          <div>
            <strong style="display: inline-block; width: 90px; color: #444; font-size: 14px;">Statut :</strong> 
            <span style="display: inline-block; background-color: ${COLORS.yellow}; color: ${COLORS.blue}; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; margin-top: 5px;">RECHERCHE LIVREUR</span>
          </div>
        </div>
      `;
      whatsappMessage = `📦 *FLASHKIN | NOUVELLE COURSE*

Bonjour *${partner.firstName}*,
La commande de votre client(e) *${command.clientName}* a été enregistrée avec succès.

📝 *Détails :*
▪️ Produit : ${command.details}
▪️ Statut : 🟡 En attente de prise en charge

🔗 *Suivi client en direct :*
${trackingUrl}

_Propulsé par Flashkin Logistique_`;
      break;

    case 'BULK_CREATED':
      subject = `⚡ Traitement Flashkin AI réussi`;
      emailTitle = "Automatisation des commandes";
      actionText = "ACCÉDER À MON DASHBOARD";
      actionLink = dashboardUrl;
      htmlContent = `
        <p style="color: #555; font-size: 16px; line-height: 1.5;">L'analyse de vos commandes en vrac est terminée.</p>
        <div style="background-color: #e8f4fd; border-radius: 6px; padding: 20px; margin: 25px 0; border-left: 4px solid ${COLORS.blue};">
          <p style="margin: 0; color: ${COLORS.blue}; font-size: 15px;"><strong>${command.clientName}</strong> ont été générées automatiquement et ajoutées à votre file d'attente. Nos algorithmes recherchent actuellement les coursiers disponibles.</p>
        </div>
        <p style="color: #555; font-size: 14px;">Connectez-vous à votre espace pour copier les liens de suivi individuels et les transmettre à vos clients.</p>
      `;
      whatsappMessage = `⚡ *FLASHKIN AI | TRAITEMENT VRAC*

Bonjour *${partner.firstName}*,
Votre traitement par lots est terminé ! 

📊 *Rapport d'automatisation :*
▪️ Générées : *${command.clientName}*
▪️ Statut : 🟡 En attente d'assignation

Connectez-vous à votre espace partenaire pour récupérer les liens de suivi de vos clients.

🔗 *Votre tableau de bord :*
${dashboardUrl}

_Propulsé par Flashkin Logistique_`;
      break;

    case 'ACCEPTED':
      subject = `🛵 Coursier assigné - #${refCode}`;
      emailTitle = "Colis en route";
      actionText = "SUIVRE LE COLIS";
      actionLink = trackingUrl;
      htmlContent = `
        <p style="color: #555; font-size: 16px; line-height: 1.5;">Le colis de <strong>${command.clientName}</strong> vient d'être pris en charge par l'un de nos Flashmans.</p>
        <div style="background-color: #eafaf1; border-radius: 6px; padding: 20px; margin: 25px 0; border-left: 4px solid #2ecc71;">
          <p style="margin: 0; color: #27ae60; font-size: 15px;">Votre livraison est actuellement en transit. Le lien de suivi est désormais actif avec la localisation.</p>
        </div>
      `;
      whatsappMessage = `🛵 *FLASHKIN | PRISE EN CHARGE*

Excellente nouvelle *${partner.firstName}* !
La commande de *${command.clientName}* a été assignée à l'un de nos Flashmans.

📍 *Statut actuel :*
▪️ État : 🔵 En route vers la destination

N'hésitez pas à partager le lien de suivi ci-dessous à votre client pour le rassurer.

🔗 *Lien de suivi :*
${trackingUrl}

_Propulsé par Flashkin Logistique_`;
      break;

    case 'DELIVERED':
      subject = `✅ Livraison confirmée - Client: ${command.clientName}`;
      emailTitle = "Mission accomplie";
      actionText = "VOIR MES REVENUS";
      actionLink = dashboardUrl;
      htmlContent = `
        <p style="color: #555; font-size: 16px; line-height: 1.5;">La livraison pour <strong>${command.clientName}</strong> a été effectuée en mains propres avec succès.</p>
        <div style="background-color: #f4f6f7; border-radius: 6px; padding: 20px; margin: 25px 0; border-left: 4px solid ${COLORS.blue};">
          <h3 style="margin-top: 0; color: ${COLORS.blue}; font-size: 16px;">MISE À JOUR FINANCIÈRE</h3>
          <p style="margin: 0; color: #444; font-size: 14px;">Le montant net de cette course (COD - Frais de livraison) a été automatiquement crédité sur votre portefeuille Flashkin.</p>
        </div>
      `;
      whatsappMessage = `✅ *FLASHKIN | MISSION ACCOMPLIE*

Félicitations *${partner.firstName}* ! 
Le colis de *${command.clientName}* a été livré avec succès.

💰 *Mise à jour financière :*
Le montant net de la course a été ajouté à votre portefeuille.

Merci pour votre confiance.

_Propulsé par Flashkin Logistique_`;
      break;

    case 'CANCELLED':
      console.log("🛠️ [LifeCycle] Entrée dans 'CANCELLED'. Préparation des messages...");
      subject = `⚠️ Livraison annulée - Client: ${command.clientName}`;
      emailTitle = "Course non aboutie";
      actionText = "CONSULTER MON HISTORIQUE";
      actionLink = dashboardUrl;
      
      const motifFinal = cancelReason || "Non spécifié par le coursier";

      htmlContent = `
        <p style="color: #555; font-size: 16px; line-height: 1.5;">La livraison pour <strong>${command.clientName}</strong> n'a pas pu être menée à terme.</p>
        <div style="background-color: #fef2f2; border-radius: 6px; padding: 20px; margin: 25px 0; border-left: 4px solid #ef4444;">
          <h3 style="margin-top: 0; color: #b91c1c; font-size: 16px;">MOTIF DE L'ANNULATION</h3>
          <p style="margin: 0; color: #7f1d1d; font-size: 15px; font-weight: bold;">${motifFinal}</p>
        </div>
        <p style="color: #555; font-size: 14px;">Le colis retourne dans votre inventaire virtuel. Nous vous invitons à contacter votre client.</p>
      `;
      
      whatsappMessage = `⚠️ *FLASHKIN | ANNULATION DE COURSE*

Bonjour *${partner.firstName}*,
Nous vous informons que la livraison de *${command.clientName}* n'a pas pu aboutir.

🛑 *Motif du livreur :*
${motifFinal}

La commande a été retournée virtuellement dans votre historique.

🔗 *Votre espace partenaire :*
${dashboardUrl}

_Support Flashkin Logistique_`;
      break;

    default:
      console.log(`⚠️ [LifeCycle] Statut non géré ignoré : ${statusType}`);
      return;
  }

  // --- ENVOI EMAIL ---
  if (partner.email) {
    console.log(`✉️ [MAIL TRACE] Préparation envoi email à : ${partner.email}`);
    const finalHtml = generateEmailHTML(partner.firstName, emailTitle, htmlContent, actionText, actionLink);
    try {
      await transporter.sendMail({
        from: `"Flashkin Delivery" <${process.env.EMAIL_USER}>`,
        to: partner.email,
        subject: subject,
        html: finalHtml,
      });
      console.log(`🟢 [MAIL TRACE] Mail [${statusType}] envoyé avec succès à ${partner.email}`);
    } catch (error) {
      console.error(`❌ [MAIL TRACE] Erreur d'envoi à ${partner.email} :`, error.message);
    }
  }

  // --- ENVOI WHATSAPP ---
  if (partner.phone) {
    console.log(`📱 [WHATIXO TRACE] Transfert au module WhatsApp pour le numéro : ${partner.phone}`);
    await sendWhatixoNotification(partner.phone, whatsappMessage);
  }
};

// ==========================================
// 🔒 SÉCURITÉ : MOT DE PASSE OUBLIÉ (OTP MULTICANAL)
// ==========================================
const sendPasswordResetOtp = async (user, otpCode) => {
  // 1. --- PRÉPARATION DE L'EMAIL (Avec ton template premium) ---
  const htmlContent = `
    <p style="color: #555; font-size: 16px; line-height: 1.5;">
      Vous avez demandé à réinitialiser votre mot de passe. Voici votre code de sécurité à 6 chiffres :
    </p>
    
    <div style="text-align: center; margin: 35px 0;">
      <p style="font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">Votre code OTP</p>
      <span style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: ${COLORS.blue}; background: #f8fafc; padding: 15px 25px; border-radius: 12px; border: 2px dashed ${COLORS.yellow}; display: inline-block;">
        ${otpCode}
      </span>
    </div>

    <p style="color: #555; font-size: 14px;">
      Ce code expirera dans <strong>10 minutes</strong>. Si vous n'avez pas fait cette demande, veuillez ignorer cet e-mail, votre compte est en sécurité.
    </p>
  `;

  // Utilisation de ton générateur central !
  const finalHtml = generateEmailHTML(
    user.firstName, 
    "Réinitialisation de mot de passe", 
    htmlContent, 
    "RETOURNER AU SITE", 
    `${FRONTEND_URL}/login`
  );

  try {
    await transporter.sendMail({
      from: `"Flashkin Sécurité" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `🔒 Votre code de réinitialisation : ${otpCode}`,
      html: finalHtml,
    });
    console.log(`📧 [SÉCURITÉ] Email OTP de réinitialisation envoyé à ${user.email}`);
  } catch (error) {
    console.error('❌ Erreur envoi email OTP reset:', error);
  }

  // 2. --- ENVOI DU WHATSAPP (Via ta fonction existante) ---
  if (user.phone) {
    const whatsappMessage = `🔐 *FLASHKIN SÉCURITÉ*

Bonjour *${user.firstName}*,
Votre code de réinitialisation de mot de passe est : *${otpCode}*

⏳ Ce code est valide pendant 10 minutes.
⚠️ Ne le partagez avec personne !

_Support Flashkin Logistique_`;

    console.log(`📱 [WHATIXO TRACE] Transfert du code OTP WhatsApp pour : ${user.phone}`);
    await sendWhatixoNotification(user.phone, whatsappMessage);
  }
};
const sendPasswordChangedConfirmation = async (email, firstName) => {
  try {
    const mailOptions = {
      from: `"Flashkin Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Votre mot de passe a été modifié avec succès',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
          <h2 style="color: #24445c;">Bonjour ${firstName},</h2>
          <p>Nous vous confirmons que le mot de passe de votre compte Flashkin Delivery a bien été mis à jour.</p>
          <p><strong>Si vous êtes à l'origine de cette modification :</strong><br/>
          Vous n'avez rien à faire. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
          
          <div style="background-color: #fff3cd; border-left: 4px solid #f4c414; padding: 15px; margin: 25px 0;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              <strong>⚠️ Si vous n'avez pas demandé cette modification :</strong><br/>
              Veuillez nous contacter immédiatement à support@flashkin.com pour sécuriser votre compte.
            </p>
          </div>
          
          <p>À très bientôt sur <span style="color: #24445c; font-weight: bold;">Flashkin</span> <span style="color: #f4c414; font-weight: bold;">Delivery</span> !</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Email de confirmation de mot de passe envoyé à ${email}`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi de la confirmation:', error);
  }
};

// ==========================================
// 🛡️ NOUVEAU : SÉCURITÉ DES RETRAITS FINANCIERS
// ==========================================

const sendWithdrawalSuccessEmail = async (user, amount, method) => {
  if (!user.email) return;

  const htmlContent = `
    <p style="color: #555; font-size: 16px; line-height: 1.5;">Votre demande de retrait a été enregistrée et déduite de votre solde avec succès.</p>
    <div style="background-color: #eafaf1; border-radius: 6px; padding: 20px; margin: 25px 0; border-left: 4px solid #2ecc71;">
      <h3 style="margin-top: 0; color: #27ae60; font-size: 16px;">DÉTAIL DE LA REQUÊTE</h3>
      <div style="margin-bottom: 10px; color: #444; font-size: 14px;"><strong style="display: inline-block; width: 120px;">Montant :</strong> ${amount.toFixed(2)} $</div>
      <div style="margin-bottom: 10px; color: #444; font-size: 14px;"><strong style="display: inline-block; width: 120px;">Méthode :</strong> ${method}</div>
      <div style="margin-bottom: 10px; color: #444; font-size: 14px;"><strong style="display: inline-block; width: 120px;">Statut :</strong> En attente de transfert</div>
    </div>
    <p style="color: #555; font-size: 14px;">Le service comptable Flashkin traite actuellement votre requête. Vous recevrez une notification finale une fois les fonds transférés sur votre compte Mobile Money.</p>
  `;

  const finalHtml = generateEmailHTML(user.firstName, "Demande de retrait confirmée", htmlContent, "VOIR MON PORTEFEUILLE", `${FRONTEND_URL}/wallet`);

  try {
    await transporter.sendMail({
      from: `"Flashkin Finance" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `✅ Demande de retrait enregistrée - ${amount} $`,
      html: finalHtml,
    });
    console.log(`📧 Mail [RETRAIT SUCCÈS] envoyé à ${user.email}`);
  } catch (error) {
    console.error(`❌ Erreur mail [RETRAIT SUCCÈS]:`, error.message);
  }
};

const sendWithdrawalSecurityAlert = async (user) => {
  if (!user.email) return;

  const htmlContent = `
    <p style="color: #555; font-size: 16px; line-height: 1.5;">Nous avons bloqué une tentative de retrait sur votre portefeuille Flashkin.</p>
    <div style="background-color: #fef2f2; border-radius: 6px; padding: 20px; margin: 25px 0; border-left: 4px solid #ef4444;">
      <h3 style="margin-top: 0; color: #b91c1c; font-size: 16px;">MOTIF DE BLOCAGE</h3>
      <p style="margin: 0; color: #7f1d1d; font-size: 15px; font-weight: bold;">Mot de passe de sécurité incorrect.</p>
    </div>
    <p style="color: #555; font-size: 14px; font-weight: bold;">Si vous n'êtes pas à l'origine de cette action :</p>
    <ul style="color: #555; font-size: 14px; line-height: 1.6;">
      <li>Vérifiez immédiatement votre solde.</li>
      <li>Ne partagez <strong>jamais</strong> votre mot de passe avec quiconque.</li>
      <li>Contactez d'urgence notre support : <strong>support@flashkin.com</strong></li>
    </ul>
  `;

  const finalHtml = generateEmailHTML(user.firstName, "Alerte de sécurité critique", htmlContent, "MODIFIER MON MOT DE PASSE", `${FRONTEND_URL}/dashboard`);

  try {
    await transporter.sendMail({
      from: `"Flashkin Sécurité" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `🚨 TENTATIVE DE RETRAIT BLOQUÉE - Action requise`,
      html: finalHtml,
    });
    console.log(`📧 Mail [ALERTE SÉCURITÉ RETRAIT] envoyé à ${user.email}`);
  } catch (error) {
    console.error(`❌ Erreur mail [ALERTE SÉCURITÉ RETRAIT]:`, error.message);
  }
};
// --- ⚠️ SANCTION / AVERTISSEMENT AUTOMATIQUE ---
const sendPerformanceWarning = async (flashman, rating) => {
  if (!flashman.email) return;

  const htmlContent = `
    <p style="color: #555; font-size: 16px;">Votre note moyenne est passée à <strong>${rating}/5</strong>.</p>
    <div style="background-color: #fff3cd; border-left: 4px solid #f4c414; padding: 20px; margin: 25px 0;">
      <h3 style="margin-top: 0; color: #856404;">Avertissement de performance</h3>
      <p style="margin: 0;">Votre activité actuelle ne respecte pas les standards de qualité Flashkin. Une note basse ou un taux d'annulation élevé entraîne une perte de priorité sur le radar.</p>
    </div>
    <p>Redressez la barre lors de vos prochaines courses pour éviter une suspension de compte.</p>
  `;

  const finalHtml = generateEmailHTML(flashman.firstName, "Alerte de Performance", htmlContent, "CONSULTER MON PROFIL", `${FRONTEND_URL}/settings`);

  try {
    await transporter.sendMail({
      from: `"Flashkin Support" <${process.env.EMAIL_USER}>`,
      to: flashman.email,
      subject: "⚠️ Avertissement : Qualité de service",
      html: finalHtml,
    });
    // Optionnel : Envoi d'un WhatsApp si tu as la fonction Whatixo prête
  } catch (err) {
    console.error("Erreur envoi avertissement :", err);
  }
};

// --- 🚨 ALERTE CRON : RÉVEIL DES FLASHMANS ---
const sendWakeUpAlert = async (flashman, count) => {
  if (!flashman.email) return;

  const htmlContent = `
    <h2 style="color: #24445c; font-size: 20px; margin-top: 0;">Debout ${flashman.firstName} ! 🔥</h2>
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      Il y a actuellement <strong>${count} commande(s) en attente</strong> sur le radar depuis plusieurs minutes !
    </p>
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 8px;">
      <p style="margin: 0; color: #991b1b; font-size: 14px; font-weight: bold;">
        🏃‍♂️ Les partenaires attendent ! Dépêchez-vous de vous connecter pour ramasser vos gains avant les autres !
      </p>
    </div>
  `;

  // On réutilise ton superbe template premium !
  const finalHtml = generateEmailHTML(flashman.firstName, "⚡ ALERTE RADAR FLASHKIN ⚡", htmlContent, "OUVRIR MON RADAR", `${FRONTEND_URL}/dashboard`);

  try {
    await transporter.sendMail({
      from: `"Flashkin Dispatch" <${process.env.EMAIL_USER}>`,
      to: flashman.email,
      subject: `🔥 ${count} NOUVELLES COURSES ! Ramassez-les maintenant !`,
      html: finalHtml,
    });
    console.log(`📧 Mail [RÉVEIL CRON] envoyé à ${flashman.email}`);
  } catch (error) {
    console.error(`❌ Erreur mail [RÉVEIL] pour ${flashman.email}:`, error.message);
  }
};
// ==========================================
// 🏛️ DÉCISIONS ADMINISTRATIVES (FINANCE)
// ==========================================
const sendAdminWithdrawalAction = async (user, amount, method, action, reason = "") => {
  if (!user.email) return;

  const isAccepted = action === 'ACCEPTED';
  const statusColor = isAccepted ? '#2ecc71' : '#ef4444';
  const statusBg = isAccepted ? '#eafaf1' : '#fef2f2';
  const title = isAccepted ? "Fonds transférés avec succès" : "Demande de retrait refusée";
  
  let htmlContent = `
    <p style="color: #555; font-size: 16px; line-height: 1.5;">Le service financier Flashkin a traité votre demande de retrait.</p>
    <div style="background-color: ${statusBg}; border-radius: 6px; padding: 20px; margin: 25px 0; border-left: 4px solid ${statusColor};">
      <h3 style="margin-top: 0; color: ${statusColor}; font-size: 16px;">STATUT : ${isAccepted ? 'VALIDÉ ET ENVOYÉ ✅' : 'REFUSÉ ❌'}</h3>
      <div style="margin-bottom: 10px; color: #444; font-size: 14px;"><strong>Montant :</strong> ${amount.toFixed(2)} $</div>
      <div style="margin-bottom: 10px; color: #444; font-size: 14px;"><strong>Méthode :</strong> ${method}</div>
      ${!isAccepted ? `<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #fca5a5; color: #991b1b; font-size: 14px;"><strong>Motif du refus :</strong> ${reason}</div>` : ''}
    </div>
  `;

  if (!isAccepted) {
    htmlContent += `<p style="color: #555; font-size: 14px;">Les fonds ont été intégralement recrédités sur votre solde Flashkin.</p>`;
  } else {
    htmlContent += `<p style="color: #555; font-size: 14px;">Veuillez vérifier votre compte Mobile Money. Les délais dépendent de votre opérateur.</p>`;
  }

  const finalHtml = generateEmailHTML(user.firstName, title, htmlContent, "VOIR MON PORTEFEUILLE", `${FRONTEND_URL}/wallet`);

  try {
    await transporter.sendMail({
      from: `"Flashkin Finance" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: isAccepted ? `💸 Retrait validé : ${amount}$` : `❌ Retrait refusé : ${amount}$`,
      html: finalHtml,
    });
  } catch (error) {
    console.error(`❌ Erreur mail [DECISION FINANCIERE]:`, error.message);
  }
};

// ==========================================
// 🔐 SÉCURITÉ : DOUBLE FACTEUR (OTP)
// ==========================================
const sendOtpEmail = async (user, otpCode, tempToken) => {
  try {
    // 🔗 Le lien magique qui redirige vers le frontend avec le token
    const buttonUrl = `https://flashkindelivery.netlify.app/login?token=${tempToken}&email=${encodeURIComponent(user.email)}`;

    const mailOptions = {
      from: `"Flashkin Delivery" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: '⚡ Flashkin - Votre code de sécurité de connexion',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 550px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
          <div style="text-align: center; margin-bottom: 25px;">
            <h2 style="color: #1e3a8a; margin: 0; font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Flashkin Delivery</h2>
          </div>
          
          <p style="color: #334155; font-size: 16px; line-height: 1.5;">Bonjour <strong>${user.firstName}</strong>,</p>
          <p style="color: #475569; font-size: 15px; line-height: 1.6;">
            Nous avons détecté une tentative de connexion. Pour garantir la sécurité de votre compte, veuillez confirmer qu'il s'agit bien de vous.
          </p>
          
          <div style="text-align: center; margin: 35px 0;">
            <p style="font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">Votre code à 6 chiffres</p>
            <span style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #1e3a8a; background: #f8fafc; padding: 15px 25px; border-radius: 12px; border: 2px dashed #cbd5e1; display: inline-block;">
              ${otpCode}
            </span>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <p style="color: #475569; font-size: 14px; margin-bottom: 15px;">Ou validez directement en cliquant ici :</p>
            <a href="${buttonUrl}" style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 10px; display: inline-block; box-shadow: 0 4px 15px rgba(30, 58, 138, 0.3);">
              Accéder à la vérification
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />

          <p style="font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5;">
            Ce code expirera dans 10 minutes.<br/>
            Si vous n'avez pas demandé cette connexion, ignorez cet e-mail.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Succès] Email OTP envoyé à ${user.email}`);
  } catch (error) {
    console.error("[Erreur] Échec de l'envoi de l'email OTP:", error);
    throw new Error("Impossible d'envoyer l'email OTP.");
  }
};

// ==========================================
// 🚨 SÉCURITÉ : NOUVEL APPAREIL DÉTECTÉ
// ==========================================
const sendNewDeviceAlert = async (user, deviceInfo, ipAddress) => {
  if (!user.email) return;

  const htmlContent = `
    <p style="color: #555; font-size: 16px; line-height: 1.5;">Nous avons détecté une nouvelle connexion à votre compte depuis un appareil ou un lieu inhabituel.</p>
    <div style="background-color: #fff3cd; border-radius: 6px; padding: 20px; margin: 25px 0; border-left: 4px solid #f4c414;">
      <h3 style="margin-top: 0; color: #856404; font-size: 16px;">DÉTAILS DE LA CONNEXION</h3>
      <div style="margin-bottom: 10px; color: #444; font-size: 14px;"><strong>Appareil / Navigateur :</strong> ${deviceInfo}</div>
      <div style="margin-bottom: 10px; color: #444; font-size: 14px;"><strong>Adresse IP :</strong> ${ipAddress}</div>
      <div style="margin-bottom: 10px; color: #444; font-size: 14px;"><strong>Heure :</strong> ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Kinshasa' })}</div>
    </div>
    <p style="color: #555; font-size: 14px;">Si c'est bien vous, vous pouvez ignorer ce message. <strong>Si ce n'est pas vous</strong>, modifiez votre mot de passe immédiatement.</p>
  `;

  const finalHtml = generateEmailHTML(user.firstName, "Nouvelle connexion détectée", htmlContent, "SÉCURISER MON COMPTE", `${FRONTEND_URL}/dashboard`);

  try {
    await transporter.sendMail({
      from: `"Flashkin Sécurité" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `🚨 Alerte : Nouvelle connexion sur votre compte`,
      html: finalHtml,
    });
    console.log(`📧 Mail [ALERTE CONNEXION] envoyé à ${user.email}`);
  } catch (error) {
    console.error(`❌ Erreur mail [ALERTE CONNEXION]:`, error.message);
  }
};
// 👇 L'EXPORT MIS À JOUR 👇
module.exports = { 
  sendWhatixoNotification,
  sendEmergencyAlert,
  sendLifecycleNotification, 
  sendPasswordResetOtp, 
  sendPasswordChangedConfirmation,
  sendWithdrawalSuccessEmail,
  sendWithdrawalSecurityAlert,
  sendPerformanceWarning,
  sendWakeUpAlert,
  sendAdminWithdrawalAction,
  sendOtpEmail,
  sendNewDeviceAlert

};