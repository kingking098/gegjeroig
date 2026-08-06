const express=require("express");
const http=require("http");
const {Server}=require("socket.io");
const puppeteer=require("puppeteer");
const path=require("path");
const fs=require("fs");

const app=express();
const server=http.createServer(app);

const io=new Server(server,{
 cors:{origin:"*"},
 transports:["websocket","polling"]
});

const PUBLIC=path.join(__dirname,"public");

console.log("🔥 SERVER STARTED");
console.log("PUBLIC:",PUBLIC);
console.log("public:",fs.existsSync(PUBLIC));


app.use(express.json());


app.get("/check",(req,res)=>{
 res.json({
  public:fs.existsSync(PUBLIC),
  index:fs.existsSync(path.join(PUBLIC,"index.html")),
  dashboard:fs.existsSync(path.join(PUBLIC,"dashboard.html"))
 });
});


app.get("/",(req,res)=>{
res.send(`
<html>
<body style="background:#111;color:white;text-align:center">
<h1>HELLO RAILWAY</h1>
<p>Server is working</p>
<a href="/dashboard" style="color:#0f8">Dashboard</a>
</body>
</html>
`);
});


app.get("/dashboard",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Dashboard</title>
<script src="/socket.io/socket.io.js"></script>
<style>
body{
background:#0b0e14;
color:white;
font-family:Arial;
padding:20px
}
.container{
max-width:1300px;
margin:auto;
background:#111b26;
padding:20px;
border-radius:20px
}
#browser-view{
width:100%;
background:black;
border:2px solid #00ff88;
border-radius:15px
}
button,input{
padding:10px;
margin:5px
}
</style>
</head>

<body>

<div class="container">

<img id="browser-view">

<br>

<input id="urlInput" value="https://google.com">

<button onclick="go()">Go</button>

<button onclick="key('Enter')">Enter</button>

<div id="status">Connecting...</div>

</div>


<script>

const socket=io();

const img=document.getElementById("browser-view");
const status=document.getElementById("status");


socket.on("connect",()=>{
status.innerHTML="🟢 Connected";
socket.emit("start-stream");
});


socket.on("live-frame",d=>{
img.src="data:image/jpeg;base64,"+d;
});


socket.on("error",e=>{
status.innerHTML="🔴 "+e;
});


img.onclick=e=>{

let r=img.getBoundingClientRect();

socket.emit("command",{
type:"click",
x:(e.clientX-r.left)*1280/r.width,
y:(e.clientY-r.top)*720/r.height
});

};


function go(){

socket.emit("command",{
type:"goto",
url:document.getElementById("urlInput").value
});

}


function key(k){

socket.emit("command",{
type:"keydown",
text:k
});

}

</script>

</body>
</html>
`);
});


app.use(express.static(PUBLIC));


let browser=null;
let page=null;


async function startBrowser(){

if(!browser){

console.log("⏳ Starting browser");


browser=await puppeteer.launch({

headless:"new",

args:[
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


page=await browser.newPage();


await page.goto(
"https://google.com",
{
waitUntil:"networkidle2"
}
);


console.log("✅ Browser ready");

}

return page;

}



io.on("connection",socket=>{

console.log("👤 Connected");


socket.on("start-stream",async()=>{

try{

const p=await startBrowser();

const session=
await p.target().createCDPSession();


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
async frame=>{

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

});


}catch(e){

socket.emit(
"error",
e.message
);

}

});



socket.on("command",async data=>{

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


else if(data.type==="keydown"){

await page.keyboard.press(
data.text
);

}


else if(data.type==="goto"){

let url=data.url;

if(!url.startsWith("http"))
url="https://"+url;


await page.goto(url);

}


}catch(e){

socket.emit("error",e.message);

}

});


});



const PORT=process.env.PORT||8080;

server.listen(
PORT,
"0.0.0.0",
()=>{
console.log("✅ Server running",PORT);
}
);
