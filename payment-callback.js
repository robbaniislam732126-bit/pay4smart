const https = require("https");

function fetchFbData(path) {
  return new Promise((resolve, reject) => {
    https.get(`https://pay4smart-default-rtdb.firebaseio.com/${path}.json`, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data) || {}); } catch(e) { resolve({}); }
      });
    }).on("error", reject);
  });
}

function putFbData(path, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(`https://pay4smart-default-rtdb.firebaseio.com/${path}.json`, { 
      method: "PUT",
      headers: { "Content-Type": "application/json" }
    }, resolve);
    req.on("error", reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

function patchFbData(path, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(`https://pay4smart-default-rtdb.firebaseio.com/${path}.json`, { 
      method: "PATCH",
      headers: { "Content-Type": "application/json" }
    }, resolve);
    req.on("error", reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

function pushFbHistory(path, historyItem) {
  return new Promise((resolve, reject) => {
    const req = https.request(`https://pay4smart-default-rtdb.firebaseio.com/${path}.json`, { 
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, resolve);
    req.on("error", reject);
    req.write(JSON.stringify(historyItem));
    req.end();
  });
}

exports.handler = async (event) => {
  // গেটওয়ে থেকে কী ডাটা আসছে তা সরাসরি Netlify লগে প্রিন্ট করার জন্য
  console.log("CALLBACK EVENT BODY:", event.body);
  console.log("CALLBACK QUERY PARAMS:", event.queryStringParameters);

  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: "<h3 style='text-align:center;font-family:sans-serif;margin-top:50px;'>Pay4Smart Callback Webhook is Live & Ready.</h3>"
    };
  }

  try {
    let payload = {};
    if (event.body) {
      try {
        payload = JSON.parse(event.body);
      } catch (e) {
        const qs = require("querystring");
        payload = qs.parse(event.body);
      }
    }

    if (event.queryStringParameters && Object.keys(event.queryStringParameters).length > 0) {
      payload = { ...payload, ...event.queryStringParameters };
    }

    const status = (payload.status || payload.STATUS || "").toString().toUpperCase();
    const phone = payload.customer_mobile || payload.phone || payload.mobile;
    const amount = parseFloat(payload.amount);
    const txnId = payload.order_id || payload.utr || ("DEP" + Date.now());

    if ((status === "SUCCESS" || status === "COMPLETED" || payload.status === 1 || payload.status === "1") && phone && amount > 0) {
      
      const alreadyProcessed = await fetchFbData(`processed_orders/${txnId}`);
      if (alreadyProcessed && alreadyProcessed.completed) {
        return { statusCode: 200, body: JSON.stringify({ status: "already_processed" }) };
      }

      await putFbData(`processed_orders/${txnId}`, { completed: true, timestamp: Date.now() });

      const userData = await fetchFbData(`users/${phone}`);
      const oldBalance = parseFloat(userData.balance || 0);
      const oldTotalDeposit = parseFloat(userData.total_deposit || 0);
      
      let newBalance = parseFloat((oldBalance + amount).toFixed(2));
      const newTotalDeposit = parseFloat((oldTotalDeposit + amount).toFixed(2));

      const timeStr = "Today, " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      await pushFbHistory(`users/${phone}/history`, {
        txnId: txnId,
        title: "Wallet Deposit",
        desc: "DGhost Gateway • Success",
        amount: amount,
        type: "credit",
        category: "deposit",
        status: "Success",
        time: timeStr
      });

      if (amount >= 500 && userData.referred_by && !userData.referral_reward_credited) {
        const referrerPhone = userData.referred_by;
        const referrerData = await fetchFbData(`users/${referrerPhone}`);

        if (referrerData && referrerData.phone) {
          const referrerOldBal = parseFloat(referrerData.balance || 0);
          const referrerNewBal = parseFloat((referrerOldBal + 5.00).toFixed(2));

          await patchFbData(`users/${referrerPhone}`, { balance: referrerNewBal });
          await pushFbHistory(`users/${referrerPhone}/history`, {
            txnId: "REF" + Date.now(),
            title: "Referral Reward",
            desc: `Bonus for inviting +91 ${phone}`,
            amount: 5.00,
            type: "credit",
            category: "referral",
            status: "Success",
            time: timeStr
          });

          newBalance = parseFloat((newBalance + 5.00).toFixed(2));
          await pushFbHistory(`users/${phone}/history`, {
            txnId: "REFW" + Date.now(),
            title: "Referral Welcome Bonus",
            desc: "Claimed for ₹500 first deposit",
            amount: 5.00,
            type: "credit",
            category: "referral",
            status: "Success",
            time: timeStr
          });
        }
      }

      await patchFbData(`users/${phone}`, {
        balance: newBalance,
        total_deposit: newTotalDeposit,
        referral_reward_credited: (amount >= 500 && userData.referred_by) ? true : Boolean(userData.referral_reward_credited)
      });

      return { statusCode: 200, body: JSON.stringify({ status: "success" }) };
    }

    return { statusCode: 200, body: "Ignored or Pending" };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
