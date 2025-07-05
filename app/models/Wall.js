'use strict';
module.exports = (sequelize, DataTypes) => {
  const Wall = sequelize.define('Wall', {
    direction: {
      type: DataTypes.ENUM('north', 'east', 'south', 'west'),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('wood', 'stone', 'metal'),
      defaultValue: 'wood'
    },
    health: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100 // Default health for a wood wall
    }
    // TileId will be added via association
  });

  Wall.associate = function(models) {
    Wall.belongsTo(models.Tile, {
      foreignKey: {
        name: 'TileId',
        allowNull: false
      },
      as: 'tile'
    });
    Wall.hasMany(models.DeployedAmmunition, { foreignKey: 'WallId', as: 'deployedAmmunitions' });
  };

  return Wall;
};
