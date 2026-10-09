const express = require('express');
const router = express.Router();
const apiAuth = require('../middleware/middleware.apiAuth')
const Customer = require('../Controllers/Controller.Customer');
router.post('/store-customer' , Customer);


module.exports = router;
