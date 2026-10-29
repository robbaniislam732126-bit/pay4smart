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

// ব্যাকএন্ড ফাংশনগুলো সরাসরি রুট ফোল্ডার থেকে লোড করা (পাথ আপডেট করা হয়েছে)
const createOrder = require("./create-order").handler;
const billHandler = require("./bill").handler;
const fetchPlans = require("./fetch-plans").handler;
const paymentCallback = require("./payment-callback").handler;
const recharge = require("./recharge").handler;
const sendOtp = require("./send-otp").handler;

// রুট ম্যাপিং
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
