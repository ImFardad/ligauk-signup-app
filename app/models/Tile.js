'use strict';
module.exports = (sequelize, DataTypes) => {
  const Tile = sequelize.define('Tile', {
    x: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    y: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100 // Default price, can be changed by admin
    }
    // OwnerGroupId will be added via association
    // MapId will be added via association
  });

  Tile.associate = function(models) {
    Tile.belongsTo(models.GameMap, {
      foreignKey: {
        name: 'MapId',
        allowNull: false
      },
      as: 'map'
    });
    Tile.belongsTo(models.Group, {
      foreignKey: {
        name: 'OwnerGroupId',
        allowNull: true // Can be null if no group owns it
      },
      as: 'ownerGroup'
    });
    Tile.hasMany(models.Wall, { foreignKey: 'TileId', as: 'walls' });
  };

  return Tile;
};
