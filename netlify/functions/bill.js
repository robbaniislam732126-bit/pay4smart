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
    const { service_type, biller, identifier, provider_code } = JSON.parse(event.body || "{}");

    if (!identifier) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ status: "FAILURE", message: "কনজিউমার আইডি / মোবাইল নম্বর দিন।" })
      };
    }

    // অ্যাডমিন প্যানেল থেকে টোকেন ও ডাইনামিক প্রক্সি লোড
    const fbSettings = await fetchFirebaseData("app_settings");
    const token = fbSettings.recharge_api_token || "DQQVHAWL3H1S8GMB2sYatbtB4hpvjD7p";
    const pCode = provider_code || 28;
    const proxyUrl = fbSettings.proxy_url || "http://bdhgmqzy:hbo9peyy3r88@45.38.107.97:6014";
    const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;
    
    const targetUrl = `https://payicon.in/api/api_service/bill_fetch?token=${encodeURIComponent(token)}&provider_id=${encodeURIComponent(pCode)}&number=${encodeURIComponent(identifier)}`;

    let response;
    // ১. প্রথমে ডাইনামিক প্রক্সি দিয়ে চেষ্টা করা হবে
    try {
      response = await axios({
        method: "GET",
        url: targetUrl,
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
        httpsAgent: httpsAgent,
        proxy: false,
        timeout: 9000
      });
    } catch (proxyErr) {
      // প্রক্সি ফেইল বা টাইমআউট হলে সরাসরি কানেক্ট করবে
      response = await axios({
        method: "GET",
        url: targetUrl,
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
        timeout: 9000
      });
    }

    let rawData = response.data;
    if (typeof rawData === "string") {
      try { rawData = JSON.parse(rawData); } catch(e) {}
    }

    const data = rawData || {};
    const rec = data.records || data.data || data;

    const customerName = rec.customer_name || rec.customername || rec.name || rec.CustomerName || data.customer_name || data.name || "";
    const dueAmount = rec.due_amount || rec.dueamount || rec.amount || rec.DueAmount || data.due_amount || data.amount || 0;
    const dueDate = rec.due_date || rec.duedate || rec.bill_date || rec.DueDate || data.due_date || "N/A";
    const billNumber = rec.bill_number || rec.billnumber || rec.bill_no || data.bill_number || identifier;

    if (customerName || parseFloat(dueAmount) > 0 || data.status === "SUCCESS" || data.status === 1 || data.status === true) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "SUCCESS",
          customer_name: customerName || "গ্রাহকের বিল পাওয়া গেছে",
          due_amount: parseFloat(dueAmount) || 0,
          due_date: dueDate,
          bill_number: billNumber
        })
      };
    } else {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "FAILURE",
          message: data.message || data.error_msg || data.msg || "বিলের তথ্য পাওয়া যায়নি।"
        })
      };
    }

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: "FAILURE", message: "API Error: " + error.message })
    };
  }
};
