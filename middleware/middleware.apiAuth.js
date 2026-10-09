const API_TOKEN = process.env.API_TOKEN;

const apiAuth = (req, res, next) => {
    const token = req.headers['x-api-token'];

    if (!token) {
        return res.status(401).json({
            message: 'API token missing'
        });
    }

    if (token !== API_TOKEN) {
        return res.status(401).json({
            message: 'Invalid API token'
        });
    }

    next();
};

module.exports = apiAuth;
