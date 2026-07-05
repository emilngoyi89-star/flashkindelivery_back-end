const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const COLORS = {
  blue: '#24445c',
  yellow: '#f4c414',
  dark: '#333333',
  gray: '#777777',
  lightGray: '#f8f9fa'
};

// --- EN-TÊTE OFFICIEL ---
const drawOfficialHeader = async (doc, title, subtitle) => {
  // Bandeau jaune fin en haut
  doc.rect(0, 0, doc.page.width, 5).fill(COLORS.yellow);

  // Logo textuel (Gauche)
  doc.fillColor(COLORS.blue).fontSize(28).font('Helvetica-Bold').text('FLASHKIN', 50, 40);
  doc.fontSize(12).font('Helvetica').text('DELIVERY SERVICE', 50, 68);

  // Coordonnées (Droite) - Sécurisé avec la largeur de page
  doc.fillColor(COLORS.gray).fontSize(9)
     .text('Kinshasa, RDC - Limete 7ème Rue', 0, 45, { align: 'right', width: doc.page.width - 50 })
     .text('Email : flashkindelivrary@gmail.com', 0, 60, { align: 'right', width: doc.page.width - 50 })
     .text('Tél : +243 99 426 9314', 0, 75, { align: 'right', width: doc.page.width - 50 });

  // Ligne de séparation
  doc.moveTo(50, 105).lineTo(doc.page.width - 50, 105).strokeColor('#140f0f').lineWidth(1).stroke();

  // Titres centrés (Coordonnées Y fixes : 130 et 155)
  doc.fillColor(COLORS.dark).fontSize(20).font('Helvetica-Bold').text(title, 0, 130, { align: 'center', width: doc.page.width, characterSpacing: 1 });
  doc.fillColor(COLORS.gray).fontSize(12).font('Helvetica').text(subtitle, 0, 155, { align: 'center', width: doc.page.width });
};

// --- PIED DE PAGE OFFICIEL ---
const drawOfficialFooter = async (doc, qrData) => {
  const bottomY = doc.page.height - 130;

  // Ligne de séparation basse
  doc.moveTo(50, bottomY).lineTo(doc.page.width - 50, bottomY).strokeColor('#dddddd').lineWidth(1).stroke();

  // Mentions Légales
  doc.fillColor(COLORS.gray).fontSize(8).font('Helvetica')
     .text('FLASHKIN DELIVERY LOG - Société de logistique (SL)', 50, bottomY + 15, { align: 'center', width: doc.page.width - 100 })
     .text('RCCM: CD/KIN/RCCM/14-B-XXXX | Id. Nat.: 01-G4500-NXXXXX | Numéro d\'Impôt: A0000000X', 50, bottomY + 28, { align: 'center', width: doc.page.width - 100 })
     .text('Document généré électroniquement, valant preuve de transaction financière.', 50, bottomY + 41, { align: 'center', width: doc.page.width - 100 });

  // QR Code
  try {
    const qrDataUrl = await QRCode.toDataURL(qrData, { width: 70, margin: 0 });
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    doc.image(qrBuffer, 50, bottomY + 10, { width: 50 });
  } catch (err) {
    console.error('Erreur QR Code', err);
  }
};

