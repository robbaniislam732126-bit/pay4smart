const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// স্ট্যাটিক ফ্রন্টএন্ড ফাইল সার্ভ করার জন্য
app.use(express.static(path.join(__dirname, './')));

// Webshare Static Proxy কনফিগারেশন (45.38.107.97)
const proxyUrl = process.env.WEBSHARE_PROXY || 'http://bdhgmqzy:hbo9peyy3r88@45.38.107.97:6014';
const httpsAgent = new HttpsProxyAgent(proxyUrl);

// ১. আইপি চেক রুট
app.get('/check-ip', async (req, res) => {
    try {
        const response = await axios.get('https://ipv4.webshare.io/', {
            httpsAgent: httpsAgent,
            proxy: false
        });
        res.json({ proxy_ip: response.data.trim() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ২. ওটিপি (OTP) পাঠানোর হ্যান্ডলার (Renflair SMS API)
app.all(['/api/send-otp', '/.netlify/functions/send-otp'], async (req, res) => {
    try {
        const mobile = req.body.mobile || req.query.mobile;
        const otp = req.body.otp || req.query.otp;
        const smsUrl = req.body.smsUrl || 'https://sms.renflair.in/V1.php';
        const apiKey = req.body.apiKey || 'd7fd7e561f3eb9cf534fb16a3052f970';

        if (!mobile || !otp) {
            return res.status(400).json({ status: 'Failed', message: 'Mobile and OTP are required' });
        }

        // SMS API কল
        const response = await axios.get(smsUrl, {
            params: {
                API: apiKey,
                PHONE: mobile,
                OTP: otp
            }
        });

        res.json({ status: 'Success', data: response.data });
    } catch (error) {
        console.error('OTP Error:', error.message);
        res.status(500).json({ status: 'Failed', message: error.message });
    }
});

// ৩. PayIcon রিচার্জ API হ্যান্ডলার
app.all(['/api/recharge', '/.netlify/functions/recharge'], async (req, res) => {
    try {
        const targetUrl = req.body.targetUrl || 'https://payicon.in/api/api_service/recharge';

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
        res.status(error.response ? error.response.status : 500).json(
            error.response ? error.response.data : { status: 'Failed', message: error.message }
        );
    }
});

// ৪. পেমেন্ট কলব্যাক রুট
app.all(['/payment/callback', '/payment/webhook'], (req, res) => {
    res.json({ status: 'Received', data: req.body || req.query });
});

// মূল পেজ লোড
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
