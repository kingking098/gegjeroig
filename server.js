const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    },
    transports: ["websocket", "polling"]
});


const PUBLIC = path.join(__dirname, "public");

console.log("🔥 NEW SERVER VERSION RUNNING");
console.log("DIR:", __dirname);
console.log("PUBLIC:", PUBLIC);

console.log("public:", fs.existsSync(PUBLIC));
console.log(
    "index:",
    fs.existsSync(path.join(PUBLIC, "index.html"))
);

console.log(
    "dashboard:",
    fs.existsSync(path.join(PUBLIC, "dashboard.html"))
);


// سرو فایل‌های public
app.use(express.static(PUBLIC));


// تست
app.get("/test", (req,res)=>{
    res.send("server works");
});


// صفحه اصلی
app.get("/", (req,res)=>{

    const file = path.join(PUBLIC,"index.html");

    if(fs.existsSync(file)){
        res.sendFile(file);
    }else{
        res.status(500).send(
            "index.html not found"
        );
    }

});


// داشبورد
app.get("/dashboard", (req,res)=>{

    const file = path.join(PUBLIC,"dashboard.html");

    if(fs.existsSync(file)){
        res.sendFile(file);
    }else{
        res.status(500).send(
            "dashboard.html not found"
        );
    }

});


// برای حالت با پسوند
app.get("/dashboard.html",(req,res)=>{

    res.sendFile(
        path.join(PUBLIC,"dashboard.html")
    );

});


app.use(express.json());



let browser = null;
let page = null;



async function startBrowser(){

    if(!browser){

        console.log("Starting chromium...");

        browser = await puppeteer.launch({

            headless:"new",

            executablePath:"/usr/bin/chromium",

            args:[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage"
            ],

            defaultViewport:{
                width:1280,
                height:720
            }

        });


        page = await browser.newPage();

        await page.goto(
            "https://google.com"
        );


        console.log("Browser ready");

    }

    return page;

}




app.post("/login",(req,res)=>{

    const {username,password}=req.body;


    if(username && password){

        res.json({

            success:true,

            redirect:"/dashboard"

        });

    }else{

        res.status(401).json({

            success:false

        });

    }

});





io.on("connection",(socket)=>{


    console.log("user connected");


    socket.on("start-stream",async()=>{

        try{

            const currentPage =
                await startBrowser();


            const session =
                await currentPage
                .target()
                .createCDPSession();


            await session.send(
                "Page.startScreencast",
                {
                    format:"jpeg",
                    quality:80,
                    maxWidth:1280,
                    maxHeight:720
                }
            );


            session.on(
                "Page.screencastFrame",
                async(frame)=>{


                    socket.emit(
                        "live-frame",
                        frame.data
                    );


                    await session.send(
                        "Page.screencastFrameAck",
                        {
                            sessionId:
                            frame.sessionId
                        }
                    );


                }
            );


        }catch(e){

            socket.emit(
                "error",
                e.message
            );

        }

    });



    socket.on("command",async(data)=>{

        try{

            if(!page)return;


            if(data.type==="click"){

                await page.mouse.click(
                    data.x,
                    data.y
                );

            }


            else if(data.type==="type"){

                await page.keyboard.type(
                    data.text
                );

            }


            else if(data.type==="goto"){

                let url=data.url;

                if(
                    !url.startsWith("http")
                ){

                    url="https://"+url;

                }


                await page.goto(url);

            }


        }catch(e){

            socket.emit(
                "error",
                e.message
            );

        }

    });


});




const PORT =
process.env.PORT || 8080;



server.listen(
    PORT,
    "0.0.0.0",
    ()=>{

        console.log(
            "✅ Server running on",
            PORT
        );

    }
);
