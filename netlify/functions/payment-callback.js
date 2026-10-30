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
  try {
    let payload = {};

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

    if (event.queryStringParameters && Object.keys(event.queryStringParameters).length > 0) {
      payload = { ...payload, ...event.queryStringParameters };
    }

    const rawStatus = (payload.status || payload.STATUS || "").toString().toUpperCase();
    const orderId = payload.order_id || payload.orderId || payload.order_ID;
    let amount = parseFloat(payload.amount);
    let phone = payload.customer_mobile || payload.phone || payload.mobile;
    const utr = payload.utr || payload.UTR || payload.txnId || ("DEP" + Date.now());

    // ব্রাউজারে রিডাইরেক্ট হয়ে আসলে হোম পেজে পাঠানো
    if ((event.httpMethod === "GET" || event.httpMethod === "HEAD") && Object.keys(payload).length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: `<!DOCTYPE html>
        <html>
        <head>
          <title>Payment Status</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="text-align:center;font-family:sans-serif;margin-top:100px;background:#f4f6f8;">
          <h2 style="color:#28a745;">Payment Redirecting...</h2>
          <script>
            setTimeout(() => {
              window.location.href = "/";
            }, 1200);
          </script>
        </body>
        </html>`
      };
    }

    if (!orderId) {
      return { 
        statusCode: 400, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ignored", message: "Missing Order ID" }) 
      };
    }

    // ফায়ারবেসের পেন্ডিং অর্ডার থেকে আসল তথ্য নেওয়া
    const pendingInfo = await fetchFbData(`pending_orders/${orderId}`);
    if (!pendingInfo) {
      return { 
        statusCode: 400, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ignored", message: "Invalid or Expired Order ID" }) 
      };
    }

    phone = phone || pendingInfo.phone;
    amount = (!isNaN(amount) && amount > 0) ? amount : parseFloat(pendingInfo.amount);

    // নিরাপদ স্ট্যাটাস চেক (ভুয়া orderId দিয়ে কেউ কলব্যাক পাঠালে সফল হবে না)
    const isSuccess = (
      rawStatus === "SUCCESS" || 
      rawStatus === "COMPLETED" || 
      rawStatus === "PAID" || 
      rawStatus === "1" || 
      rawStatus === "TRUE"
    );

    if (isSuccess && phone && amount > 0) {
      // অর্ডারটি আগে একবার সফল হয়েছে কি না চেক করা (Double Credit রোধ)
      const alreadyProcessed = await fetchFbData(`processed_orders/${orderId}`);
      if (alreadyProcessed && alreadyProcessed.completed) {
        return { 
          statusCode: 200, 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "already_processed" }) 
        };
      }

      // অর্ডারটি সম্পন্ন হিসেবে মার্ক করা
      await putFbData(`processed_orders/${orderId}`, { completed: true, timestamp: Date.now() });

      // ইউজারের পূর্বের ব্যালেন্স এনে নতুন ব্যালেন্স যোগ করা
      const userData = (await fetchFbData(`users/${phone}`)) || {};
      const oldBalance = parseFloat(userData.balance || 0);
      const oldTotalDeposit = parseFloat(userData.total_deposit || 0);
      
      let newBalance = parseFloat((oldBalance + amount).toFixed(2));
      const newTotalDeposit = parseFloat((oldTotalDeposit + amount).toFixed(2));

      const timeStr = "Today, " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // ট্রানজ্যাকশন হিস্ট্রিতে যোগ করা
      await pushFbHistory(`users/${phone}/history`, {
        txnId: orderId,
        title: "Wallet Deposit",
        desc: "Gateway Deposit • Success",
        amount: amount,
        type: "credit",
        category: "deposit",
        status: "Success",
        time: timeStr
      });

      // ইউজারের মূল ব্যালেন্স আপডেট করা
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
      body: JSON.stringify({ status: "ignored", message: "Status not success" }) 
    };

  } catch (err) {
    return { 
      statusCode: 500, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }) 
    };
  }
};