// --- 1. RAPPORT ADMINISTRATEUR ---
const generateAdminReport = async (stats, res) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Flashkin_Rapport_${Date.now()}.pdf`);
  doc.pipe(res);

  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  await drawOfficialHeader(doc, 'RAPPORT FINANCIER GLOBAL', `Arrêté au ${dateStr}`);

  // Position Y fixe pour la boîte grise
  const boxTop = 210; 
  
  // Boîte grise
  doc.rect(50, boxTop, doc.page.width - 100, 150).fill(COLORS.lightGray);
  
  // Textes dans la boîte grise
  doc.fillColor(COLORS.dark).fontSize(12).font('Helvetica-Bold').text('DÉTAIL DE L\'ACTIVITÉ LOGISTIQUE', 70, boxTop + 25);
  doc.moveTo(70, boxTop + 45).lineTo(doc.page.width - 70, boxTop + 45).strokeColor('#cccccc').lineWidth(1).stroke();

  doc.font('Helvetica').fontSize(11).fillColor(COLORS.dark);
  doc.text(`Volume total des livraisons réussies :`, 70, boxTop + 65).text(`${stats.totalDeliveries}`, 0, boxTop + 65, { align: 'right', width: doc.page.width - 70 });
  doc.text(`Chiffre d'Affaires Brut Généré :`, 70, boxTop + 95).text(`${stats.totalRevenue}.00 $`, 0, boxTop + 95, { align: 'right', width: doc.page.width - 70 });
  
  doc.fillColor('#d9534f'); // Rouge pour la dette
  doc.text(`Dettes Fournisseurs (Payé aux livreurs) :`, 70, boxTop + 125).text(`- ${stats.paidToDrivers}.00 $`, 0, boxTop + 125, { align: 'right', width: doc.page.width - 70 });

  // Position Y fixe pour le bénéfice
  const profitTop = boxTop + 200;

  // Boîte bleue du bénéfice
  doc.rect(50, profitTop, doc.page.width - 100, 60).fill(COLORS.blue).stroke();
  doc.fillColor(COLORS.yellow).fontSize(16).font('Helvetica-Bold')
     .text(`BÉNÉFICE NET FLASHKIN : ${stats.flashkinNetProfit}.00 $`, 0, profitTop + 22, { align: 'center', width: doc.page.width });

  // Signatures (Fixées au-dessus du footer)
  const signTop = doc.page.height - 250;
  doc.fillColor(COLORS.dark).fontSize(11).font('Helvetica-Bold').text('La Direction Financière', 0, signTop, { align: 'right', width: doc.page.width - 60 });
  doc.font('Times-Italic').fontSize(24).text('Mr Landry Emil', 0, signTop + 20, { align: 'right', width: doc.page.width - 60 });

  await drawOfficialFooter(doc, `AUTH-ADMIN-${Date.now()}-TOTAL:${stats.totalRevenue}`);
  // Appel de la fonction filigrane 👇👇
  drawWatermark(doc);
  doc.end();
};

