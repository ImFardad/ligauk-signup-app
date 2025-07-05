const { GameMap, Tile, AttackWave, Wall, DeployedAmmunition, Group, sequelize } = require('../models');
const GameEngine = require('../services/GameEngine'); // To be created

exports.createMap = async (req, res) => {
    const { name, size } = req.body;
    if (!name || !size || parseInt(size) <= 0) {
        return res.status(400).json({ message: "نام و اندازه نقشه (بزرگتر از صفر) الزامی است." });
    }
    const mapSize = parseInt(size);

    const transaction = await sequelize.transaction();
    try {
        // Deactivate existing active maps if any
        await GameMap.update({ isActive: false }, { where: { isActive: true }, transaction });

        const newMap = await GameMap.create({ name, size: mapSize, isActive: true, gameLocked: false }, { transaction });

        const tiles = [];
        for (let y = 0; y < mapSize; y++) {
            for (let x = 0; x < mapSize; x++) {
                tiles.push({ x, y, MapId: newMap.id, price: 100 }); // Default price 100
            }
        }
        await Tile.bulkCreate(tiles, { transaction });

        await transaction.commit();
        req.io.emit('admin-settings-changed', { event: 'map_created', message: 'نقشه جدید ایجاد و فعال شد.', map: newMap });
        req.io.emit('map-list-updated');
        req.io.emit('force-reload', { message: "نقشه جدیدی ایجاد و فعال شده است."});
        res.status(201).json({ message: "نقشه با موفقیت ایجاد و فعال شد.", map: newMap });
    } catch (error) {
        await transaction.rollback();
        console.error("Error creating map:", error);
        res.status(500).json({ message: "خطا در ایجاد نقشه." });
    }
};

exports.listMaps = async (req, res) => {
    try {
        const maps = await GameMap.findAll({ order: [['createdAt', 'DESC']] });
        res.status(200).json(maps);
    } catch (error) {
        console.error("Error listing maps:", error);
        res.status(500).json({ message: "خطا در دریافت لیست نقشه‌ها." });
    }
};

exports.updateMap = async (req, res) => {
    const { mapId } = req.params;
    const { name, size, isActive, gameLocked } = req.body;

    try {
        const map = await GameMap.findByPk(mapId);
        if (!map) {
            return res.status(404).json({ message: "نقشه یافت نشد." });
        }

        if (size && parseInt(size) !== map.size) {
             return res.status(400).json({ message: "تغییر اندازه نقشه پس از ایجاد پشتیبانی نمی‌شود. لطفاً نقشه جدیدی ایجاد کنید." });
        }

        const transaction = await sequelize.transaction();
        let shouldForceReload = false;
        try {
            if (isActive === true && map.isActive === false) {
                await GameMap.update({ isActive: false }, { where: { id: { [sequelize.Op.ne]: mapId }, isActive: true }, transaction });
                shouldForceReload = true; // Activating a new map
            } else if (isActive === false && map.isActive === true) {
                shouldForceReload = true; // Deactivating current map
            }


            map.name = name !== undefined ? name : map.name;
            map.isActive = isActive !== undefined ? isActive : map.isActive;
            map.gameLocked = gameLocked !== undefined ? gameLocked : map.gameLocked;

            await map.save({ transaction });
            await transaction.commit();

            req.io.emit('admin-settings-changed', { event: 'map_updated', message: `تنظیمات نقشه ${map.name} به‌روز شد.`, mapId: map.id, newSettings: map });
            if (shouldForceReload) {
                req.io.emit('force-reload', { message: "تنظیمات نقشه فعال تغییر کرد."});
            }
            req.io.emit('map-list-updated');


            res.status(200).json({ message: "نقشه با موفقیت به‌روزرسانی شد.", map });
        } catch (innerError) {
            await transaction.rollback();
            throw innerError; // Rethrow to be caught by outer catch
        }
    } catch (error) {
        console.error("Error updating map:", error);
        res.status(500).json({ message: "خطا در به‌روزرسانی نقشه." });
    }
};


