const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// রিচার্জ ফাংশন রাউট
const rechargeHandler = require('./recharge_3.js').handler;
app.post('/recharge', async (req, res) => {
  const event = { httpMethod: 'POST', body: JSON.stringify(req.body) };
  const result = await rechargeHandler(event);
  res.status(result.statusCode).set(result.headers).send(result.body);
});

// অর্ডার ক্রিয়েট রাউট
const createOrderHandler = require('./create-order_3.js').handler;
app.post('/create-order', async (req, res) => {
  const event = { httpMethod: 'POST', body: JSON.stringify(req.body) };
  const result = await createOrderHandler(event);
  res.status(result.statusCode).set(result.headers).send(result.body);
});

// পেমেন্ট কলব্যাক রাউট
const callbackHandler = require('./payment-callback_3.js').handler;
app.all('/payment-callback', async (req, res) => {
  const event = { httpMethod: req.method, body: JSON.stringify(req.body), queryStringParameters: req.query };
  const result = await callbackHandler(event);
  res.status(result.statusCode || 200).send(result.body);
});

// সেন্ড ওটিপি রাউট
const sendOtpHandler = require('./send-otp_3.js').handler;
app.post('/send-otp', async (req, res) => {
  const event = { httpMethod: 'POST', body: JSON.stringify(req.body) };
  const result = await sendOtpHandler(event);
  res.status(result.statusCode).set(result.headers).send(result.body);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
