const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});


// مسیر public
const publicPath = path.join(__dirname, 'public');

console.log("Public path:", publicPath);
console.log("Public exists:", fs.existsSync(publicPath));
console.log("Index exists:", fs.existsSync(path.join(publicPath, 'index.html')));
console.log("Dashboard exists:", fs.existsSync(path.join(publicPath, 'dashboard.html')));


// فایل‌های public
app.use(express.static(publicPath));


// صفحه اصلی
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});


// داشبورد
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(publicPath, 'dashboard.html'));
});


// اگر خواستی با پسوند هم باز شود
app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(publicPath, 'dashboard.html'));
});


app.use(express.json());



let browser = null;
let page = null;


async function startBrowser() {
    if (!browser) {

        console.log('⏳ راه‌اندازی کروم...');

        browser = await puppeteer.launch({
            headless: "new",
            executablePath: '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ],
            defaultViewport: {
                width: 1280,
                height: 720
            }
        });


        page = await browser.newPage();

        await page.goto('https://google.com');

        console.log('✅ کروم آماده است');
    }

    return page;
}



app.post('/login', (req, res) => {

    const { username, password } = req.body;


    if (username && password) {

        res.json({
            success: true,
            redirect: '/dashboard'
        });

    } else {

        res.status(401).json({
            success:false
        });

    }

});




io.on('connection', async (socket)=>{

    console.log('👤 کاربر وصل شد');


    socket.on('start-stream', async()=>{

        try {

            const currentPage = await startBrowser();

            const session = await currentPage.target()
                .createCDPSession();


            await session.send(
                'Page.startScreencast',
                {
                    format:'jpeg',
                    quality:80,
                    maxWidth:1280,
                    maxHeight:720,
                    everyNthFrame:1
                }
            );


            session.on(
                'Page.screencastFrame',
                async(frame)=>{

                    socket.emit(
                        'live-frame',
                        frame.data
                    );


                    await session.send(
                        'Page.screencastFrameAck',
                        {
                            sessionId:frame.sessionId
                        }
                    );

                }
            );


            socket.on(
                'disconnect',
                ()=>{
                    session.detach().catch(()=>{});
                }
            );


        } catch(err){

            socket.emit(
                'error',
                err.message
            );

        }

    });



    socket.on('command', async(data)=>{

        try{

            if(!page) return;


            const {type,x,y,text,url}=data;


            if(type==='click'){

                await page.mouse.click(x,y);

            }

            else if(type==='type'){

                await page.keyboard.type(text);

            }

            else if(type==='goto'){

                let finalUrl=url.trim();

                if(
                    !finalUrl.startsWith('http://') &&
                    !finalUrl.startsWith('https://')
                ){

                    finalUrl='https://'+finalUrl;

                }


                await page.goto(
                    finalUrl,
                    {
                        waitUntil:'networkidle0'
                    }
                );

            }

            else if(type==='keydown'){

                await page.keyboard.press(text);

            }

            else if(type==='scroll'){

                await page.evaluate(
                    s=>window.scrollBy(0,s),
                    text
                );

            }


        }catch(err){

            socket.emit(
                'error',
                err.message
            );

        }

    });

});



const PORT = process.env.PORT || 3000;


server.listen(
    PORT,
    '0.0.0.0',
    ()=>{
        console.log(`✅ Server running on ${PORT}`);
    }
);
