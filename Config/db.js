const { Sequelize } = require('sequelize');
require('dotenv').config();

const db_host = process.env.db_Host;
const db_Username = process.env.db_Username;
const db_Password = process.env.db_Password;
const db_database = process.env.db_database;

const sequelize = new Sequelize(db_database, db_Username, db_Password, {
    host: db_host,
    dialect: "mysql",
    logging: false
});

module.exports = sequelize;