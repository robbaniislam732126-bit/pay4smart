exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { 
      statusCode: 405, 
      body: JSON.stringify({ status: "FAILURE", message: "Method Not Allowed" }) 
    };
  }

  try {
    const { number, amount, providerCode, txnId } = JSON.parse(event.body);

    const token = "DQQVHAWL3H1S8GMB2sYatbtB4hpvjD7p";
    const callbackUrl = encodeURIComponent("https://pay4smart.netlify.app/.netlify/functions/payment-callback");

    // PayIcon টেবিল অনুযায়ী অপারেটর কোড ম্যাপিং
    let mappedOperatorCode = providerCode;
    const opLower = String(providerCode || "").toLowerCase();
    const amt = Number(amount);

    if (opLower.includes("airtel") && (opLower.includes("dth") || opLower.includes("digital"))) {
      mappedOperatorCode = "11"; // Airtel Digital Tv DTH
    } else if (opLower.includes("airtel") && opLower.includes("postpaid")) {
      mappedOperatorCode = "16"; // Airtel Postpaid
    } else if (opLower.includes("airtel")) {
      mappedOperatorCode = "5";  // Airtel 349+ MOBILE
    } else if (opLower.includes("jio") && opLower.includes("postpaid")) {
      mappedOperatorCode = "19"; // Reliance Jio POSTPAID
    } else if (opLower.includes("jio") && opLower.includes("emergency")) {
      mappedOperatorCode = "9";  // Jio Emergency 19-249 MOBILE
    } else if (opLower.includes("jio")) {
      mappedOperatorCode = "8";  // JIO MOBILE
    } else if (opLower.includes("vi") && opLower.includes("postpaid")) {
      mappedOperatorCode = "21"; // VI POSTPAID
    } else if (opLower.includes("vi") || opLower.includes("vodafone") || opLower.includes("idea")) {
      mappedOperatorCode = "10"; // VI MOBILE
    } else if (opLower.includes("bsnl") && opLower.includes("postpaid")) {
      mappedOperatorCode = "17"; // Bsnl - Special Recharge POSTPAID
    } else if (opLower.includes("bsnl_sp") || opLower.includes("special")) {
      mappedOperatorCode = "6";  // BSNL - Special Tariff MOBILE
    } else if (opLower.includes("bsnl")) {
      mappedOperatorCode = "7";  // BSNL Talktime MOBILE
    } else if (opLower.includes("dish")) {
      mappedOperatorCode = "12"; // Dish Tv DTH
    } else if (opLower.includes("sun")) {
      mappedOperatorCode = "13"; // Sun Direct DTH
    } else if (opLower.includes("tata")) {
      mappedOperatorCode = "14"; // Tata Sky DTH
    } else if (opLower.includes("d2h") || opLower.includes("videocon")) {
      mappedOperatorCode = "15"; // Videocon D2h DTH
    } else if (opLower.includes("google")) {
      mappedOperatorCode = "23"; // Google Play
    }

    // PayIcon API Request URL তৈরি
    const apiUrl = `https://payicon.in/api/recharge?token=${token}&number=${number}&operator=${mappedOperatorCode}&amount=${amount}&orderid=${txnId}&callback=${callbackUrl}`;

    // ডিবাগ লগ: নেটলিফাইতে কলিং URL দেখার জন্য
    console.log("PayIcon Calling URL:", apiUrl);

    const apiRes = await fetch(apiUrl);
    const textData = await apiRes.text();

    // ডিবাগ লগ: PayIcon থেকে কী রেসপন্স আসলো তা দেখার জন্য
    console.log("PayIcon Raw Response:", textData);

    let parsedData = {};

    try {
      parsedData = JSON.parse(textData);
    } catch (e) {
      let cleanMsg = "Provider rejected the request.";
      const lower = textData.toLowerCase();

      if (lower.includes("balance")) {
        cleanMsg = "PayIcon Wallet-এ ব্যালেন্স নেই! দয়া করে PayIcon-এ ব্যালেন্স যোগ করুন।";
      } else if (lower.includes("token") || lower.includes("auth")) {
        cleanMsg = "Invalid API Token or Authentication Error.";
      } else if (lower.includes("operator")) {
        cleanMsg = "Invalid Operator Code.";
      } else {
        cleanMsg = textData.replace(/<[^>]*>/g, '').trim() || cleanMsg;
      }
      parsedData = { status: "FAILURE", message: cleanMsg, raw: textData };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsedData)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "FAILURE", message: err.message })
    };
  }
};
