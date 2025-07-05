const { GameMap, Tile, AttackWave, Wall, DeployedAmmunition, Group, sequelize } = require('../models');
const { Op } = require('sequelize'); // Ensuring Op is imported
const GameEngine = require('../services/GameEngine');

exports.createMap = async (req, res) => {
    const { name, size } = req.body;
    if (!name || !size || parseInt(size) <= 0) {
        return res.status(400).json({ message: "نام و اندازه نقشه (بزرگتر از صفر) الزامی است." });
    }
    const mapSize = parseInt(size);

    const transaction = await sequelize.transaction();
    try {
        await GameMap.update({ isActive: false }, { where: { isActive: true }, transaction });
        const newMap = await GameMap.create({ name, size: mapSize, isActive: true, gameLocked: false }, { transaction });
        const tiles = [];
        for (let y = 0; y < mapSize; y++) {
            for (let x = 0; x < mapSize; x++) {
                tiles.push({ x, y, MapId: newMap.id, price: 100 });
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
                await GameMap.update({ isActive: false }, { where: { id: { [Op.ne]: mapId }, isActive: true }, transaction });
                shouldForceReload = true;
            } else if (isActive === false && map.isActive === true) {
                shouldForceReload = true;
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
            throw innerError;
        }
    } catch (error) {
        console.error("Error updating map:", error);
        res.status(500).json({ message: "خطا در به‌روزرسانی نقشه." });
    }
};

exports.createAttackWave = async (req, res) => {
    const { mapId, power, durationValue, durationUnit, isPowerVisible } = req.body;

    if (mapId === undefined || power === undefined || durationValue === undefined || durationUnit === undefined) {
        return res.status(400).json({ message: "شناسه نقشه، قدرت، مقدار زمان و واحد زمان برای حمله الزامی است." });
    }
    const numPower = parseInt(power);
    if (isNaN(numPower) || numPower <= 0) {
        return res.status(400).json({ message: "قدرت حمله باید یک عدد مثبت باشد." });
    }
    const numDuration = parseInt(durationValue);
    if (isNaN(numDuration) || numDuration <= 0) {
        return res.status(400).json({ message: "مقدار زمان باید یک عدد مثبت باشد." });
    }

    let durationInMilliseconds;
    switch (durationUnit) {
        case 'minutes':
            durationInMilliseconds = numDuration * 60 * 1000;
            break;
        case 'hours':
            durationInMilliseconds = numDuration * 60 * 60 * 1000;
            break;
        case 'days':
            durationInMilliseconds = numDuration * 24 * 60 * 60 * 1000;
            break;
        default:
            return res.status(400).json({ message: "واحد زمان نامعتبر است. گزینه‌های مجاز: 'minutes', 'hours', 'days'." });
    }

    const finalAttackTime = new Date(Date.now() + durationInMilliseconds);

    try {
        const map = await GameMap.findByPk(mapId);
        if (!map) {
            return res.status(404).json({ message: "نقشه مورد نظر یافت نشد." });
        }
        if (!map.isActive) {
            return res.status(400).json({ message: "تنها برای نقشه‌های فعال می‌توان موج حمله تعریف کرد." });
        }

        const newWaveInstance = await AttackWave.create({
            MapId: mapId,
            power: numPower,
            attackTime: finalAttackTime,
            isPowerVisible: isPowerVisible !== undefined ? (String(isPowerVisible).toLowerCase() === 'true' || String(isPowerVisible) === '1') : true,
            isExecuted: false
        });

        const waveDataForNotification = {
            id: newWaveInstance.id,
            mapId: newWaveInstance.MapId,
            power: newWaveInstance.power,
            attackTime: newWaveInstance.attackTime,
            isPowerVisible: newWaveInstance.isPowerVisible,
            isExecuted: newWaveInstance.isExecuted
        };

        req.io.emit('attack-imminent', { mapId: newWaveInstance.MapId, wave: waveDataForNotification });

        req.io.emit('admin-settings-changed', {
            event: 'attack_wave_created',
            message: `موج حمله جدید برای نقشه ${map.name} تعریف شد.`,
            wave: waveDataForNotification
        });

        res.status(201).json({ message: "موج حمله با موفقیت تعریف شد.", wave: waveDataForNotification });

    } catch (error) {
        console.error("Error creating attack wave (full error):", error);
        res.status(500).json({ message: "خطا در سرور هنگام تعریف موج حمله. جزئیات در لاگ سرور." });
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

        const gameEngine = new GameEngine(mapId, req.io);
        const result = await gameEngine.executeNextAttack();

        if (!result || !result.wave) {
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
        let price = 100;
        if (mapId) {
            const map = await GameMap.findByPk(mapId, { attributes: ['id']});
            if(!map){
                return res.status(404).json({message: "نقشه برای دریافت قیمت یافت نشد."})
            }
        }
        res.json({ defaultTilePrice: price });
    } catch (error) {
        console.error("Error getting tile prices:", error);
        res.status(500).json({ message: "خطا در دریافت قیمت املاک." });
    }
};

exports.setTilePrices = async (req, res) => {
    const { defaultPrice, mapId } = req.body;
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
            const activeMaps = await GameMap.findAll({where: {isActive: true}, attributes:['id'], transaction});
            if(!activeMaps.length){
                await transaction.rollback();
                return res.status(400).json({message: "هیچ نقشه فعالی برای تنظیم قیمت وجود ندارد."});
            }
            whereClause.MapId = {[Op.in]: activeMaps.map(m => m.id)};
        }

        const [affectedCount] = await Tile.update(
            { price: newPrice },
            { where: whereClause, transaction }
        );

        await transaction.commit();
        req.io.emit('admin-settings-changed', { event: 'tile_price_changed', message: 'قیمت املاک به‌روز شد.', newPrice, mapIdTargeted: mapId });

        if (mapToUpdateIO) {
             const mapData = await require('./GameController').getFullMapState(mapToUpdateIO);
             if(mapData) req.io.emit('map-updated', { map: mapData });
        } else {
            req.io.emit('force-reload', {message: "قیمت برخی املاک تغییر کرده است."});
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
        const upgradeMatrix = {
            wood: { next: 'stone', cost: 150, health: 250, currentHealth: 100 },
            stone: { next: 'metal', cost: 300, health: 500, currentHealth: 250 },
            metal: { next: null, cost: 0, health: 500, currentHealth: 500 }
        };
        res.status(200).json(upgradeMatrix);
    } catch (error) {
        console.error("Error getting wall upgrade costs:", error);
        res.status(500).json({ message: "خطا در دریافت هزینه‌های ارتقا دیوار." });
    }
};

exports.setWallUpgradeCosts = async (req, res) => {
    console.warn("setWallUpgradeCosts is not fully implemented to change dynamic costs yet. Costs are currently hardcoded in GameController.");
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
            await DeployedAmmunition.destroy({ where: { WallId: { [Op.in]: wallIds } }, transaction });
            await Wall.destroy({ where: { id: { [Op.in]: wallIds } }, transaction });
        }

        await Tile.update({ OwnerGroupId: null, price: 100 }, { where: { MapId: mapId }, transaction });

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

        const groupsOnMap = await Tile.findAll({
            attributes: [[sequelize.fn('DISTINCT', sequelize.col('OwnerGroupId')), 'OwnerGroupId']],
            where: { MapId: mapId, OwnerGroupId: {[Op.ne]: null} },
            transaction,
            raw: true
        });
        const groupIdsOnMap = groupsOnMap.map(g => g.OwnerGroupId).filter(id => id != null);
        if(groupIdsOnMap.length > 0){
            await Group.update({ color: null }, { where: { id: {[Op.in]: groupIdsOnMap} }, transaction });
        }
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
