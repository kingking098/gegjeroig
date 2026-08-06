const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const puppeteer = require("puppeteer");
const wrtc = require("wrtc");
const jpeg = require("jpeg-js");

const { RTCVideoSource } = wrtc.nonstandard;

const app = express();
const server = http.createServer(app);

const io = new Server(server,{
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

<h3 id="status">Connecting...</h3>


<script>

const socket=io();

const video=document.getElementById("screen");

const status=document.getElementById("status");

let pc=null;

let iceQueue=[];



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



pc.onconnectionstatechange=()=>{

console.log(
"STATE:",
pc.connectionState
);

status.innerHTML=
"WebRTC: "+pc.connectionState;

};



pc.ontrack=e=>{

console.log(
"TRACK RECEIVED",
e.track.kind
);


video.srcObject=e.streams[0];

video.play();

};



pc.onicecandidate=e=>{

if(e.candidate){

socket.emit(
"ice",
e.candidate
);

}

};



await pc.setRemoteDescription(offer);



for(const c of iceQueue){

await pc.addIceCandidate(c);

}

iceQueue=[];



let answer =
await pc.createAnswer({

offerToReceiveVideo:true

});


await pc.setLocalDescription(answer);



socket.emit(
"answer",
answer
);


});



socket.on("ice",async c=>{


if(!pc)
return;


if(pc.remoteDescription){

await pc.addIceCandidate(c);

}else{

iceQueue.push(c);

}


});


</script>


</body>

</html>

`);

});



let browser=null;
let page=null;
let source=null;
let videoTrack=null;
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


await page.goto("https://google.com");


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
});



session.on(
"Page.screencastFrame",
async frame=>{


try{


const buffer =
Buffer.from(frame.data,"base64");


const decoded =
jpeg.decode(buffer,{
useTArray:true
});


const width=decoded.width;
const height=decoded.height;


const rgba =
new Uint8ClampedArray(decoded.data);



const ySize=width*height;
const uvSize=(width/2)*(height/2);



const i420 =
new Uint8Array(
ySize+uvSize+uvSize
);



let yIndex=0;
let uIndex=ySize;
let vIndex=ySize+uvSize;



for(let y=0;y<height;y++){

for(let x=0;x<width;x++){


const i=(y*width+x)*4;


const r=rgba[i];
const g=rgba[i+1];
const b=rgba[i+2];



i420[yIndex++]=
0.257*r+
0.504*g+
0.098*b+
16;



if(y%2===0 && x%2===0){

i420[uIndex++]=
-0.148*r-
0.291*g+
0.439*b+
128;


i420[vIndex++]=
0.439*r-
0.368*g-
0.071*b+
128;

}

}

}



if(source && videoTrack){


console.log(
"SENDING FRAME",
width,
height,
i420.length
);



source.onFrame({

width,
height,
data:i420

});


}



}catch(e){

console.log(
"frame error",
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


console.log("👤 user connected");


let peer=null;



socket.on("start-webrtc",async()=>{


try{


await startBrowser();



if(!source){

source=new RTCVideoSource();

}



peer=new wrtc.RTCPeerConnection({

iceServers:[

{
urls:"stun:stun.l.google.com:19302"
}

]

});



videoTrack =
source.createTrack();



peer.addTrack(videoTrack);



const sender =
peer.getSenders()[0];


if(sender){


const params =
sender.getParameters();


if(params.encodings){

params.encodings[0].maxBitrate =
2000000;

}


await sender.setParameters(params);

}





peer.onicecandidate=e=>{

if(e.candidate){

socket.emit(
"ice",
e.candidate
);

}

};



const offer =
await peer.createOffer({

offerToReceiveVideo:true

});


await peer.setLocalDescription(offer);



socket.emit(
"offer",
offer
);



if(!captureStarted){

captureStarted=true;

await startCapture();

}



}catch(e){

socket.emit(
"error",
e.message
);

}


});



socket.on("answer",async answer=>{

if(peer){

await peer.setRemoteDescription(answer);

}

});



socket.on("ice",async c=>{

try{

if(peer){

await peer.addIceCandidate(c);

}

}catch(e){}

});



socket.on("disconnect",()=>{

try{

if(peer)
peer.close();

}catch(e){}

});


});



const PORT=
process.env.PORT || 8080;


server.listen(PORT,"0.0.0.0",()=>{

console.log(
"🔥 WebRTC server running",
PORT
);

});
