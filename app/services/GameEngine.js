const { GameMap, Tile, Wall, DeployedAmmunition, Ammunition, Group, AttackWave, sequelize } = require('../models');
const { Op } = require('sequelize');

class GameEngine {
    constructor(mapId, io) {
        this.mapId = mapId;
        this.io = io;
        this.attackReport = [];
    }

    log(message) {
        const logEntry = { time: new Date().toISOString(), message };
        this.attackReport.push(logEntry);
        console.log(`[GameEngine MapID: ${this.mapId}] ${message}`);
        // Optionally emit detailed logs to a specific admin room if needed for real-time monitoring
        // this.io.to('admins').emit('game-engine-log', { mapId: this.mapId, log: logEntry });
    }

    async getExternalWalls() {
        this.log("شناسایی دیوارهای خارجی...");
        const tilesWithOwners = await Tile.findAll({
            where: { MapId: this.mapId, OwnerGroupId: { [Op.ne]: null } },
            include: [
                { model: Wall, as: 'walls', required: true,
                  include: [{model: DeployedAmmunition, as: 'deployedAmmunitions', include: [{model: Ammunition, as: 'ammunitionDetail'}]}] // Preload ammo for damage calculation
                },
                { model: Group, as: 'ownerGroup', attributes: ['id', 'name'] }
            ],
            order: [[sequelize.col('walls.id'), 'ASC']] // Consistent order
        });

        const map = await GameMap.findByPk(this.mapId);
        if (!map) throw new Error("نقشه برای شناسایی دیوارهای خارجی یافت نشد.");
        const mapSize = map.size;

        const externalWalls = [];

        for (const tile of tilesWithOwners) {
            for (const wall of tile.walls) {
                let isExternal = false;
                let adjacentX = tile.x;
                let adjacentY = tile.y;

                if (wall.direction === 'north') adjacentY--;
                else if (wall.direction === 'south') adjacentY++;
                else if (wall.direction === 'east') adjacentX++;
                else if (wall.direction === 'west') adjacentX--;

                if (adjacentX < 0 || adjacentX >= mapSize || adjacentY < 0 || adjacentY >= mapSize) {
                    isExternal = true;
                } else {
                    const adjacentTile = await Tile.findOne({
                        where: { MapId: this.mapId, x: adjacentX, y: adjacentY }
                    });
                    if (!adjacentTile || adjacentTile.OwnerGroupId === null) {
                        isExternal = true;
                    }
                }

                if (isExternal) {
                    externalWalls.push({ wall, tile }); // wall instance now includes its deployedAmmunitions
                    this.log(`دیوار خارجی شناسایی شد: Tile (${tile.x},${tile.y}), Wall ID ${wall.id} (${wall.direction}), Owner: ${tile.ownerGroup.name}`);
                }
            }
        }
        this.log(`تعداد ${externalWalls.length} دیوار خارجی شناسایی شد.`);
        return externalWalls;
    }

