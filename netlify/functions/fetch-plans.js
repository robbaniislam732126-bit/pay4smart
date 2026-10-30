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
    const { number, operator, circle } = JSON.parse(event.body || "{}");

    if (!number || number.length !== 10) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ status: "FAILURE", message: "সঠিক ১০ ডিজিটের মোবাইল নম্বর দিন।" })
      };
    }

    const fbSettings = await fetchFirebaseData("app_settings");
    const token = fbSettings.recharge_api_token || "DQQVHAWL3H1S8GMB2sYatbtB4hpvjD7p";
    const proxyUrl = fbSettings.proxy_url || "http://bdhgmqzy:hbo9peyy3r88@45.38.107.97:6014";
    const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;
    
    const targetUrl = `https://payicon.in/api/api_service/plans?token=${encodeURIComponent(token)}&number=${encodeURIComponent(number)}&operator=${encodeURIComponent(operator || "")}&circle=${encodeURIComponent(circle || "West Bengal")}`;

    let response;
    try {
      response = await axios({
        method: "GET",
        url: targetUrl,
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
        httpsAgent: httpsAgent,
        proxy: false,
        timeout: 9000
      });
    } catch (e) {
      response = await axios({
        method: "GET",
        url: targetUrl,
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
        timeout: 9000
      });
    }

    const resData = response.data || {};
    let plansList = [];
    const rawRecords = resData.records || resData.data || resData.plans || (Array.isArray(resData) ? resData : []);

    if (Array.isArray(rawRecords) && rawRecords.length > 0) {
      plansList = rawRecords.map((item, index) => ({
        id: item.id || ("plan_" + index),
        price: parseFloat(item.rs || item.price || item.amount || 0),
        validity: item.validity || "N/A",
        data: item.data || item.desc_data || "N/A",
        desc: item.desc || item.detail || "Recharge Plan",
        category: item.category || item.type || "Unlimited"
      }));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "SUCCESS", plans: plansList })
    };

  } catch (error) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "FAILURE", message: error.message, plans: [] })
    };
  }
};
