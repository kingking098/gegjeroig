const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer-core');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

app.use(express.static('public'));

let browser = null;
let page = null;

async function startBrowser() {
    if (!browser) {
        console.log('⏳ در حال راه‌اندازی مرورگر کروم...');
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ],
            defaultViewport: { width: 1280, height: 720 }
        });
        page = await browser.newPage();
        await page.goto('https://google.com');
        console.log('✅ مرورگر آماده است');
    }
    return page;
}

// لاگین ساختگی (هر چیزی قبول می‌شود)
app.post('/login', express.json(), (req, res) => {
    if (req.body.username && req.body.password) {
        res.json({ success: true, redirect: '/dashboard.html' });
    } else {
        res.status(401).json({ success: false });
    }
});

io.on('connection', async (socket) => {
    console.log('👤 کاربر متصل شد');

    socket.on('start-stream', async () => {
        try {
            const currentPage = await startBrowser();
            const session = await currentPage.target().createCDPSession();
            await session.send('Page.startScreencast', {
                format: 'jpeg',
                quality: 80,
                maxWidth: 1280,
                maxHeight: 720,
                everyNthFrame: 1
            });

            session.on('Page.screencastFrame', async (frame) => {
                socket.emit('live-frame', frame.data);
                await session.send('Page.screencastFrameAck', {
                    sessionId: frame.sessionId
                });
            });

            socket.on('disconnect', () => {
                session.detach().catch(() => {});
                console.log('👤 کاربر قطع شد');
            });

        } catch (err) {
            console.error('❌ خطا در استریم:', err.message);
            socket.emit('error', err.message);
        }
    });

    socket.on('command', async (data) => {
        try {
            if (!page) return;
            const { type, x, y, text, url } = data;

            if (type === 'click') {
                await page.mouse.click(x, y);
            } else if (type === 'type') {
                await page.keyboard.type(text);
            } else if (type === 'goto') {
                if (url && url.trim() !== '') {
                    let finalUrl = url.trim();
                    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
                        finalUrl = 'https://' + finalUrl;
                    }
                    await page.goto(finalUrl, { waitUntil: 'networkidle0' });
                } else {
                    socket.emit('error', 'لطفاً یک آدرس معتبر وارد کن');
                }
            } else if (type === 'keydown') {
                await page.keyboard.press(text);
            } else if (type === 'scroll') {
                await page.evaluate((scrollY) => { window.scrollBy(0, scrollY); }, text);
            }
        } catch (err) {
            console.error('❌ خطا در دستور:', err.message);
            socket.emit('error', err.message);
        }
    });
});

// استفاده از پورت اختصاص داده شده توسط Railway
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`✅ استریم زنده روی پورت ${PORT}`));
