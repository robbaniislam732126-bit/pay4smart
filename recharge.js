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

    const currentBalance = parseFloat(userData.balance || 0);
    if (currentBalance < rechargeAmt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ status: "FAILURE", message: "পর্যাপ্ত ওয়ালেট ব্যালেন্স নেই।" })
      };
    }

    const [firebaseSettings, margins] = await Promise.all([
      fetchFirebaseData("app_settings"),
      fetchFirebaseData("margins")
    ]);

    const token = firebaseSettings.recharge_api_token || "DQQVHAWL3H1S8GMB2sYatbtB4hpvjD7p";
    const callbackUrl = firebaseSettings.recharge_callback_url || "https://pay4smart.netlify.app/.netlify/functions/payment-callback";
    const apiOrderId = txn_id || ("ORD" + Date.now());

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

    // Webshare প্রক্সি দিয়ে Payicon API-তে রিকোয়েস্ট পাঠানো
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

    let isSuccess = false;
    let message = cleanText;
    let operatorRef = "";

    try {
      const jsonRes = typeof response.data === "object" ? response.data : JSON.parse(cleanText);
      const resStatus = (jsonRes.status || jsonRes.STATUS || "").toString().toUpperCase();

      if (
        resStatus === "SUCCESS" ||
        resStatus === "PENDING" ||
        resStatus === "1" ||
        jsonRes.status === 1 ||
        jsonRes.status === true
      ) {
        isSuccess = true;
        message = jsonRes.message || jsonRes.msg || "Recharge Accepted Successfully";
        operatorRef = jsonRes.order_id || jsonRes.operator_id || "";
      } else {
        message = jsonRes.error_msg || jsonRes.remark || jsonRes.message || jsonRes.msg || cleanText;
      }
    } catch (e) {
      if (cleanText === "1" || cleanText.toLowerCase().includes("success")) {
        isSuccess = true;
        message = "Recharge Accepted Successfully";
      }
    }

    // ========================================================
    // 🔴 কাস্টম এরর মেসেজ ফিল্টার (Super Admin Error বন্ধ করার জন্য)
    // ========================================================
    const lowerMsg = (message || "").toLowerCase();
    if (
      lowerMsg.includes("super admin") || 
      lowerMsg.includes("operator code") || 
      lowerMsg.includes("wrong provider")
    ) {
      message = "Please check your Operator or Mobile Number.";
    }
    // ========================================================

    // সফল হলে ব্যালেন্স ও কমিশন হিসাব
    if (isSuccess) {
      let isFlat = false;
      let marginRate = 0.5;
      const sName = (service_name || "").toLowerCase();
      const pCode = parseInt(provider_code);

      // Mobile
      if (pCode === 5 || sName.includes("airtel")) marginRate = parseFloat(margins.airtel) || 2.5;
      else if (pCode === 6 || sName.includes("special")) marginRate = parseFloat(margins.bsnl_combo) || 5.0;
      else if (pCode === 7 || sName.includes("topup")) marginRate = parseFloat(margins.bsnl_topup) || 5.0;
      else if (pCode === 9 || (sName.includes("jio") && rechargeAmt <= 249)) marginRate = parseFloat(margins.jio_emergency) || 0.0;
      else if (pCode === 8 || sName.includes("jio")) marginRate = parseFloat(margins.jio) || 1.4;
      else if (pCode === 10 || sName.includes("vi")) marginRate = parseFloat(margins.vi) || 3.8;

      // DTH
      else if (pCode >= 11 && pCode <= 15) marginRate = 4.0;

      // Postpaid
      else if (pCode >= 16 && pCode <= 19) {
        isFlat = true;
        marginRate = 0.30;
      }
      else if (pCode === 21) marginRate = 4.2;

      // Google Play
      else if (pCode === 23) marginRate = 1.6;

      // Electricity
      else if (pCode >= 24 && pCode <= 28) {
        isFlat = true;
        marginRate = 1.00;
      }

      // FASTag
      else if (pCode >= 29 && pCode <= 33) marginRate = 0.2;
      else if (pCode >= 34 && pCode <= 38) marginRate = 0.5;

      let commission = 0;
      if (isFlat) {
        commission = marginRate;
      } else {
        commission = parseFloat(((rechargeAmt * marginRate) / 100).toFixed(2));
      }

      const finalBalance = parseFloat((currentBalance - rechargeAmt + commission).toFixed(2));
      const newTotalSale = parseFloat((userData.total_sale || 0) + rechargeAmt);
      const newTotalProfit = parseFloat((userData.total_profit || 0) + commission);

      const timeStr = "Today, " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      await updateFirebaseData(`users/${userPhone}`, {
        balance: finalBalance,
        total_sale: newTotalSale,
        total_profit: newTotalProfit
      });

      await pushFirebaseHistory(`users/${userPhone}/history`, {
        txnId: apiOrderId,
        title: `${service_name || 'Service'} Payment`,
        desc: `${number} • Success`,
        amount: rechargeAmt,
        type: "debit",
        category: "recharge",
        time: timeStr
      });

      if (commission > 0) {
        await pushFirebaseHistory(`users/${userPhone}/history`, {
          txnId: "COMM" + Date.now(),
          title: "Commission Cashback",
          desc: isFlat ? `₹${marginRate} Flat Cashback` : `${marginRate}% Margin Added`,
          amount: commission,
          type: "credit",
          category: "ledger",
          time: timeStr
        });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "SUCCESS",
          message: message,
          operator_ref: operatorRef,
          commission: commission,
          new_balance: finalBalance
        })
      };
    } else {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "FAILURE",
          message: message || "অপারেটর থেকে রিকোয়েস্ট সফল হয়নি।"
        })
      };
    }

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
