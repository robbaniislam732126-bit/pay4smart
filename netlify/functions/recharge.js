const https = require("https");
const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");

function fetchFirebaseData(endpoint) {
  return new Promise((resolve) => {
    https.get(`https://pay4smart-default-rtdb.firebaseio.com/${endpoint}.json`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data) || {}); } catch (e) { resolve({}); }
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
    }, () => resolve());
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

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ status: "FAILURE", message: "Method Not Allowed" }) };

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

    if (!tpin || !userData.tpin || userData.tpin !== tpin) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ status: "FAILURE", message: "ভুল TPIN! ট্রানজ্যাকশন বাতিল।" })
      };
    }

    const [fbSettings, margins] = await Promise.all([
      fetchFirebaseData("app_settings"),
      fetchFirebaseData("margins")
    ]);

    const token = fbSettings.recharge_api_token || "DQQVHAWL3H1S8GMB2sYatbtB4hpvjD7p";
    const callbackUrl = fbSettings.recharge_callback_url || `${fbSettings.app_host_url || "https://pay4smart.netlify.app"}/.netlify/functions/payment-callback`;
    const apiOrderId = txn_id || ("ORD" + Date.now());

    let template = (fbSettings.recharge_api_url && !fbSettings.recharge_api_url.includes("\n")) 
      ? fbSettings.recharge_api_url.trim() 
      : "https://payicon.in/api/api_service/recharges?token={TOKEN}&provider_id={PROVIDER_ID}&number={NUMBER}&amount={AMOUNT}&api_order_id={ORDER_ID}&callback_url={CALLBACK_URL}";

    const targetUrl = template
      .replace(/{TOKEN}/g, encodeURIComponent(token))
      .replace(/{PROVIDER_ID}/g, encodeURIComponent(provider_code))
      .replace(/{NUMBER}/g, encodeURIComponent(number))
      .replace(/{AMOUNT}/g, encodeURIComponent(rechargeAmt))
      .replace(/{ORDER_ID}/g, encodeURIComponent(apiOrderId))
      .replace(/{CALLBACK_URL}/g, encodeURIComponent(callbackUrl));

    // === টেস্ট মোড লগ: কনসোল ও রেন্ডার লগে প্রোভাইডার কোড ও সম্পূর্ণ ইউআরএল দেখাবে ===
    console.log("==========================================");
    console.log("[TEST MODE] Recharge Request Intercepted");
    console.log(`[TEST MODE] Service Name: ${service_name}`);
    console.log(`[TEST MODE] Target Number: ${number}`);
    console.log(`[TEST MODE] Amount: ₹${rechargeAmt}`);
    console.log(`[TEST MODE] Provider Code (ID): ${provider_code}`);
    console.log(`[TEST MODE] Generated API URL: ${targetUrl}`);
    console.log("==========================================");

    // যেহেতু এটি টেস্ট মোড, তাই এপিআই-তে রিয়েল হিট না করে সরাসরি কানেকশন ঠিক আছে ধরে সাকসেস রিটার্ন করা হচ্ছে
    let isSuccess = true;
    let message = `সঠিক আছে (Success)! প্রোভাইডার কোড [${provider_code}] দিয়ে রিকোয়েস্ট প্রস্তুত।`;
    let operatorRef = "TEST_REF_" + Date.now();

    if (isSuccess) {
      let isFlat = false;
      let marginRate = 0.5;
      const sName = (service_name || "").toLowerCase();
      const pCode = parseInt(provider_code);

      if (sName.includes("pan") || provider_code === "PAN01") { isFlat = true; marginRate = parseFloat(margins.pan_card) || 5.0; }
      else if (pCode === 5 || sName.includes("airtel")) marginRate = parseFloat(margins.airtel) || 2.5;
      else if (pCode === 6 || sName.includes("special")) marginRate = parseFloat(margins.bsnl_combo) || 5.0;
      else if (pCode === 7 || sName.includes("topup")) marginRate = parseFloat(margins.bsnl_topup) || 5.0;
      else if (pCode === 9 || (sName.includes("jio") && rechargeAmt <= 249)) marginRate = parseFloat(margins.jio_emergency) || 0.0;
      else if (pCode === 8 || sName.includes("jio")) marginRate = parseFloat(margins.jio) || 1.4;
      else if (pCode === 10 || sName.includes("vi")) marginRate = parseFloat(margins.vi) || 3.8;
      else if (pCode >= 11 && pCode <= 15) marginRate = parseFloat(margins.dishtv) || 4.0;
      else if (pCode >= 16 && pCode <= 19) { isFlat = true; marginRate = parseFloat(margins.postpaid_airtel) || 0.30; }
      else if (pCode === 21) marginRate = parseFloat(margins.postpaid_vi) || 4.2;
      else if (pCode === 23) marginRate = parseFloat(margins.google_play) || 1.6;
      else if (pCode >= 24 && pCode <= 28) { isFlat = true; marginRate = parseFloat(margins.electricity) || 1.00; }
      else if (pCode >= 29 && pCode <= 33) marginRate = parseFloat(margins.fastag_icici) || 0.2;
      else if (pCode >= 34 && pCode <= 38) marginRate = parseFloat(margins.fastag_bob) || 0.5;

      const commission = isFlat ? marginRate : parseFloat(((rechargeAmt * marginRate) / 100).toFixed(2));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "SUCCESS",
          message: message,
          operator_ref: operatorRef,
          commission: commission,
          new_balance: parseFloat(userData.balance || 0) // টেস্ট মোডে ব্যালেন্স কাটা হবে না
        })
      };
    } else {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: "FAILURE", message: "টেস্ট মোড ফেইলড।" })
      };
    }

  } catch (error) {
    console.error("[RECHARGE TEST ERROR]", error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: "FAILURE", message: "Server Error: " + error.message })
    };
  }
};
