'use strict';
module.exports = (sequelize, DataTypes) => {
  const DeployedAmmunition = sequelize.define('DeployedAmmunition', {
    health: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Current health of the deployed ammunition'
    }
    // WallId will be added via association
    // AmmunitionId will be added via association
  });

  DeployedAmmunition.associate = function(models) {
    DeployedAmmunition.belongsTo(models.Wall, {
      foreignKey: {
        name: 'WallId',
        allowNull: false
      },
      as: 'wall'
    });
    DeployedAmmunition.belongsTo(models.Ammunition, {
      foreignKey: {
        name: 'AmmunitionId',
        allowNull: false
      },
      as: 'ammunitionDetail'
    });
  };

  return DeployedAmmunition;
};