    async applyDamageToTargets(totalAttackPower, targets) {
        this.log(`توزیع قدرت حمله ${totalAttackPower} بین ${targets.length} دیوار هدف.`);
        if (!targets.length) return;

        // Simple even distribution for now. Could be weighted by wall health, etc.
        const powerPerTarget = Math.floor(totalAttackPower / targets.length);
        let remainingPowerOverall = totalAttackPower;


        for (const { wall, tile: ownerTile } of targets) {
            if(remainingPowerOverall <= 0) {
                this.log("قدرت حمله کلی به اتمام رسید.");
                break;
            }
            let powerForThisWall = Math.min(powerPerTarget > 0 ? powerPerTarget : 1, remainingPowerOverall); // Ensure at least 1 if possible
             if (targets.indexOf({wall, tile: ownerTile}) === targets.length -1 ){ // last target gets remainder
                powerForThisWall = remainingPowerOverall;
            }


            this.log(`پردازش دیوار ID ${wall.id} متعلق به گروه ${ownerTile.ownerGroup.name} در (${ownerTile.x},${ownerTile.y}) با قدرت حمله تخصیص یافته: ${powerForThisWall}`);
            let remainingAttackPowerOnWall = powerForThisWall;

            // Sort ammos by defenseLine DESC on the preloaded ammos
            const sortedAmmos = [...wall.deployedAmmunitions].sort((a, b) => b.ammunitionDetail.defenseLine - a.ammunitionDetail.defenseLine);

            for (const ammo of sortedAmmos) {
                if (remainingAttackPowerOnWall <= 0) break;
                if (ammo.health <= 0) continue;

                const damageToAmmo = Math.min(remainingAttackPowerOnWall, ammo.health);
                ammo.health -= damageToAmmo;
                remainingAttackPowerOnWall -= damageToAmmo;
                this.log(`مهمات ID ${ammo.id} (${ammo.ammunitionDetail.name}) روی دیوار ID ${wall.id} آسیب دید: ${damageToAmmo}. سلامت باقیمانده مهمات: ${ammo.health}`);

                await ammo.save();
            }

            wall.changed('deployedAmmunitions', true); // Mark as changed if Sequelize doesn't detect nested changes for emit

            if (remainingAttackPowerOnWall > 0 && wall.health > 0) {
                const damageToWall = Math.min(remainingAttackPowerOnWall, wall.health);
                wall.health -= damageToWall;
                this.log(`دیوار ID ${wall.id} آسیب دید: ${damageToWall}. سلامت باقیمانده دیوار: ${wall.health}`);
                await wall.save();

                if (wall.health <= 0) {
                    this.log(`دیوار ID ${wall.id} نابود شد. ملک (${ownerTile.x},${ownerTile.y}) مالک خود را از دست می‌دهد.`);
                    const previousOwnerId = ownerTile.OwnerGroupId;
                    ownerTile.OwnerGroupId = null;
                    await ownerTile.save();

                    const destroyedWallIds = (await Wall.findAll({where: {TileId: ownerTile.id}, attributes: ['id']})).map(w => w.id);
                    if(destroyedWallIds.length > 0) {
                        await DeployedAmmunition.destroy({where: {WallId: {[Op.in]: destroyedWallIds}}});
                    }
                    await Wall.destroy({where: {TileId: ownerTile.id}});

                    this.io.emit('tile-lost', { mapId: this.mapId, tileId: ownerTile.id, x: ownerTile.x, y: ownerTile.y, previousOwnerId });

                    const remainingTiles = await Tile.count({ where: { OwnerGroupId: previousOwnerId, MapId: this.mapId } });
                    if (remainingTiles === 0 && previousOwnerId) {
                        this.log(`گروه ID ${previousOwnerId} (${ownerTile.ownerGroup.name}) تمام املاک خود را از دست داد.`);
                        this.io.emit('group-eliminated', { mapId: this.mapId, groupId: previousOwnerId, groupName: ownerTile.ownerGroup.name });
                    }
                }
            }
            remainingPowerOverall -= (powerForThisWall - remainingAttackPowerOnWall); // Subtract actual damage dealt by this wall's processing
        }
        this.log("پردازش آسیب به دیوارها تکمیل شد.");
    }

    async cleanupDamagedAmmunition(targetedWallIds) {
        const damagedDeployedAmmos = await DeployedAmmunition.findAll({
            include: [{ model: Ammunition, as: 'ammunitionDetail', required: true, attributes: ['name', 'health'] }],
            where: {
                WallId: { [Op.in]: targetedWallIds },
                [Op.or]: [
                    { health: { [Op.lte]: 0 } },
                    sequelize.where(sequelize.col('DeployedAmmunition.health'), Op.lt, sequelize.col('ammunitionDetail.health'))
                ]
            },
            attributes: ['id', 'WallId']
        });

        if (damagedDeployedAmmos.length > 0) {
            this.log(`حذف ${damagedDeployedAmmos.length} مهمات آسیب دیده/نابود شده...`);
            for (const dAmmo of damagedDeployedAmmos) {
                 this.log(`حذف مهمات آسیب دیده ID ${dAmmo.id} (نوع: ${dAmmo.ammunitionDetail.name}) از دیوار ID ${dAmmo.WallId}.`);
            }
            await DeployedAmmunition.destroy({ where: { id: { [Op.in]: damagedDeployedAmmos.map(da => da.id) } } });
            this.log("حذف مهمات آسیب دیده تکمیل شد.");
        } else {
            this.log("هیچ مهمات آسیب دیده ای برای حذف یافت نشد.");
        }
    }


