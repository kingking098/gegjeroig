const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

const PUBLIC = path.join(__dirname, "public");

console.log("🔥 TEST SERVER RUNNING");
console.log("DIR:", __dirname);
console.log("PUBLIC:", PUBLIC);

console.log("public:", fs.existsSync(PUBLIC));
console.log("index:", fs.existsSync(path.join(PUBLIC, "index.html")));
console.log("dashboard:", fs.existsSync(path.join(PUBLIC, "dashboard.html")));


app.use(express.static(PUBLIC));


app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Railway Test</title>
    </head>
    <body>
        <h1>HELLO RAILWAY</h1>
        <p>Server is working</p>
        <a href="/dashboard">Dashboard</a>
    </body>
    </html>
    `);
});


app.get("/dashboard", (req, res) => {

    const file = path.join(PUBLIC, "dashboard.html");

    if (fs.existsSync(file)) {
        res.sendFile(file);
    } else {
        res.send("dashboard.html not found");
    }

});


app.get("/check", (req,res)=>{
    res.json({
        public: fs.existsSync(PUBLIC),
        index: fs.existsSync(path.join(PUBLIC,"index.html")),
        dashboard: fs.existsSync(path.join(PUBLIC,"dashboard.html"))
    });
});


const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", ()=>{
    console.log("✅ TEST SERVER ON", PORT);
});
