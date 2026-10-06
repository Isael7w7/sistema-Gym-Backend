const { Router } = require('express');
const {
  listarSocios,
  crearSocio,
  cobrarSocio,
} = require('../controllers/socioController');

const router = Router();

router.get('/', listarSocios);
router.post('/', crearSocio);
router.post('/:id/cobrar', cobrarSocio);

module.exports = router;
