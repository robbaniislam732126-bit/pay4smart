const https = require("https");
const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");

// Webshare ফিক্সড প্রক্সি কনফিগারেশন (আইপি: 45.38.107.97)
const proxyUrl = "http://bdhgmqzy:hbo9peyy3r88@45.38.107.97:6014";
const httpsAgent = new HttpsProxyAgent(proxyUrl);

function fetchFirebaseData(endpoint) {
  return new Promise((resolve) => {
    const url = `https://pay4smart-default-rtdb.firebaseio.com/${endpoint}.json`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data) || {});
        } catch (e) {
          resolve({});
        }
      });
    }).on("error", () => resolve({}));
  });
}

function updateFirebaseData(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(payload);
    const req = https.request(`https://pay4smart-default-rtdb.firebaseio.com/${endpoint}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" }
    }, (res) => {
      let responseData = "";
      res.on("data", chunk => responseData += chunk);
      res.on("end", () => resolve(responseData));
    });
    req.on("error", reject);
    req.write(dataStr);
    req.end();
  });
}

function pushFirebaseHistory(endpoint, historyItem) {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(historyItem);
    const req = https.request(`https://pay4smart-default-rtdb.firebaseio.com/${endpoint}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, (res) => {
      resolve();
    });
    req.on("error", reject);
    req.write(dataStr);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ status: "FAILURE", message: "Method Not Allowed" })
    };
  }

  try {
    const data = JSON.parse(event.body || "{}");
    const { userPhone, tpin, number, amount, provider_code, txn_id, service_name } = data;

    const rechargeAmt = parseFloat(amount);
    if (!userPhone || !rechargeAmt || rechargeAmt <= 0 || !number || !provider_code) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ status: "FAILURE", message: "ভুল বা অসম্পূর্ণ তথ্য পাঠানো হয়েছে।" })
      };
    }

    const userData = await fetchFirebaseData(`users/${userPhone}`);
    if (!userData || !userData.phone) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ status: "FAILURE", message: "ইউজার অ্যাকাউন্ট পাওয়া যায়নি।" })
      };
    }

    if (tpin && userData.tpin && userData.tpin !== tpin) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ status: "FAILURE", message: "ভুল TPIN! ট্রানজ্যাকশন বাতিল।" })
      };
    }

    const [firebaseSettings, margins] = await Promise.all([
      fetchFirebaseData("app_settings"),
      fetchFirebaseData("margins")
    ]);

    const token = firebaseSettings.recharge_api_token || "DQQVHAWL3H1S8GMB2sYatbtB4hpvjD7p";
    const callbackUrl = firebaseSettings.recharge_callback_url || "https://pay4smart.netlify.app/.netlify/functions/payment-callback";
    const apiOrderId = txn_id || ("ORD" + Date.now());

    // ফ্রেশ এক লাইনের ডিফল্ট ইউআরএল টেমপ্লেট
    let template = (firebaseSettings.recharge_api_url && !firebaseSettings.recharge_api_url.includes("\n")) 
      ? firebaseSettings.recharge_api_url.trim() 
      : "https://payicon.in/api/api_service/recharges?token={TOKEN}&provider_id={PROVIDER_ID}&number={NUMBER}&amount={AMOUNT}&api_order_id={ORDER_ID}&callback_url={CALLBACK_URL}";

    const targetUrl = template
      .replace(/{TOKEN}/g, encodeURIComponent(token))
      .replace(/{PROVIDER_ID}/g, encodeURIComponent(provider_code))
      .replace(/{NUMBER}/g, encodeURIComponent(number))
      .replace(/{AMOUNT}/g, encodeURIComponent(rechargeAmt))
      .replace(/{ORDER_ID}/g, encodeURIComponent(apiOrderId))
      .replace(/{CALLBACK_URL}/g, encodeURIComponent(callbackUrl));

    // Webshare প্রক্সি (45.38.107.97) দিয়ে এপিআই কল পাঠানো[span_0](start_span)[span_0](end_span)
    const response = await axios({
      method: "POST",
      url: targetUrl,
      headers: {
        "Accept": "*/*",
        "User-Agent": "Mozilla/5.0"
      },
      httpsAgent: httpsAgent,
      proxy: false
    });

    const responseText = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
    const cleanText = responseText.trim();

    // ========================================================
    // 🔴 TEST MODE: ব্যালেন্স না কেটে সরাসরি সার্ভার রেসপন্স প্রদর্শন[span_1](start_span)[span_1](end_span)
    // ========================================================
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "FAILURE", // যাতে ওয়ালেট থেকে টাকা না কাটে
        message: "API RESPONSE: " + cleanText
      })
    };
    // ========================================================

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        status: "FAILURE",
        message: "Server Error: " + error.message
      })
    };
  }
};
