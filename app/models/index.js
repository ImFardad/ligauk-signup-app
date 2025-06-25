// app/models/index.js

const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'mysql',
  logging: false,
  dialectOptions: {
    connectTimeout: 60000
  },
  pool: {
    max: 50,
    min: 10,
    acquire: 30000,
    idle: 10000
  }
});

const db = {
  sequelize,
  Sequelize
};

// load each model, passing both sequelize instance and DataTypes
db.User                    = require('./user')(sequelize, DataTypes);
db.Admin                   = require('./admin')(sequelize, DataTypes);
db.Group                   = require('./group')(sequelize, DataTypes);
db.GroupMember             = require('./GroupMember')(sequelize, DataTypes);
db.Announcement            = require('./announcement')(sequelize, DataTypes);
db.AnnouncementAttachment  = require('./announcementAttachment')(sequelize, DataTypes);
db.Content                 = require('./content')(sequelize, DataTypes);
db.ContentAttachment       = require('./contentAttachment')(sequelize, DataTypes);
db.Currency                = require('./currency')(sequelize, DataTypes);
db.Wallet                  = require('./wallet')(sequelize, DataTypes);
db.UniqueItem              = require('./uniqueItem')(sequelize, DataTypes);
db.FeatureFlag             = require('./featureFlag')(sequelize, DataTypes);
db.MinigameMapBlock        = require('./MinigameMapBlock')(sequelize, DataTypes);
db.MinigamePlayer          = require('./MinigamePlayer')(sequelize, DataTypes);
db.MinigameTreasureBox     = require('./MinigameTreasureBox')(sequelize, DataTypes);

// set up associations
Object.values(db).forEach(model => {
  if (typeof model.associate === 'function') {
    model.associate(db);
  }
});

module.exports = db;