// --- 2. REÇU DU FLASHMAN ---
const generateDriverReceipt = async (driver, res) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Flashkin_Reçu_${driver.firstName}.pdf`);
  doc.pipe(res);

  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  await drawOfficialHeader(doc, 'REÇU DE PAIEMENT - LIVREUR (flashman)', `Édité le ${dateStr}`);

  // Position Y fixe pour la première boîte
  const infoTop = 210;

  doc.rect(50, infoTop, doc.page.width - 100, 90).strokeColor(COLORS.blue).lineWidth(1).stroke();
  doc.fillColor(COLORS.blue).fontSize(12).font('Helvetica-Bold').text('INFORMATIONS DU PARTENAIRE', 70, infoTop + 20);
  doc.fillColor(COLORS.dark).fontSize(11).font('Helvetica')
     .text(`Nom complet : ${driver.firstName} ${driver.lastName}`, 70, infoTop + 45)
     .text(`Matricule : FLASH-${driver.id.slice(0, 6).toUpperCase()}`, 70, infoTop + 65)
     .text(`Contact : ${driver.email}`, 300, infoTop + 45);

  const detailTop = infoTop + 130;
  
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(14).text('DÉTAIL DES GAINS', 50, detailTop);
  doc.moveTo(50, detailTop + 20).lineTo(doc.page.width - 50, detailTop + 20).strokeColor('#dddddd').lineWidth(1).stroke();
  
  doc.font('Helvetica').fontSize(12);
  doc.text('Commissions accumulées sur livraisons :', 50, detailTop + 40).text(`${driver.balance}.00 $`, 0, detailTop + 40, { align: 'right', width: doc.page.width - 50 });
  
  const netTop = detailTop + 80;

  doc.rect(50, netTop, doc.page.width - 100, 60).fill(COLORS.yellow).stroke();
  doc.fillColor(COLORS.blue).fontSize(18).font('Helvetica-Bold')
     .text(`NET À PAYER : ${driver.balance}.00 $`, 0, netTop + 20, { align: 'center', width: doc.page.width });

  doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica')
     .text('Note : Ce montant correspond aux courses validées et livrées. Le paiement sera effectué selon le mode de retrait choisi. En cas de réclamation, contactez le support. Flashkin delivrery vous remercie pour votre service !', 50, netTop + 80, { width: doc.page.width - 100, align: 'justify', lineGap: 3 });

  const signTop = doc.page.height - 250;
  doc.fillColor(COLORS.dark).fontSize(11).font('Helvetica-Bold').text('Visa de la Comptabilité', 0, signTop, { align: 'right', width: doc.page.width - 60 });
  doc.font('Times-Italic').fontSize(24).text('Validé', 0, signTop + 20, { align: 'right', width: doc.page.width - 60 });


  await drawOfficialFooter(doc, `AUTH-DRIVER-${driver.id}-PAY:${driver.balance}`);
  drawWatermark(doc);
  doc.end();
};

// --- LE FILIGRANE (WATERMARK) ---
const drawWatermark = (doc) => {
  doc.save(); // On sauvegarde l'état normal du stylo
  doc.fillOpacity(0.06); // Transparence à 6% (très léger)
  doc.fillColor(COLORS.blue);
  doc.fontSize(65).font('Helvetica-Bold');
  
  // On incline le texte à -45 degrés depuis le centre de la page
  doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
  
  // On dessine le texte au milieu
  doc.text('FLASHKIN DELIVERY', -100, doc.page.height / 2 - 50, {
    width: doc.page.width + 200,
    align: 'center'
  });
  
  doc.restore(); // On remet le stylo à la normale
};

// ... (Garde tout le code existant en haut, jusqu'au drawWatermark)

// --- 3. REÇU DE RETRAIT DU PARTENAIRE (Cashout) ---
const generatePartnerReceipt = async (partner, transactionData, res) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Flashkin_Retrait_${partner.firstName}_${Date.now()}.pdf`);
  doc.pipe(res);

  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  await drawOfficialHeader(doc, 'REÇU DE DÉCAISSEMENT (CASHOUT)', `Édité le ${dateStr}`);

  // Boîte d'information Partenaire
  const infoTop = 210;
  doc.rect(50, infoTop, doc.page.width - 100, 90).strokeColor(COLORS.blue).lineWidth(1).stroke();
  doc.fillColor(COLORS.blue).fontSize(12).font('Helvetica-Bold').text('INFORMATIONS DU BÉNÉFICIAIRE', 70, infoTop + 20);
  doc.fillColor(COLORS.dark).fontSize(11).font('Helvetica')
     .text(`Partenaire : ${partner.firstName} ${partner.lastName}`, 70, infoTop + 45)
     .text(`ID Compte : PART-${partner.id.slice(0, 6).toUpperCase()}`, 70, infoTop + 65)
     .text(`Méthode de réception : ${transactionData.method}`, 300, infoTop + 45)
     .text(`Téléphone / Compte : ${transactionData.phone}`, 300, infoTop + 65);

  const detailTop = infoTop + 130;
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(14).text('DÉTAILS DE LA TRANSACTION', 50, detailTop);
  doc.moveTo(50, detailTop + 20).lineTo(doc.page.width - 50, detailTop + 20).strokeColor('#dddddd').lineWidth(1).stroke();
  
  doc.font('Helvetica').fontSize(12);
  doc.text('Statut de la demande :', 50, detailTop + 40).fillColor('#f59e0b').text('EN ATTENTE DE TRAITEMENT', 0, detailTop + 40, { align: 'right', width: doc.page.width - 50 });
  
  const netTop = detailTop + 80;
  doc.rect(50, netTop, doc.page.width - 100, 60).fill(COLORS.blue).stroke();
  doc.fillColor(COLORS.yellow).fontSize(18).font('Helvetica-Bold')
     .text(`MONTANT DEMANDÉ : ${transactionData.amount}.00 $`, 0, netTop + 20, { align: 'center', width: doc.page.width });

  doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica')
     .text('Note : Votre demande de retrait a bien été enregistrée et déduite de votre solde Flashkin. Notre équipe comptable effectuera le transfert vers votre compte Mobile Money/Banque dans un délai maximum de 24h ouvrées.', 50, netTop + 80, { width: doc.page.width - 100, align: 'justify', lineGap: 3 });

  const signTop = doc.page.height - 250;
  doc.fillColor(COLORS.dark).fontSize(11).font('Helvetica-Bold').text('Direction Financière Flashkin', 0, signTop, { align: 'right', width: doc.page.width - 60 });
  doc.font('Times-Italic').fontSize(20).text('Enregistré automatiquement', 0, signTop + 20, { align: 'right', width: doc.page.width - 60 });

  await drawOfficialFooter(doc, `AUTH-CASHOUT-${partner.id}-${transactionData.amount}`);
  drawWatermark(doc);
  doc.end();
};

// Exporte bien toutes tes fonctions à la fin
module.exports = { generateAdminReport, generateDriverReceipt, generatePartnerReceipt };