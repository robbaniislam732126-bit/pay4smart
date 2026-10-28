const https = require("https");
const querystring = require("querystring");

function fetchFbData(path) {
  return new Promise((resolve, reject) => {
    https.get(`https://pay4smart-default-rtdb.firebaseio.com/${path}.json`, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data) || null); } catch(e) { resolve(null); }
      });
    }).on("error", reject);
  });
}

function putFbData(path, payload) {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(payload);
    const req = https.request(`https://pay4smart-default-rtdb.firebaseio.com/${path}.json`, { 
      method: "PUT",
      headers: { 
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(dataStr)
      }
    }, (res) => {
      res.on("data", () => {});
      res.on("end", () => resolve());
    });
    req.on("error", reject);
    req.write(dataStr);
    req.end();
  });
}

function patchFbData(path, payload) {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(payload);
    const req = https.request(`https://pay4smart-default-rtdb.firebaseio.com/${path}.json`, { 
      method: "PATCH",
      headers: { 
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(dataStr)
      }
    }, (res) => {
      res.on("data", () => {});
      res.on("end", () => resolve());
    });
    req.on("error", reject);
    req.write(dataStr);
    req.end();
  });
}

function pushFbHistory(path, historyItem) {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(historyItem);
    const req = https.request(`https://pay4smart-default-rtdb.firebaseio.com/${path}.json`, { 
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(dataStr)
      }
    }, (res) => {
      res.on("data", () => {});
      res.on("end", () => resolve());
    });
    req.on("error", reject);
    req.write(dataStr);
    req.end();
  });
}

exports.handler = async (event) => {
  console.log("FULL EVENT OBJECT:", JSON.stringify(event));

  try {
    let payload = {};

    // Parse body if POST request
    if (event.body) {
      try {
        payload = JSON.parse(event.body);
      } catch (e) {
        try {
          payload = querystring.parse(event.body);
        } catch (err) {
          payload = {};
        }
      }
    }

    // Merge query parameters (handles GET requests and URL parameters)
    if (event.queryStringParameters && Object.keys(event.queryStringParameters).length > 0) {
      payload = { ...payload, ...event.queryStringParameters };
    }

    console.log("PARSED PAYLOAD:", payload);

    const rawStatus = payload.status || payload.STATUS || "";
    const status = rawStatus.toString().toUpperCase();
    const orderId = payload.order_id || payload.orderId || payload.order_ID;
    let amount = parseFloat(payload.amount);
    let phone = payload.customer_mobile || payload.phone || payload.mobile;
    const utr = payload.utr || payload.UTR || payload.txnId || ("DEP" + Date.now());

    // যদি গেটওয়ে শুধু order_id পাঠায় কিন্তু স্ট্যাটাস বা অ্যামাউন্ট না দেয়, তবে ডাটাবেসের pending_orders থেকে তুলে আনা
    if ((!phone || isNaN(amount) || amount <= 0) && orderId) {
      const pendingInfo = await fetchFbData(`pending_orders/${orderId}`);
      if (pendingInfo) {
        if (!phone) phone = pendingInfo.phone;
        if (!amount || isNaN(amount)) {
          amount = parseFloat(pendingInfo.amount);
        }
      }
    }

    const txnId = orderId || utr;

    // GET রিকোয়েস্ট আসলে এবং সরাসরি রিডাইরেক্ট করলে ইউজারের অ্যাপে সাকসেস পেজ দেখানোর ব্যবস্থা
    if (event.httpMethod === "GET" && Object.keys(payload).length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: `<!DOCTYPE html>
        <html>
        <head><title>Payment Status</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body style="text-align:center;font-family:sans-serif;margin-top:100px;background:#f4f6f8;">
          <h2 style="color:#28a745;">Payment Redirected Successfully!</h2>
          <p>Please check your Pay4Smart app wallet.</p>
          <script>setTimeout(() => { window.location.href = "app://pay4smart"; }, 2000);</script>
        </body>
        </html>`
      };
    }

    const isSuccess = (
      status === "SUCCESS" || 
      status === "COMPLETED" || 
      status === "PAID" || 
      status === "1" || 
      status === 1 || 
      status === "TRUE" || 
      status === true ||
      orderId // যদি শুধু অর্ডার আইডি পাস হয়ে আসে তবে সেটিকে সফল হিসেবে ধরে ডাটা মেলানো
    );

    if (isSuccess && phone && amount > 0) {
      const alreadyProcessed = await fetchFbData(`processed_orders/${txnId}`);
      if (alreadyProcessed && alreadyProcessed.completed) {
        return { 
          statusCode: 200, 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "already_processed" }) 
        };
      }

      await putFbData(`processed_orders/${txnId}`, { completed: true, timestamp: Date.now() });

      const userData = (await fetchFbData(`users/${phone}`)) || {};
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

      await patchFbData(`users/${phone}`, {
        balance: newBalance,
        total_deposit: newTotalDeposit
      });

      return { 
        statusCode: 200, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "success", message: "Wallet updated successfully" }) 
      };
    }

    return { 
      statusCode: 200, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ignored", message: "Status not success or missing data" }) 
    };

  } catch (err) {
    console.error("Callback Processing Error:", err);
    return { 
      statusCode: 500, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }) 
    };
  }
};