exports.createAttackWave = async (req, res) => {
    const { mapId, power, attackTime, isPowerVisible } = req.body;
    if (!mapId || !power || !attackTime) {
        return res.status(400).json({ message: "شناسه نقشه، قدرت و زمان حمله الزامی است." });
    }
    if (new Date(attackTime) <= new Date()) {
        return res.status(400).json({ message: "زمان حمله باید در آینده باشد." });
    }

    try {
        const map = await GameMap.findByPk(mapId);
        if (!map) {
            return res.status(404).json({ message: "نقشه مورد نظر یافت نشد." });
        }
        if (!map.isActive) {
            return res.status(400).json({ message: "تنها برای نقشه‌های فعال می‌توان موج حمله تعریف کرد." });
        }

        const wave = await AttackWave.create({
            MapId: mapId,
            power: parseInt(power),
            attackTime: new Date(attackTime),
            isPowerVisible: isPowerVisible !== undefined ? (String(isPowerVisible).toLowerCase() === 'true' || String(isPowerVisible) === '1') : true,
            isExecuted: false
        });

        req.io.to(`map-${mapId}`).emit('attack-imminent', { mapId, wave }); // Emit to specific map room
        req.io.emit('admin-settings-changed', { event:'attack_wave_created', message: `موج حمله جدید برای نقشه ${map.name} تعریف شد.`, wave });

        res.status(201).json({ message: "موج حمله با موفقیت تعریف شد.", wave });
    } catch (error) {
        console.error("Error creating attack wave:", error);
        res.status(500).json({ message: "خطا در تعریف موج حمله." });
    }
};

exports.listAttackWaves = async (req, res) => {
    const { mapId } = req.query;
    let whereClause = {};
    if (mapId) {
        whereClause.MapId = mapId;
    }
    try {
        const waves = await AttackWave.findAll({
            where: whereClause,
            include: [{model: GameMap, as: 'map', attributes: ['name']}],
            order: [['attackTime', 'DESC']]
        });
        res.status(200).json(waves);
    } catch (error) {
        console.error("Error listing attack waves:", error);
        res.status(500).json({ message: "خطا در دریافت لیست امواج حمله." });
    }
};

exports.executeNextAttackWave = async (req, res) => {
    const { mapId } = req.body;
     if (!mapId) {
        return res.status(400).json({ message: "شناسه نقشه الزامی است." });
    }
    try {
        const map = await GameMap.findByPk(mapId);
        if (!map) return res.status(404).json({ message: "نقشه یافت نشد" });
        if (!map.isActive) return res.status(400).json({ message: "نقشه فعال نیست" });

        const gameEngine = new GameEngine(mapId, req.io); // GameEngine needs io for emissions
        const result = await gameEngine.executeNextAttack();

        if (!result || !result.wave) { // Check if a wave was actually processed
            return res.status(404).json({ message: result.message || "موج حمله بعدی برای اجرا یافت نشد یا هم اکنون قابل اجرا نیست." });
        }

        res.status(200).json({ message: `موج حمله (ID: ${result.wave.id}) با موفقیت اجرا شد.`, report: result.report });

    } catch (error) {
        console.error("Error executing attack wave:", error);
        res.status(500).json({ message: error.message || "خطا در اجرای موج حمله." });
    }
};


exports.getTilePrices = async (req, res) => {
    try {
        const { mapId } = req.query;
        let price = 100; // Default global
        if (mapId) {
            const map = await GameMap.findByPk(mapId, { attributes: ['id']}); // Check if map exists
            if(!map){
                return res.status(404).json({message: "نقشه برای دریافت قیمت یافت نشد."})
            }
            // If you add a defaultTilePrice to GameMap model, fetch it here
            // price = map.defaultNewTilePrice || 100;
        }
        res.json({ defaultTilePrice: price });
    } catch (error) {
        console.error("Error getting tile prices:", error);
        res.status(500).json({ message: "خطا در دریافت قیمت املاک." });
    }
};

