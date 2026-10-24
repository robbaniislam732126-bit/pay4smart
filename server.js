const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ফ্রন্টএন্ডের ফাইল সার্ভ করা
app.use(express.static(path.join(__dirname, './')));

// ১. রিচার্জ রাউট
const rechargeHandler = require('./recharge.js').handler;
app.all(['/recharge', '/api/recharge', '/.netlify/functions/recharge'], async (req, res) => {
  try {
    const event = { httpMethod: req.method, body: JSON.stringify(req.body), queryStringParameters: req.query };
    const result = await rechargeHandler(event);
    res.status(result.statusCode || 200).set(result.headers || {}).send(result.body);
  } catch (err) {
    res.status(500).json({ status: "FAILURE", message: err.message });
  }
});

// ২. পেমেন্ট গেটওয়ে রাউট
const createOrderHandler = require('./create-order.js').handler;
app.all(['/create-order', '/api/create-order', '/.netlify/functions/create-order'], async (req, res) => {
  try {
    const event = { httpMethod: req.method, body: JSON.stringify(req.body), queryStringParameters: req.query };
    const result = await createOrderHandler(event);
    res.status(result.statusCode || 200).set(result.headers || {}).send(result.body);
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
});

// ৩. পেমেন্ট কলব্যাক রাউট
const callbackHandler = require('./payment-callback.js').handler;
app.all(['/payment-callback', '/payment/callback', '/.netlify/functions/payment-callback'], async (req, res) => {
  try {
    const event = { httpMethod: req.method, body: JSON.stringify(req.body), queryStringParameters: req.query };
    const result = await callbackHandler(event);
    res.status(result.statusCode || 200).send(result.body);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ৪. ওটিপি রাউট
const sendOtpHandler = require('./send-otp.js').handler;
app.all(['/send-otp', '/api/send-otp', '/.netlify/functions/send-otp'], async (req, res) => {
  try {
    const event = { httpMethod: req.method, body: JSON.stringify(req.body), queryStringParameters: req.query };
    const result = await sendOtpHandler(event);
    res.status(result.statusCode || 200).set(result.headers || {}).send(result.body);
  } catch (err) {
    res.status(500).json({ error: "Failed to send SMS", details: err.message });
  }
});

// হোম পেজ লোড
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
