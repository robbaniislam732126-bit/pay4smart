const express = require("express");
const path = require("path");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// স্ট্যাটিক ফাইল পরিবেশন (HTML, CSS, ব্যানার ইমেজ ইত্যাদি)
app.use(express.static(__dirname));

// ফাংশন অ্যাডাপ্টার (Netlify এর ফাংশনকে যে কোনো সার্ভারে চালানোর জন্য)
const runHandler = (handler) => async (req, res) => {
  const event = {
    httpMethod: req.method,
    headers: req.headers,
    body: typeof req.body === "object" ? JSON.stringify(req.body) : req.body,
    queryStringParameters: req.query || {}
  };

  try {
    const result = await handler(event, {});
    
    // রেসপন্স হেডার সেট করা
    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        res.setHeader(key, value);
      }
    }
    
    res.status(result.statusCode || 200).send(result.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ৬টি ব্যাকএন্ড ফাংশন লোড করা
const createOrder = require("./netlify/functions/create-order").handler;
const billHandler = require("./netlify/functions/bill").handler;
const fetchPlans = require("./netlify/functions/fetch-plans").handler;
const paymentCallback = require("./netlify/functions/payment-callback").handler;
const recharge = require("./netlify/functions/recharge").handler;
const sendOtp = require("./netlify/functions/send-otp").handler;

// রুট ম্যাপিং (আগের এবং নতুন দুই রুটেই সাপোর্ট রাখা হলো)
app.all("/.netlify/functions/create-order", runHandler(createOrder));
app.all("/.netlify/functions/bill", runHandler(billHandler));
app.all("/.netlify/functions/fetch-bill", runHandler(billHandler));
app.all("/.netlify/functions/fetch-plans", runHandler(fetchPlans));
app.all("/.netlify/functions/payment-callback", runHandler(paymentCallback));
app.all("/.netlify/functions/recharge", runHandler(recharge));
app.all("/.netlify/functions/send-otp", runHandler(sendOtp));

// হোম পেজ রাউটিং
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Pay4Smart universal server running on port ${PORT}`);
});
