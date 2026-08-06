const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const puppeteer = require("puppeteer");
const wrtc = require("@roamhq/wrtc");
const jpeg = require("jpeg-js");

const { RTCVideoSource } = wrtc.nonstandard;

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});


app.use(express.json());


app.get("/", (req,res)=>{
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
padding:20px;
}

video{
width:100%;
max-width:1300px;
background:black;
border:2px solid #00ff88;
border-radius:15px;
}

</style>

</head>


<body>

<video id="screen" autoplay playsinline></video>

<h3 id="status">
Connecting...
</h3>


<script>

const socket=io();

const video=document.getElementById("screen");

const status=document.getElementById("status");

let pc=null;



socket.on("connect",()=>{

status.innerHTML="Connected";

socket.emit("start-webrtc");

});



socket.on("offer",async offer=>{


pc=new RTCPeerConnection({

iceServers:[

{
urls:"stun:stun.l.google.com:19302"
}

]

});



pc.ontrack=e=>{

video.srcObject=e.streams[0];

};



pc.onicecandidate=e=>{

if(e.candidate)

socket.emit(
"ice",
e.candidate
);

};



await pc.setRemoteDescription(offer);


let answer =
await pc.createAnswer();


await pc.setLocalDescription(answer);


socket.emit(
"answer",
answer
);



});




socket.on("ice",async c=>{

if(pc)

await pc.addIceCandidate(c);

});




video.onmousemove=e=>{

let r=video.getBoundingClientRect();


socket.emit("mouse",{

type:"move",

x:(e.clientX-r.left)*1280/r.width,

y:(e.clientY-r.top)*720/r.height

});


};



video.onmousedown=e=>{

socket.emit("mouse",{

type:"down",

button:e.button

});

};



video.onmouseup=e=>{

socket.emit("mouse",{

type:"up",

button:e.button

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



</script>


</body>

</html>
`);

});




let browser=null;
let page=null;
let source=null;
let captureStarted=false;



async function startBrowser(){


if(browser)

return page;



browser=await puppeteer.launch({

headless:"new",

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



page=await browser.newPage();


await page.goto(
"https://google.com"
);


console.log("Browser ready");


return page;

}


async function startCapture(){

    const session =
    await page.target().createCDPSession();
    
    
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
    async frame=>{
    
    
    try{
    
    
    const buffer =
    Buffer.from(
    frame.data,
    "base64"
    );
    
    
    const decoded =
    jpeg.decode(
    buffer,
    {
    useTArray:true
    }
    );
    
    
    
    const rgba =
    new Uint8ClampedArray(
    decoded.data
    );
    
    
    const width =
    decoded.width;
    
    const height =
    decoded.height;
    
    
    
    const ySize =
    width * height;
    
    
    const uvSize =
    (width/2) *
    (height/2);
    
    
    
    const i420 =
    new Uint8Array(
    ySize + uvSize + uvSize
    );
    
    
    
    let yIndex=0;
    
    let uIndex=ySize;
    
    let vIndex=ySize+uvSize;
    
    
    
    for(
    let y=0;
    y<height;
    y++
    ){
    
    
    for(
    let x=0;
    x<width;
    x++
    ){
    
    
    const index =
    (y*width+x)*4;
    
    
    const r=rgba[index];
    
    const g=rgba[index+1];
    
    const b=rgba[index+2];
    
    
    
    const Y =
    0.257*r+
    0.504*g+
    0.098*b+
    16;
    
    
    
    i420[yIndex++]=Y;
    
    
    
    if(
    y%2===0 &&
    x%2===0
    ){
    
    
    const U =
    -0.148*r
    -0.291*g
    +0.439*b
    +128;
    
    
    
    const V =
    0.439*r
    -0.368*g
    -0.071*b
    +128;
    
    
    
    i420[uIndex++]=U;
    
    i420[vIndex++]=V;
    
    
    }
    
    
    }
    
    
    }
    
    
    
    if(source){
    
    
    source.onFrame({
    
    width:width,
    
    height:height,
    
    data:i420
    
    });
    
    
    }
    
    
    
    }
    catch(e){
    
    console.log(
    "frame error:",
    e.message
    );
    
    }
    
    
    
    await session.send(
    "Page.screencastFrameAck",
    {
    sessionId:frame.sessionId
    }
    );
    
    
    
    });
    
    
    }
    
    
    
    
    io.on("connection",socket=>{
    
    
    console.log(
    " user connected"
    );
    
    
    
    let peer=null;
    
    
    
    socket.on(
    "start-webrtc",
    async()=>{
    
    
    try{
    
    
    await startBrowser();
    
    
    
    if(!source)
    
    source=new RTCVideoSource();
    
    
    
    peer =
    new wrtc.RTCPeerConnection({
    
    iceServers:[
    
    {
    urls:
    "stun:stun.l.google.com:19302"
    }
    
    ]
    
    });
    
    
    
    const track =
    source.createTrack();
    
    
    
    peer.addTrack(track);
    
    
    
    peer.onicecandidate=e=>{
    
    
    if(e.candidate)
    
    socket.emit(
    "ice",
    e.candidate
    );
    
    
    };
    
    
    
    
    const offer =
    await peer.createOffer();
    
    
    
    await peer.setLocalDescription(
    offer
    );
    
    
    
    socket.emit(
    "offer",
    offer
    );
    
    
    
    
    if(!captureStarted){
    
    captureStarted=true;
    
    await startCapture();
    
    }
    
    
    
    
    }
    catch(e){
    
    socket.emit(
    "error",
    e.message
    );
    
    }
    
    
    
    });
    
    
    
    
    
    socket.on(
    "answer",
    async answer=>{
    
    
    if(peer)
    
    await peer.setRemoteDescription(
    answer
    );
    
    
    });
    
    
    
    
    
    socket.on(
    "ice",
    async candidate=>{
    
    
    try{
    
    
    if(peer)
    
    await peer.addIceCandidate(
    candidate
    );
    
    
    }
    catch(e){}
    
    
    
    });
    
    
    
    
    
    
    
    socket.on(
    "mouse",
    async d=>{
    
    
    if(!page)
    return;
    
    
    try{
    
    
    if(d.type==="move"){
    
    
    await page.mouse.move(
    d.x,
    d.y
    );
    
    
    }
    
    
    
    else if(d.type==="down"){
    
    
    await page.mouse.down({
    
    button:
    d.button===2
    ?
    "right"
    :
    "left"
    
    });
    
    
    }
    
    
    
    else if(d.type==="up"){
    
    
    await page.mouse.up({
    
    button:
    d.button===2
    ?
    "right"
    :
    "left"
    
    });
    
    
    }
    
    
    
    }
    catch(e){}
    
    
    
    });
    
    
    
    
    
    
    socket.on(
    "key",
    async d=>{
    
    
    if(!page)
    return;
    
    
    try{
    
    
    if(d.type==="down")
    
    await page.keyboard.down(
    d.key
    );
    
    
    else
    
    await page.keyboard.up(
    d.key
    );
    
    
    }
    catch(e){}
    
    
    });
    
    
    
    socket.on(
    "disconnect",
    ()=>{
    
    
    try{
    
    if(peer)
    
    peer.close();
    
    }
    catch(e){}
    
    
    });
    
    
    });
    
    
    
    
    
    const PORT =
    process.env.PORT || 8080;
    
    
    server.listen(
    PORT,
    "0.0.0.0",
    ()=>{
    
    console.log(
    " WebRTC server running",
    PORT
    );
    
    });
