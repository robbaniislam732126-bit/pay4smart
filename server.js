const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Webshare Static Proxy কনফিগারেশন (45.38.107.97 আইপির জন্য)
const proxyUrl = process.env.WEBSHARE_PROXY || 'http://bdhgmqzy:hbo9peyy3r88@45.38.107.97:6014';
const httpsAgent = new HttpsProxyAgent(proxyUrl);

// হোম রুট
app.get('/', (req, res) => {
    res.send('Pay4Smart Backend Server is Running Perfectly!');
});

// আইপি ভেরিফিকেশন রুট (ব্রাউজারে চেক করার জন্য)
app.get('/check-ip', async (req, res) => {
    try {
        const response = await axios.get('https://ipv4.webshare.io/', {
            httpsAgent: httpsAgent,
            proxy: false
        });
        res.json({
            status: 'Success',
            proxy_ip: response.data.trim(),
            message: 'Static IP working properly'
        });
    } catch (error) {
        res.status(500).json({
            status: 'Error',
            error: error.message
        });
    }
});

// PayIcon রিচার্জ API হ্যান্ডলার (প্রক্সির মাধ্যমে রিকোয়েস্ট পাঠাবে)
app.all(['/api/recharge', '/.netlify/functions/recharge'], async (req, res) => {
    try {
        const targetUrl = req.body.targetUrl || 'https://payicon.in/api/api_service/recharge';
        
        console.log(`Sending recharge request via Proxy (${req.method}) to:`, targetUrl);

        const response = await axios({
            method: req.method,
            url: targetUrl,
            params: req.method === 'GET' ? req.query : undefined,
            data: req.method === 'POST' ? req.body : undefined,
            headers: {
                'Content-Type': 'application/json'
            },
            httpsAgent: httpsAgent,
            proxy: false
        });

        res.json(response.data);
    } catch (error) {
        console.error('Recharge Gateway Error:', error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json(
            error.response ? error.response.data : { status: 'Failed', message: error.message }
        );
    }
});

// পেমেন্ট গেটওয়ে কলব্যাক / ওয়েবহুক রুট (dghost পেমেন্টের জন্য)
app.all(['/payment/callback', '/payment/webhook'], (req, res) => {
    console.log('Payment Callback Received:', req.body || req.query);
    res.json({ status: 'Received', data: req.body || req.query });
});

// সার্ভার পোর্ট লিসেনার
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
