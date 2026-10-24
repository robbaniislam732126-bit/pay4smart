const https = require("https");
const axios = require("axios");

// মেমোরি লক: ডাবল ক্লিক বা রি-ট্রাই রোধের জন্য
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

    // ৩০ সেকেন্ডের কুলডাউন চেক (ডাবল ক্লিক বন্ধ করার জন্য)
    const now = Date.now();
    if (otpLock[phone] && (now - otpLock[phone]) < 30000) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: true,
          message: "OTP ইতিমধ্যেই পাঠানো হয়েছে। দয়া করে ৩০ সেকেন্ড অপেক্ষা করুন।"
        })
      };
    }

    // টাইম লক আপডেট
    otpLock[phone] = now;

    // ৬ সংখ্যার নতুন ওটিপি তৈরি
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Firebase app_settings থেকে এসএমএস এপিআই কনফিগারেশন নেওয়া
    const appSettings = await fetchFirebaseData("app_settings");
    const apiKey = appSettings.fast2sms_api_key || "YOUR_FAST2SMS_KEY";

    // Fast2SMS গেটওয়েতে রিকোয়েস্ট পাঠানো
    const smsResponse = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        variables_values: otp,
        route: "otp",
        numbers: phone
      },
      {
        headers: {
          authorization: apiKey,
          "Content-Type": "application/json"
        }
      }
    );

    // ফায়ারবেসে ব্যবহারকারীর অ্যাকাউন্টে ওটিপি সেভ করা (যাতে ভেরিফাই করা যায়)
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
        error: "Failed to send SMS",
        details: error.response ? error.response.data : error.message
      })
    };
  }
};
