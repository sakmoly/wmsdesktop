// wms-api/src/routes/index.js

// Add this import at the top
const { updateCartonStatus } = require('../modules/cartons/cartonController');
const { authenticate } = require('../middleware/auth');

// Add this route in your routes section
router.post('/api/cartons/update-status', authenticate, updateCartonStatus);

