const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

const PORT = process.env.PORT || 3077;
const sequelize = require('./Config/db');
app.set('trust proxy', true);

const allowedOrigins = [
    "http://mobile.arenaxpro.com"
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log('--- IP DEBUG ---');
    console.log('req.ip:', req.ip);
    console.log('x-forwarded-for:', req.headers['x-forwarded-for']);
    console.log('x-real-ip:', req.headers['x-real-ip']);
    console.log('remoteAddress:', req.socket.remoteAddress);
    console.log('----------------');
    next();
});


const customerRoutes = require('./Routes/routes.customer');
app.use('/customer', customerRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'API is running' });
});
require('./Cron/Cron.CustomerChargingCron');    
const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected');
        await sequelize.sync()
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
};

connectDB();

app.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
});
