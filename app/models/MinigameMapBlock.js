const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MinigameMapBlock = sequelize.define('MinigameMapBlock', {
    x: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
    y: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
    z: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING, // e.g., 'grass', 'dirt', 'water', 'stone', 'wood_log', 'bridge_wood', 'mountain', 'sand', 'tree_trunk', 'leaves'
      allowNull: false,
    },
    isWalkable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    // For future use, e.g. if a block has special properties
    // properties: {
    //   type: DataTypes.JSON,
    //   allowNull: true,
    // }
  }, {
    timestamps: false, // No createdAt/updatedAt for map blocks
    indexes: [
      {
        unique: true,
        fields: ['x', 'y', 'z']
      }
    ]
  });

  return MinigameMapBlock;
};
