const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MinigamePlayer = sequelize.define('MinigamePlayer', {
    groupId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      references: {
        model: 'Groups', // Name of the table, usually plural
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    positionX: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    positionY: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    positionZ: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0, // Represents height, 0 could be ground level
    },
    fuel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10, // Starting fuel
    },
    isConnected: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    lastSeen: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    // Potentially add cameraAngle (0, 90, 180, 270) if needed to be persistent
    // cameraAngle: {
    //   type: DataTypes.INTEGER,
    //   allowNull: false,
    //   defaultValue: 0, // 0: North, 90: East, 180: South, 270: West
    // }
  }, {
    timestamps: true, // To track when player data was last updated
  });

  MinigamePlayer.associate = (models) => {
    MinigamePlayer.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' });
  };

  return MinigamePlayer;
};
