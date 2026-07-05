const express = require('express');
const router = express.Router();
const { createProduct, getPartnerProducts, updateProduct, deleteProduct } = require('../controllers/productController');
const { protect } = require('../middlewares/authMiddleware'); 
console.log("TEST IMPORT MIDDLEWARE:", typeof protect);
console.log("TEST IMPORT CONTROLLER:", typeof createProduct);

router.use(protect); // <-- Ligne 7 qui crashe
// Toutes les routes de catalogue nécessitent d'être connecté
router.use(protect);

router.route('/')
  .post(createProduct)       // POST http://localhost:3000/api/products
  .get(getPartnerProducts);  // GET http://localhost:3000/api/products

router.route('/:id')
  .put(updateProduct)        // PUT http://localhost:3000/api/products/:id
  .delete(deleteProduct);    // DELETE http://localhost:3000/api/products/:id

module.exports = router;