    async executeNextAttack() {
        this.attackReport = [];
        this.log("شروع اجرای موج حمله بعدی...");

        const transaction = await sequelize.transaction();
        try {
            const map = await GameMap.findByPk(this.mapId, { transaction });
            if (!map || !map.isActive) {
                await transaction.rollback();
                this.log("نقشه یافت نشد یا فعال نیست.");
                return { success: false, message: "نقشه یافت نشد یا فعال نیست.", report: this.attackReport };
            }

            const nextWave = await AttackWave.findOne({
                where: {
                    MapId: this.mapId,
                    isExecuted: false,
                    attackTime: { [Op.lte]: new Date() }
                },
                order: [['attackTime', 'ASC']],
                transaction
            });

            if (!nextWave) {
                await transaction.rollback();
                this.log("موج حمله بعدی برای اجرا یافت نشد.");
                return { success: false, message: "موج حمله بعدی برای اجرا یافت نشد.", report: this.attackReport };
            }

            this.log(`اجرای موج حمله ID: ${nextWave.id} با قدرت ${nextWave.power} در زمان ${nextWave.attackTime}`);

            const externalWallsDetails = await this.getExternalWalls(); // This is outside transaction for now, uses its own.
            if (externalWallsDetails.length > 0) {
                 await this.applyDamageToTargets(nextWave.power, externalWallsDetails);
                 await this.cleanupDamagedAmmunition(externalWallsDetails.map(ewd => ewd.wall.id));
            } else {
                this.log("هیچ دیوار خارجی برای حمله یافت نشد.");
            }

            nextWave.isExecuted = true;
            await nextWave.save({ transaction });
            this.log(`موج حمله ID: ${nextWave.id} به عنوان اجرا شده علامت‌گذاری شد.`);

            if (!map.gameLocked) {
                map.gameLocked = true;
                await map.save({ transaction });
                this.log("اولین حمله اجرا شد. بازی برای این نقشه قفل شد (gameLocked = true).");
                this.io.emit('game-locked', { mapId: this.mapId, gameLocked: true });
            }

            await transaction.commit();
            this.log("موج حمله با موفقیت اجرا و ثبت شد.");

            const updatedMapData = await require('../controllers/GameController').getFullMapState(this.mapId);
            if(updatedMapData) this.io.emit('map-updated', { map: updatedMapData });


            return { success: true, wave: nextWave.toJSON(), report: this.attackReport };

        } catch (error) {
            await transaction.rollback();
            console.error(`[GameEngine MapID: ${this.mapId}] Error executing attack wave:`, error);
            this.log(`خطا در اجرای موج حمله: ${error.message} ${error.stack}`);
            return { success: false, message: `خطا در اجرای موج حمله: ${error.message}`, report: this.attackReport };
        }
    }

    static attackSchedulerInterval = null;
    static ioInstance = null;

    static startAttackScheduler(io) {
        GameEngine.ioInstance = io;
        if (GameEngine.attackSchedulerInterval) {
            console.log("[GameEngine Scheduler] Scheduler already running.");
            return;
        }
        console.log("[GameEngine Scheduler] Starting attack scheduler (every 60 seconds)...");
        GameEngine.attackSchedulerInterval = setInterval(async () => {
            if (!GameEngine.ioInstance) {
                console.error("[GameEngine Scheduler] IO instance is not available for scheduler.");
                return;
            }
            // console.log("[GameEngine Scheduler] Tick: Checking for pending attacks...");
            const activeMaps = await GameMap.findAll({ where: { isActive: true } });

            for (const map of activeMaps) {
                const pendingWavesCount = await AttackWave.count({
                    where: {
                        MapId: map.id,
                        isExecuted: false,
                        attackTime: { [Op.lte]: new Date() }
                    }
                });

                if (pendingWavesCount > 0) {
                    console.log(`[GameEngine Scheduler] ${pendingWavesCount} pending attack(s) found for map ${map.id} (${map.name}). Triggering execution.`);
                    const engine = new GameEngine(map.id, GameEngine.ioInstance);
                    try {
                         // Intentionally not awaiting to allow parallel execution for different maps if needed,
                         // but be mindful of resource contention. For now, await might be safer.
                        await engine.executeNextAttack();
                    } catch (error) {
                        console.error(`[GameEngine Scheduler] Error auto-executing attack for map ${map.id}:`, error);
                    }
                }
            }
        }, 60000); // Check every 60 seconds
    }

    static stopAttackScheduler(){
        if(GameEngine.attackSchedulerInterval){
            clearInterval(GameEngine.attackSchedulerInterval);
            GameEngine.attackSchedulerInterval = null;
            console.log("[GameEngine Scheduler] Attack scheduler stopped.");
        }
    }
}

module.exports = GameEngine;
