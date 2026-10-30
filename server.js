const express = require("express");
const path = require("path");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// স্ট্যাটিক ফাইল পরিবেশন
app.use(express.static(__dirname));

// ফাংশন অ্যাডাপ্টার (Netlify এর ফাংশনকে Render-এ চালানোর জন্য)
const runHandler = (handler, routeName) => async (req, res) => {
  console.log(`[API HIT] -> ${routeName} | Method: ${req.method} | Time: ${new Date().toISOString()}`);
  
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
    console.error(`[API ERROR] -> ${routeName}:`, err.message);
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

// ১. Netlify স্টাইল রুট (যদি ফ্রন্টএন্ড থেকে /.netlify/functions/ দিয়ে কল করা হয়)
app.all("/.netlify/functions/create-order", runHandler(createOrder, "create-order"));
app.all("/.netlify/functions/bill", runHandler(billHandler, "bill"));
app.all("/.netlify/functions/fetch-bill", runHandler(billHandler, "fetch-bill"));
app.all("/.netlify/functions/fetch-plans", runHandler(fetchPlans, "fetch-plans"));
app.all("/.netlify/functions/payment-callback", runHandler(paymentCallback, "payment-callback"));
app.all("/.netlify/functions/recharge", runHandler(recharge, "recharge"));
app.all("/.netlify/functions/send-otp", runHandler(sendOtp, "send-otp"));

// ২. Render-এর জন্য সরাসরি রুট (যাতে admin.html বা index.html থেকে কল করলে কাজ করে)
app.all("/create-order", runHandler(createOrder, "create-order-direct"));
app.all("/bill", runHandler(billHandler, "bill-direct"));
app.all("/fetch-plans", runHandler(fetchPlans, "fetch-plans-direct"));
app.all("/payment-callback", runHandler(paymentCallback, "payment-callback-direct"));
app.all("/recharge", runHandler(recharge, "recharge-direct"));
app.all("/send-otp", runHandler(sendOtp, "send-otp-direct"));

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
