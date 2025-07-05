'use strict';
module.exports = (sequelize, DataTypes) => {
  const GameMap = sequelize.define('GameMap', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'e.g., 20 for a 20x20 map'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    gameLocked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Becomes true after the first attack, no new groups can join'
    }
  });

  GameMap.associate = function(models) {
    GameMap.hasMany(models.Tile, { foreignKey: 'MapId', as: 'tiles' });
    GameMap.hasMany(models.AttackWave, { foreignKey: 'MapId', as: 'attackWaves' });
  };

  return GameMap;
};
