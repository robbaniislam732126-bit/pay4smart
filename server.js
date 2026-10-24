const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// যেকোনো কল আসামাত্রই টার্মিনালে ইউআরএল দেখাবে
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  next();
});

// ফ্রন্টএন্ডের স্ট্যাটিক ফাইল সার্ভ করা
app.use(express.static(path.join(__dirname, './')));

// ১. রিচার্জ রাউট
const rechargeHandler = require('./recharge.js').handler;
app.all(['/recharge', '/api/recharge', '/.netlify/functions/recharge'], async (req, res) => {
  console.log(`[TRIGGER] Recharge called:`, req.body);
  try {
    const event = { httpMethod: req.method, body: JSON.stringify(req.body), queryStringParameters: req.query };
    const result = await rechargeHandler(event);
    console.log(`[RECHARGE RESPONSE]:`, result.body);
    res.status(result.statusCode || 200).set(result.headers || {}).send(result.body);
  } catch (err) {
    console.error(`[ERROR] Recharge:`, err.message);
    res.status(500).json({ status: "FAILURE", message: err.message });
  }
});

// ২. পেমেন্ট গেটওয়ে রাউট (অর্ডার তৈরি)
const createOrderHandler = require('./create-order.js').handler;
app.all(['/create-order', '/api/create-order', '/.netlify/functions/create-order'], async (req, res) => {
  console.log(`[PAYMENT GATEWAY INITIATE] Payload:`, req.body);
  try {
    const event = { httpMethod: req.method, body: JSON.stringify(req.body), queryStringParameters: req.query };
    const result = await createOrderHandler(event);
    console.log(`[PAYMENT GATEWAY RESPONSE]:`, result.body);
    res.status(result.statusCode || 200).set(result.headers || {}).send(result.body);
  } catch (err) {
    console.error(`[PAYMENT GATEWAY ERROR]:`, err.message);
    res.status(500).json({ status: false, error: err.message });
  }
});

// ৩. পেমেন্ট কলব্যাক রাউট (পেমেন্ট ফলাফল)
const callbackHandler = require('./payment-callback.js').handler;
app.all(['/payment-callback', '/payment/callback', '/.netlify/functions/payment-callback'], async (req, res) => {
  console.log(`[PAYMENT CALLBACK RECEIVED] Data:`, req.body || req.query);
  try {
    const event = { httpMethod: req.method, body: JSON.stringify(req.body), queryStringParameters: req.query };
    const result = await callbackHandler(event);
    console.log(`[PAYMENT CALLBACK PROCESSED]:`, result.body);
    res.status(result.statusCode || 200).send(result.body);
  } catch (err) {
    console.error(`[PAYMENT CALLBACK ERROR]:`, err.message);
    res.status(500).send(err.message);
  }
});

// ৪. ওটিপি রাউট
const sendOtpHandler = require('./send-otp.js').handler;
app.all(['/send-otp', '/api/send-otp', '/.netlify/functions/send-otp'], async (req, res) => {
  const phone = req.body ? (req.body.phone || req.body.userPhone) : "Unknown";
  console.log(`[TRIGGER] OTP called for phone: ${phone}`);
  try {
    const event = { httpMethod: req.method, body: JSON.stringify(req.body), queryStringParameters: req.query };
    const result = await sendOtpHandler(event);
    console.log(`[OTP RESULT]:`, result.body);
    res.status(result.statusCode || 200).set(result.headers || {}).send(result.body);
  } catch (err) {
    console.error(`[ERROR] OTP Failed:`, err.message);
    res.status(500).json({ error: "Failed to send SMS", details: err.message });
  }
});

// হোম পেজ লোড
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
