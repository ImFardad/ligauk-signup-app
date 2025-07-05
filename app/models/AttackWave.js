'use strict';
module.exports = (sequelize, DataTypes) => {
  const AttackWave = sequelize.define('AttackWave', {
    power: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    attackTime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    isPowerVisible: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isExecuted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
    // MapId will be added via association
  });

  AttackWave.associate = function(models) {
    AttackWave.belongsTo(models.GameMap, {
      foreignKey: {
        name: 'MapId',
        allowNull: false
      },
      as: 'map'
    });
  };

  return AttackWave;
};
