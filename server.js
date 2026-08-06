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
    transports: ["websocket", "polling"]
});


const PUBLIC = path.join(__dirname, "public");


console.log("🔥 SERVER STARTED");
console.log("DIR:", __dirname);
console.log("PUBLIC:", PUBLIC);

console.log("public:", fs.existsSync(PUBLIC));
console.log("index:", fs.existsSync(path.join(PUBLIC, "index.html")));
console.log("dashboard:", fs.existsSync(path.join(PUBLIC, "dashboard.html")));


app.use(express.json());


// تست فایل‌ها
app.get("/check", (req,res)=>{
    res.json({
        public: fs.existsSync(PUBLIC),
        index: fs.existsSync(path.join(PUBLIC,"index.html")),
        dashboard: fs.existsSync(path.join(PUBLIC,"dashboard.html"))
    });
});


// صفحه اصلی
app.get("/", (req,res)=>{

res.send(`
<!DOCTYPE html>
<html>
<body style="background:#111;color:white;text-align:center">
<h1>HELLO RAILWAY</h1>
<p>Server is working</p>
<a href="/dashboard" style="color:#00ff88">
Dashboard
</a>
</body>
</html>
`);

});



// داشبورد داخل خود سرور
app.get("/dashboard",(req,res)=>{


res.send(`

<!DOCTYPE html>

<html lang="fa">

<head>

<meta charset="UTF-8">

<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Dashboard</title>


<script src="/socket.io/socket.io.js"></script>


<style>

body{

background:#0b0e14;

color:white;

font-family:Arial;

display:flex;

justify-content:center;

align-items:center;

min-height:100vh;

margin:0;

}


.container{

width:95%;

max-width:1300px;

background:#111b26;

padding:20px;

border-radius:20px;

}



#browser-view{

width:100%;

background:black;

border:2px solid #00ff88;

border-radius:15px;

}


.controls{

margin-top:15px;

display:flex;

gap:10px;

flex-wrap:wrap;

}


input,button{

padding:12px;

border-radius:10px;

border:0;

}


button{

background:#00ff88;

cursor:pointer;

}


#status{

margin-top:15px;

}

</style>


</head>


<body>


<div class="container">


<img id="browser-view">


<div class="controls">

<input id="urlInput" value="https://google.com">


<button onclick="goToUrl()">
برو
</button>


<button onclick="sendKey('Enter')">
Enter
</button>


<button onclick="scrollPage(-150)">
↑
</button>


<button onclick="scrollPage(150)">
↓
</button>


</div>


<div id="status">
در حال اتصال...
</div>


</div>



<script>


const socket = io();


const img =
document.getElementById("browser-view");


const status =
document.getElementById("status");



socket.on("connect",()=>{

status.innerHTML="🟢 متصل";

socket.emit("start-stream");

});



socket.on("live-frame",(data)=>{

img.src =
"data:image/jpeg;base64,"+data;

});



socket.on("error",(e)=>{

status.innerHTML="🔴 "+e;

});



img.onclick=(e)=>{

const r =
img.getBoundingClientRect();


socket.emit("command",{

type:"click",

x:(e.clientX-r.left)*1280/r.width,

y:(e.clientY-r.top)*720/r.height

});


};



document.addEventListener("keydown",(e)=>{

socket.emit("command",{

type:"keydown",

text:e.key

});

});



function goToUrl(){

const url =
document.getElementById("urlInput").value;


socket.emit("command",{

type:"goto",

url:url

});


}



function sendKey(k){

socket.emit("command",{

type:"keydown",

text:k

});

}



function scrollPage(v){

socket.emit("command",{

type:"scroll",

text:v

});

}


</script>


</body>

</html>

`);

});



// فایل‌های public
app.use(express.static(PUBLIC));



let browser=null;
let page=null;



async function startBrowser(){

if(!browser){


console.log("⏳ Starting chromium");


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


await page.goto("https://google.com");


console.log("✅ Browser ready");


}


return page;

}




io.on("connection",(socket)=>{


console.log("👤 User connected");



socket.on("start-stream",async()=>{


try{


const currentPage =
await startBrowser();


const session =
await currentPage.target().createCDPSession();



await session.send(
"Page.startScreencast",
{

format:"jpeg",

quality:80,

maxWidth:1280,

maxHeight:720

});



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

});


});



}catch(e){

socket.emit("error",e.message);

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


if(!url.startsWith("http")){

url="https://"+url;

}


await page.goto(url);


}



else if(data.type==="keydown"){

await page.keyboard.press(
data.text
);

}


else if(data.type==="scroll"){

await page.evaluate(
s=>window.scrollBy(0,s),
data.text
);

}


}catch(e){

socket.emit("error",e.message);

}


});


});



const PORT =
process.env.PORT || 8080;


server.listen(PORT,"0.0.0.0",()=>{

console.log(
"✅ Server running on",
PORT
);

});
