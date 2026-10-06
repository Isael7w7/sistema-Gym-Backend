const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const socioRoutes = require('./routes/socioRoutes');
const openapiSpec = require('./swagger');

const app = express();

app.use(cors());
app.use(express.json());

// Documentación interactiva de la API
app.get('/api-docs.json', (req, res) => {
  res.json(openapiSpec);
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, { explorer: true }));

app.use('/api/socios', socioRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
