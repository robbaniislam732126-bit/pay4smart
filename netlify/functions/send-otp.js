const https = require("https");

// ওটিপি কুলডাউন ট্র্যাকিং
const otpCooldown = {};

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

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };

  try {
    const data = JSON.parse(event.body || "{}");
    const { phone, otp } = data;

    if (!phone || !otp) {
      console.log("OTP Failed: Phone or OTP missing in request.");
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Phone number and OTP are required" }) };
    }

    console.log(`[SEND-OTP] Request received for Phone: ${phone}`);

    // ৩০ সেকেন্ডের কুলডাউন চেক
    const now = Date.now();
    if (otpCooldown[phone] && (now - otpCooldown[phone]) < 30000) {
      console.log(`[SEND-OTP] Blocked: Cooldown active for ${phone}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: "SUCCESS", message: "OTP already sent. Please wait 30 seconds." })
      };
    }
    otpCooldown[phone] = now;

    // ফায়ারবেস থেকে টোকেন ও টেমপ্লেট আনা
    const firebaseSettings = await fetchFirebaseConfig();
    const apiToken = firebaseSettings.sms_api_token || "d7fd7e561f3eb9cf534fb16a3052f970";
    let smsTemplate = firebaseSettings.sms_api_url || "https://sms.renflair.in/V1.php?API={TOKEN}&PHONE={PHONE}&OTP={OTP}";

    // URL তৈরি
    const finalUrl = smsTemplate
      .replace(/{TOKEN}/g, encodeURIComponent(apiToken))
      .replace(/{PHONE}/g, encodeURIComponent(phone))
      .replace(/{OTP}/g, encodeURIComponent(otp));

    console.log(`[SEND-OTP] Hitting Gateway URL: ${finalUrl}`);

    // গেটওয়েতে রিকোয়েস্ট পাঠানো
    const response = await fetch(finalUrl, { method: "GET" });
    const resultText = await response.text();
    
    console.log(`[SEND-OTP] Gateway Response:`, resultText);

    let resultJson = {};
    try { resultJson = JSON.parse(resultText); } catch(e) { resultJson = { raw: resultText }; }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "SUCCESS", gateway_response: resultJson })
    };

  } catch (error) {
    console.error("[SEND-OTP] Error:", error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to send SMS", details: error.message })
    };
  }
};
