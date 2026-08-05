const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let browser = null;
let page = null;
let clientSocket = null;

// تابع راه‌اندازی مرورگر
async function startBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu' // برای کاهش مصرف پردازش گرافیکی در سرور
            ],
            defaultViewport: { width: 1280, height: 720 }
        });
        page = await browser.newPage();
        await page.goto('about:blank');
    }
    return page;
}

// لاگین ساده
app.post('/login', express.json(), (req, res) => {
    if (req.body.username && req.body.password) {
        res.json({ success: true, redirect: '/dashboard.html' });
    } else {
        res.status(401).json({ success: false });
    }
});

io.on('connection', async (socket) => {
    console.log('کاربر متصل شد');
    clientSocket = socket;

    socket.on('start-stream', async () => {
        try {
            const currentPage = await startBrowser();
            
            // اتصال به پروتکل DevTools برای دریافت استریم زنده
            const session = await currentPage.target().createCDPSession();
            await session.send('Page.startScreencast', {
                format: 'jpeg',
                quality: 80,        // کیفیت تصویر (عدد کمتر = پهنای باند کمتر)
                maxWidth: 1280,
                maxHeight: 720,
                everyNthFrame: 1    // هر فریم را بفرست
            });

            // گوش دادن به رویداد ارسال فریم از طرف کروم
            session.on('Page.screencastFrame', async (frame) => {
                // ارسال فریم به فرانت‌اند
                socket.emit('live-frame', frame.data);
                
                // تأیید دریافت فریم (برای ادامه دادن استریم توسط کروم)
                await session.send('Page.screencastFrameAck', {
                    sessionId: frame.sessionId
                });
            });

            socket.on('disconnect', () => {
                session.detach().catch(() => {});
            });

        } catch (err) {
            socket.emit('error', err.message);
        }
    });

    // دریافت دستورات (کلیک و کیبورد)
    socket.on('command', async (data) => {
        try {
            if (!page) return;
            const { type, x, y, text, url } = data;

            if (type === 'click') {
                await page.mouse.click(x, y);
            } else if (type === 'type') {
                await page.keyboard.type(text);
            } else if (type === 'goto') {
                await page.goto(url, { waitUntil: 'networkidle0' });
            } else if (type === 'keydown') {
                await page.keyboard.press(text);
            } else if (type === 'scroll') {
                await page.evaluate((scrollY) => { window.scrollBy(0, scrollY); }, text);
            }
        } catch (err) {
            socket.emit('error', err.message);
        }
    });
});

server.listen(3000, () => console.log('✅ استریم زنده روی پورت 3000'));