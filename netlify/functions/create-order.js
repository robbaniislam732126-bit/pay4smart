const https = require("https");

function fetchFirebaseConfig() {
  return new Promise((resolve) => {
    https.get("https://pay4smart-default-rtdb.firebaseio.com/app_settings.json", (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data) || {}); } catch (e) { resolve({}); }
      });
    }).on("error", () => resolve({}));
  });
}

function savePendingOrder(orderId, orderData) {
  return new Promise((resolve) => {
    const dataStr = JSON.stringify(orderData);
    const req = https.request(`https://pay4smart-default-rtdb.firebaseio.com/pending_orders/${orderId}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(dataStr) }
    }, () => resolve());
    req.on("error", () => resolve());
    req.write(dataStr);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "OK" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };

  try {
    const { amount, phone, name } = JSON.parse(event.body || "{}");

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0 || !phone) {
      return { statusCode: 400, headers, body: JSON.stringify({ status: false, message: "সঠিক তথ্য দিন" }) };
    }

    const firebaseSettings = await fetchFirebaseConfig();
    const GATEWAY_URL = firebaseSettings.gateway_api_url || "https://pay.dghost.in/api/create-order";
    const USER_TOKEN = firebaseSettings.dghost_user_token || "bf16ca864f7a41e0e9fa5b11ba080f48";
    const REDIRECT_URL = firebaseSettings.gateway_callback_url || `${firebaseSettings.app_host_url || "https://pay4smart.netlify.app"}/.netlify/functions/payment-callback`;

    const orderId = "DEP" + Date.now();

    await savePendingOrder(orderId, {
      phone: phone,
      amount: parseFloat(amount),
      name: name || "User",
      createdAt: Date.now()
    });

    const params = new URLSearchParams({
      user_token: USER_TOKEN,
      order_id: orderId,
      amount: parseFloat(amount),
      customer_mobile: phone,
      redirect_url: REDIRECT_URL
    });

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    const resData = await response.json();
    const paymentUrl = resData.payment_url || resData.url || resData.link || (resData.result && (resData.result.payment_url || resData.result.url)) || (resData.data && (resData.data.payment_url || resData.data.url));

    if (paymentUrl) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: true, payment_url: paymentUrl }) };
    } else {
      return { statusCode: 200, headers, body: JSON.stringify(resData) };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ status: false, error: err.message }) };
  }
};
