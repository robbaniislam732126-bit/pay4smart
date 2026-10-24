const https = require("https");
const axios = require("axios");

// ডাবল ক্লিক প্রতিরোধের জন্য মেমোরি লক
const otpLock = {};

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
    const phone = data.userPhone || data.phone || data.mobile;

    if (!phone) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "মোবাইল নম্বর দেওয়া হয়নি।" })
      };
    }

    // ৩০ সেকেন্ডের কুলডাউন চেক (ডাবল ক্লিক বন্ধ করা)
    const now = Date.now();
    if (otpLock[phone] && (now - otpLock[phone]) < 30000) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: true,
          message: "OTP ইতিমধ্যেই পাঠানো হয়েছে। দয়া করে অপেক্ষা করুন।"
        })
      };
    }

    // টাইম লক সেট
    otpLock[phone] = now;

    // ৬ সংখ্যার OTP তৈরি
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Firebase থেকে অ্যাডমিন সেটিংস আনা
    const appSettings = await fetchFirebaseData("app_settings");
    
    // অ্যাডমিন প্যানেলে থাকা SMS API URL ও Key
    const smsUrlTemplate = appSettings.sms_api_url || "";
    const smsApiKey = appSettings.sms_api_key || appSettings.fast2sms_api_key || "";

    if (smsUrlTemplate) {
      // যদি অ্যাডমিন প্যানেলে কাস্টম URL টেমপ্লেট থাকে
      const finalUrl = smsUrlTemplate
        .replace(/{KEY}/g, encodeURIComponent(smsApiKey))
        .replace(/{API_KEY}/g, encodeURIComponent(smsApiKey))
        .replace(/{NUMBER}/g, encodeURIComponent(phone))
        .replace(/{PHONE}/g, encodeURIComponent(phone))
        .replace(/{OTP}/g, encodeURIComponent(otp));

      await axios.get(finalUrl);
    } else if (smsApiKey) {
      // যদি ডিফল্ট Fast2SMS ব্যবহার করা হয়
      await axios.post(
        "https://www.fast2sms.com/dev/bulkV2",
        {
          variables_values: otp,
          route: "otp",
          numbers: phone
        },
        {
          headers: {
            authorization: smsApiKey,
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Firebase-এ ইউজারের তথ্যে OTP আপডেট করা
    await updateFirebaseData(`users/${phone}`, {
      reset_otp: otp,
      otp_created_at: now
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: true,
        message: "OTP সফলভাবে পাঠানো হয়েছে।"
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "SMS পাঠানো ব্যর্থ হয়েছে",
        details: error.response ? error.response.data : error.message
      })
    };
  }
};
