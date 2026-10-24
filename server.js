const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Webshare Static Proxy সেটআপ
const proxyUrl = process.env.WEBSHARE_PROXY || 'http://bdhgmqzy:hbo9peyy3r88@45.38.107.97:6014';
const httpsAgent = new HttpsProxyAgent(proxyUrl);

// হোম রুট (সার্ভার চেক করার জন্য)
app.get('/', (req, res) => {
    res.send('Pay4Smart Server is Running Successfully!');
});

// লাইভ আইপি টেস্ট করার রুট (আপনার ফিক্সড আইপি 45.38.107.97 আসছে কিনা দেখার জন্য)
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

// রিচার্জ বা পেমেন্ট গেটওয়ে API রিকোয়েস্ট হ্যান্ডলার
app.post('/api/recharge', async (req, res) => {
    try {
        const targetApiUrl = req.body.apiUrl; // আপনার রিচার্জ গেটওয়ে URL
        const payload = req.body.data || {};

        const response = await axios.post(targetApiUrl, payload, {
            httpsAgent: httpsAgent,
            proxy: false
        });

        res.json(response.data);
    } catch (error) {
        res.status(error.response ? error.response.status : 500).json({
            status: 'Failed',
            message: error.response ? error.response.data : error.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
