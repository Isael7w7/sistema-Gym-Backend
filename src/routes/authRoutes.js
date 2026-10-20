<<<<<<< HEAD
const { Router } = require('express');
const { login } = require('../controllers/authController');

const router = Router();

router.post('/login', login);
=======
const express = require('express');
const authController = require('../controllers/authController');
const { autenticarToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/recuperar-password', authController.recuperarPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/me', autenticarToken, authController.me);
>>>>>>> d2fafa7062b37ca962cba303a3d4fec0a1868ba7

module.exports = router;
