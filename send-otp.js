const https = require("https");

// ডাবল ক্লিক প্রতিরোধের জন্য মেমোরি কুলডাউন লক
const otpCooldown = {};

function fetchFirebaseConfig() {
  return new Promise((resolve) => {
    const url = "https://pay4smart-default-rtdb.firebaseio.com/app_settings.json";
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
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    const data = JSON.parse(event.body || "{}");
    const { phone, otp } = data;

    if (!phone || !otp) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Phone number and OTP are required" })
      };
    }

    // ৩০ সেকেন্ডের কুলডাউন চেক: ডাবল ক্লিক হলে দ্বিতীয় রিকোয়েস্ট আটকে দেবে
    const now = Date.now();
    if (otpCooldown[phone] && (now - otpCooldown[phone]) < 30000) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "SUCCESS",
          message: "OTP already sent. Please wait 30 seconds."
        })
      };
    }

    // টাইম লক আপডেট করা হলো
    otpCooldown[phone] = now;

    const firebaseSettings = await fetchFirebaseConfig();
    const apiToken = firebaseSettings.sms_api_token || "d7fd7e561f3eb9cf534fb16a3052f970";
    let smsTemplate = firebaseSettings.sms_api_url || "https://sms.renflair.in/V1.php?API={TOKEN}&PHONE={PHONE}&OTP={OTP}";

    // ডাইনামিকালি অ্যাডমিন প্যানেলের প্যারামিটার ট্যাগ রিপ্লেস করা
    const finalUrl = smsTemplate
      .replace(/{TOKEN}/g, encodeURIComponent(apiToken))
      .replace(/{PHONE}/g, encodeURIComponent(phone))
      .replace(/{OTP}/g, encodeURIComponent(otp));

    const response = await fetch(finalUrl, { method: "GET" });
    const resultText = await response.text();

    let resultJson = {};
    try {
      resultJson = JSON.parse(resultText);
    } catch(e) {
      resultJson = { raw: resultText };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "SUCCESS",
        gateway_response: resultJson
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Failed to send SMS",
        details: error.message
      })
    };
  }
};
