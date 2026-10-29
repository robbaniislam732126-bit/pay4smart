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
    const { userPhone, number, amount, provider_code, txn_id, service_name } = data;

    const rechargeAmt = parseFloat(amount) || 10;
    if (!number || !provider_code) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ status: "FAILURE", message: "নম্বর বা প্রোভাইডার কোড পাওয়া যায়নি।" })
      };
    }

    const firebaseSettings = await fetchFirebaseData("app_settings");

    const token = firebaseSettings.recharge_api_token || "DQQVHAWL3H1S8GMB2sYatbtB4hpvjD7p";
    const callbackUrl = firebaseSettings.recharge_callback_url || "https://pay4smart.netlify.app/.netlify/functions/payment-callback";
    const apiOrderId = txn_id || ("TEST" + Date.now());

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

    // Webshare প্রক্সি (45.38.107.97) দিয়ে এপিআই কল পাঠানো
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
    // 🔴 সরাসরি সার্ভার রেসপন্স বিস্তারিতভাবে স্ক্রিনে দেখানো
    // ========================================================
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "FAILURE", // টাকা কাটা পুরোপুরি বন্ধ
        message: `[Service: ${service_name || 'N/A'} | Code: ${provider_code}] => ` + cleanText
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