exports.setTilePrices = async (req, res) => {
    const { defaultPrice, mapId } = req.body; // mapId is optional
    if (defaultPrice === undefined || parseInt(defaultPrice) < 0) {
        return res.status(400).json({ message: "قیمت نامعتبر است." });
    }
    const newPrice = parseInt(defaultPrice);

    const transaction = await sequelize.transaction();
    try {
        let whereClause = { OwnerGroupId: null };
        let mapToUpdateIO = null;

        if (mapId) {
            const map = await GameMap.findByPk(mapId, {transaction});
            if (!map) {
                await transaction.rollback();
                return res.status(404).json({message: "نقشه یافت نشد."});
            }
            if(!map.isActive){
                await transaction.rollback();
                return res.status(400).json({message: "فقط برای نقشه فعال میتوان قیمت تعیین کرد."});
            }
            whereClause.MapId = mapId;
            mapToUpdateIO = mapId;
        } else {
            // Update for all unowned tiles across ALL active maps
            const activeMaps = await GameMap.findAll({where: {isActive: true}, attributes:['id'], transaction});
            if(!activeMaps.length){
                await transaction.rollback();
                return res.status(400).json({message: "هیچ نقشه فعالی برای تنظیم قیمت وجود ندارد."});
            }
            whereClause.MapId = {[sequelize.Op.in]: activeMaps.map(m => m.id)};
            // If affecting all active maps, could emit a general map data changed event, or loop and emit for each
        }

        const [affectedCount] = await Tile.update(
            { price: newPrice },
            { where: whereClause, transaction }
        );

        await transaction.commit();
        req.io.emit('admin-settings-changed', { event: 'tile_price_changed', message: 'قیمت املاک به‌روز شد.', newPrice, mapIdTargeted: mapId });

        if (mapToUpdateIO) { // If a specific map was targeted
             const mapData = await require('./GameController').getFullMapState(mapToUpdateIO); // Assuming GameController is correctly structured
             if(mapData) req.io.emit('map-updated', { map: mapData });
        } else { // Prices changed globally for active maps, might need a broader update or individual updates
            req.io.emit('force-reload', {message: "قیمت برخی املاک تغییر کرده است."}); // Simpler to force reload if global
        }

        res.status(200).json({ message: `قیمت ${affectedCount} ملک خالی به‌روزرسانی شد.` });
    } catch (error) {
        await transaction.rollback();
        console.error("Error setting tile prices:", error);
        res.status(500).json({ message: "خطا در تنظیم قیمت املاک." });
    }
};


exports.getWallUpgradeCosts = async (req, res) => {
    try {
        // These are currently hardcoded in GameController, but could be made dynamic via admin
        const upgradeMatrix = {
            wood: { next: 'stone', cost: 150, health: 250, currentHealth: 100 }, // Added currentHealth for reference
            stone: { next: 'metal', cost: 300, health: 500, currentHealth: 250 },
            metal: { next: null, cost: 0, health: 500, currentHealth: 500 } // Max level
        };
        res.status(200).json(upgradeMatrix);
    } catch (error) {
        console.error("Error getting wall upgrade costs:", error);
        res.status(500).json({ message: "خطا در دریافت هزینه‌های ارتقا دیوار." });
    }
};

exports.setWallUpgradeCosts = async (req, res) => {
    // This would require changing the hardcoded values or storing them in a config/DB
    // For now, this is a placeholder.
    // const { costs } = req.body; // Expecting an object like the upgradeMatrix
    console.warn("setWallUpgradeCosts is not fully implemented to change dynamic costs yet. Costs are currently hardcoded in GameController.");
    // If costs were dynamic and updated:
    // req.io.emit('admin-settings-changed', { event: 'wall_costs_changed', message: 'تنظیمات هزینه ارتقا دیوار به‌روز شد.' });
    res.status(501).json({ message: "قابلیت تنظیم هزینه ارتقا دیوار هنوز پیاده‌سازی نشده است. (مقادیر فعلی در کد ثابت هستند)" });
};

