const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

const PUBLIC = path.join(__dirname, "public");

console.log("🔥 SERVER STARTED");
console.log("DIR:", __dirname);
console.log("PUBLIC:", PUBLIC);

console.log("public:", fs.existsSync(PUBLIC));
console.log("index:", fs.existsSync(path.join(PUBLIC, "index.html")));
console.log("dashboard:", fs.existsSync(path.join(PUBLIC, "dashboard.html")));

app.use(express.json());


app.get("/check", (req, res) => {
  res.json({
    public: fs.existsSync(PUBLIC),
    index: fs.existsSync(path.join(PUBLIC, "index.html")),
    dashboard: fs.existsSync(path.join(PUBLIC, "dashboard.html")),
  });
});


// صفحه تست
app.get("/", (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html>
  <body>
    <h1>HELLO RAILWAY</h1>
    <p>Server is working</p>
    <a href="/dashboard">Dashboard</a>
  </body>
  </html>
  `);
});


// داشبورد تستی
app.get("/dashboard", (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Dashboard</title>
  </head>
  <body>
    <h1>DASHBOARD OK</h1>
    <p>Dashboard route is working</p>
  </body>
  </html>
  `);
});


app.get("/dashboard.html", (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html>
  <body>
    <h1>DASHBOARD HTML OK</h1>
  </body>
  </html>
  `);
});


// فایل‌های public
app.use(express.static(PUBLIC));


let browser = null;
let page = null;


async function startBrowser() {

  if (!browser) {

    console.log("⏳ Starting chromium...");

    browser = await puppeteer.launch({
      headless: "new",
      executablePath: "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ],
      defaultViewport:{
        width:1280,
        height:720
      }
    });


    page = await browser.newPage();

    await page.goto("https://google.com");

    console.log("✅ Browser ready");
  }

  return page;
}



app.post("/login",(req,res)=>{

  const {username,password}=req.body || {};

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

  console.log("👤 User connected");


  socket.on("start-stream",async()=>{

    try{

      const currentPage = await startBrowser();

      const session =
      await currentPage.target().createCDPSession();


      await session.send(
        "Page.startScreencast",
        {
          format:"jpeg",
          quality:80,
          maxWidth:1280,
          maxHeight:720,
          everyNthFrame:1
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
              sessionId:frame.sessionId
            }
          );

        }
      );


    }catch(err){

      socket.emit(
        "error",
        err.message
      );

    }

  });



  socket.on("command",async(data)=>{

    try{

      if(!page)return;

      const {type,x,y,text,url}=data;


      if(type==="click"){

        await page.mouse.click(
          Number(x),
          Number(y)
        );

      }

      else if(type==="type"){

        await page.keyboard.type(
          String(text || "")
        );

      }

      else if(type==="goto"){

        let finalUrl=String(url);

        if(
          !finalUrl.startsWith("http")
        ){

          finalUrl="https://"+finalUrl;

        }

        await page.goto(finalUrl);

      }

    }catch(err){

      socket.emit(
        "error",
        err.message
      );

    }

  });

});



const PORT = process.env.PORT || 8080;


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
