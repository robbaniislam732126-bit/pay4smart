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

// ফ্রন্টএন্ডের সব ফাইল সরাসরি Render থেকেই সার্ভ করার লাইন
app.use(express.static(path.join(__dirname, './')));

// Webshare Static Proxy কনফিগারেশন (আইপি: 45.38.107.97)
const proxyUrl = process.env.WEBSHARE_PROXY || 'http://bdhgmqzy:hbo9peyy3r88@45.38.107.97:6014';
const httpsAgent = new HttpsProxyAgent(proxyUrl);

// আইপি চেক রুট
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
        res.status(500).json({ status: 'Error', error: error.message });
    }
});

// PayIcon রিচার্জ API হ্যান্ডলার (প্রক্সির মাধ্যমে 45.38.107.97 দিয়ে রিকোয়েস্ট যাবে)
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

// পেমেন্ট কলব্যাক রুট
app.all(['/payment/callback', '/payment/webhook'], (req, res) => {
    res.json({ status: 'Received', data: req.body || req.query });
});

// সরাসরি মূল পেজ (index.html) লোড করার জন্য
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