exports.resetGameData = async (req, res) => {
    const { mapId } = req.body;
    if (!mapId) {
        return res.status(400).json({ message: "شناسه نقشه برای ریست الزامی است." });
    }

    const transaction = await sequelize.transaction();
    try {
        const map = await GameMap.findByPk(mapId, { transaction });
        if (!map) {
            await transaction.rollback();
            return res.status(404).json({ message: "نقشه یافت نشد." });
        }

        const wallsOfMap = await Wall.findAll({
            include: [{ model: Tile, as: 'tile', where: { MapId: mapId }, attributes: [] }],
            attributes: ['id'],
            transaction
        });
        const wallIds = wallsOfMap.map(w => w.id);

        if (wallIds.length > 0) {
            await DeployedAmmunition.destroy({ where: { WallId: { [sequelize.Op.in]: wallIds } }, transaction });
            await Wall.destroy({ where: { id: { [sequelize.Op.in]: wallIds } }, transaction }); // Destroy walls to recreate them clean later
        }

        await Tile.update({ OwnerGroupId: null, price: 100 }, { where: { MapId: mapId }, transaction });

        // Re-create initial walls for all tiles of this map as they are now unowned
        const tilesOfMap = await Tile.findAll({where: {MapId: mapId}, attributes: ['id'], transaction});
        for(const tile of tilesOfMap){
            const wallData = [
                { direction: 'north', TileId: tile.id, health: 100, type: 'wood' },
                { direction: 'east',  TileId: tile.id, health: 100, type: 'wood' },
                { direction: 'south', TileId: tile.id, health: 100, type: 'wood' },
                { direction: 'west',  TileId: tile.id, health: 100, type: 'wood' },
            ];
            await Wall.bulkCreate(wallData, { transaction });
        }


        // Reset Group Colors for groups that had an owner on this map.
        // More targeted than resetting all group colors.
        const groupsOnMap = await Tile.findAll({
            attributes: [[sequelize.fn('DISTINCT', sequelize.col('OwnerGroupId')), 'OwnerGroupId']],
            where: { MapId: mapId, OwnerGroupId: {[sequelize.Op.ne]: null} },
            transaction,
            raw: true
        });
        const groupIdsOnMap = groupsOnMap.map(g => g.OwnerGroupId).filter(id => id != null);
        if(groupIdsOnMap.length > 0){
            await Group.update({ color: null }, { where: { id: {[sequelize.Op.in]: groupIdsOnMap} }, transaction });
        }
        // Score reset is a big decision, usually not part of a simple map reset unless intended.
        // await Group.update({ score: 250 }, { where: { id: {[sequelize.Op.in]: groupIdsOnMap} }, transaction });


        await AttackWave.destroy({ where: { MapId: mapId }, transaction });

        map.gameLocked = false;
        await map.save({ transaction });

        await transaction.commit();

        req.io.emit('admin-settings-changed', { event: 'game_reset', message: `اطلاعات بازی برای نقشه ${map.name} ریست شد.`, mapId });
        const mapData = await require('./GameController').getFullMapState(mapId);
        if(mapData) req.io.emit('map-updated', { map: mapData });
        req.io.emit('force-reload', { message: `بازی برای نقشه ${map.name} توسط ادمین ریست شد.`})

        res.status(200).json({ message: `اطلاعات بازی برای نقشه '${map.name}' با موفقیت ریست شد.` });

    } catch (error) {
        await transaction.rollback();
        console.error("Error resetting game data for map:", error);
        res.status(500).json({ message: "خطا در ریست کردن اطلاعات بازی." });
    }
};
