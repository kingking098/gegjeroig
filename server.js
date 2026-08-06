const express=require("express");
const http=require("http");
const {Server}=require("socket.io");
const puppeteer=require("puppeteer");
const path=require("path");

const app=express();
const server=http.createServer(app);

const io=new Server(server,{
 cors:{origin:"*"}
});

app.use(express.json());


app.get("/",(req,res)=>{
res.send(`
<html>
<body style="background:#111;color:white;text-align:center">
<h1>HELLO RAILWAY</h1>
<a href="/dashboard">Dashboard</a>
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

<script src="/socket.io/socket.io.js"></script>

<style>

body{
background:#0b0e14;
color:white;
font-family:Arial;
margin:0;
padding:20px;
}

.container{
max-width:1300px;
margin:auto;
}

img{
width:100%;
background:black;
border:2px solid #00ff88;
cursor:crosshair;
}

input,button{
padding:10px;
margin-top:10px;
}

</style>

</head>


<body>

<div class="container">

<img id="screen">

<br>

<input id="url" value="https://google.com">

<button onclick="go()">GO</button>

<div id="status">
Connecting...
</div>

</div>



<script>

const socket=io();

const img=document.getElementById("screen");
const status=document.getElementById("status");


socket.on("connect",()=>{

status.innerHTML="🟢 Connected";

socket.emit("start-stream");

});


socket.on("live-frame",data=>{

img.src="data:image/jpeg;base64,"+data;

});


function pos(e){

let r=img.getBoundingClientRect();

return {

x:(e.clientX-r.left)*1280/r.width,

y:(e.clientY-r.top)*720/r.height

};

}



img.onmousemove=e=>{

let p=pos(e);

socket.emit("mouse",{

type:"move",

...p

});

};



img.onmousedown=e=>{

let p=pos(e);

socket.emit("mouse",{

type:"down",

button:e.button,

...p

});

};



img.onmouseup=e=>{

socket.emit("mouse",{

type:"up",

button:e.button

});

};



img.onwheel=e=>{

socket.emit("wheel",{

delta:e.deltaY

});

};



document.onkeydown=e=>{

socket.emit("key",{

type:"down",

key:e.key

});

};



document.onkeyup=e=>{

socket.emit("key",{

type:"up",

key:e.key

});

};



function go(){

socket.emit("command",{

type:"goto",

url:document.getElementById("url").value

});

}


</script>


</body>
</html>

`);
});



let browser=null;
let page=null;


async function startBrowser(){

if(!browser){

console.log("Starting browser");


browser=await puppeteer.launch({

headless:"new",

args:[

"--no-sandbox",

"--disable-setuid-sandbox",

"--disable-dev-shm-usage"

]

});


page=await browser.newPage();


await page.setViewport({

width:1280,
height:720

});


await page.goto("https://google.com");


console.log("Browser ready");

}

return page;

}



io.on("connection",socket=>{


socket.on("start-stream",async()=>{


try{


let p=await startBrowser();


let session=
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

socket.emit("error",e.message);

}


});



socket.on("mouse",async d=>{

if(!page)return;


if(d.type==="move"){

await page.mouse.move(
d.x,
d.y
);

}


if(d.type==="down"){

await page.mouse.down({

button:d.button===2?"right":"left"

});

}


if(d.type==="up"){

await page.mouse.up({

button:d.button===2?"right":"left"

});

}


});



socket.on("wheel",async d=>{

if(page){

await page.mouse.wheel({

deltaY:d.delta

});

}

});



socket.on("key",async d=>{

if(!page)return;


if(d.type==="down")

await page.keyboard.down(d.key);


else

await page.keyboard.up(d.key);


});



socket.on("command",async d=>{

if(!page)return;


if(d.type==="goto"){

let u=d.url;

if(!u.startsWith("http"))

u="https://"+u;


await page.goto(u);

}


});


});



const PORT=process.env.PORT||8080;


server.listen(PORT,"0.0.0.0",()=>{

console.log("SERVER RUNNING",PORT);

});
