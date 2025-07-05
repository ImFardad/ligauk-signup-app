const express = require('express');
const router = express.Router();
const adminGameController = require('../controllers/adminGameController');
const adminAmmunitionController = require('../controllers/adminAmmunitionController');

// Middleware to pass io, similar to user routes if needed by controllers directly,
// or rely on req.app.get('io') within controllers.
// For consistency with how other admin routes might be structured (passing io at router level):
router.use((req, res, next) => {
    req.io = req.app.get('io');
    next();
});

// Game Map Management
router.post('/maps', adminGameController.createMap);
router.get('/maps', adminGameController.listMaps);
router.put('/maps/:mapId', adminGameController.updateMap);
// router.delete('/maps/:mapId', adminGameController.deleteMap); // Optional

// Attack Wave Management
router.post('/attack-waves', adminGameController.createAttackWave);
router.get('/attack-waves', adminGameController.listAttackWaves);
// router.put('/attack-waves/:waveId', adminGameController.updateAttackWave); // Optional
// router.delete('/attack-waves/:waveId', adminGameController.deleteAttackWave); // Optional
router.post('/attack-waves/execute', adminGameController.executeNextAttackWave);

// Pricing Management
router.get('/prices/tiles', adminGameController.getTilePrices);
router.post('/prices/tiles', adminGameController.setTilePrices);
router.get('/prices/walls', adminGameController.getWallUpgradeCosts);
router.post('/prices/walls', adminGameController.setWallUpgradeCosts);

// Ammunition CRUD
router.post('/ammunition', adminAmmunitionController.uploadImage, adminAmmunitionController.createAmmunition);
router.get('/ammunition', adminAmmunitionController.listAmmunitions);
router.put('/ammunition/:id', adminAmmunitionController.uploadImage, adminAmmunitionController.updateAmmunition);
router.delete('/ammunition/:id', adminAmmunitionController.deleteAmmunition);

// Game Reset
router.post('/game/reset', adminGameController.resetGameData);

module.exports = router;
