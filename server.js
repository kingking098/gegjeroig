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

app.get("/", (req, res) => {
  res.type("html");
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Railway Test</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          background: #f5f5f5;
          color: #111;
        }
        .box {
          background: white;
          padding: 24px;
          border-radius: 12px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.08);
          max-width: 700px;
        }
        a {
          display: inline-block;
          margin-top: 12px;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>HELLO RAILWAY</h1>
        <p>Server is working</p>
        <a href="/dashboard">Dashboard</a>
      </div>
    </body>
    </html>
  `);
});

app.get("/dashboard", (req, res) => {
  const file = path.join(PUBLIC, "dashboard.html");
  if (fs.existsSync(file)) {
    return res.sendFile(file);
  }
  return res.status(500).send("dashboard.html not found");
});

app.get("/dashboard.html", (req, res) => {
  const file = path.join(PUBLIC, "dashboard.html");
  if (fs.existsSync(file)) {
    return res.sendFile(file);
  }
  return res.status(500).send("dashboard.html not found");
});

// بعد از روت‌های اصلی، فایل‌های public را هم سرو کن
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
        "--disable-gpu",
      ],
      defaultViewport: { width: 1280, height: 720 },
    });

    page = await browser.newPage();
    await page.goto("https://google.com");
    console.log("✅ Browser ready");
  }

  return page;
}

app.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (username && password) {
    return res.json({
      success: true,
      redirect: "/dashboard",
    });
  }

  return res.status(401).json({ success: false });
});

io.on("connection", (socket) => {
  console.log("👤 User connected");

  socket.on("start-stream", async () => {
    try {
      const currentPage = await startBrowser();
      const session = await currentPage.target().createCDPSession();

      await session.send("Page.startScreencast", {
        format: "jpeg",
        quality: 80,
        maxWidth: 1280,
        maxHeight: 720,
        everyNthFrame: 1,
      });

      session.on("Page.screencastFrame", async (frame) => {
        socket.emit("live-frame", frame.data);
        await session.send("Page.screencastFrameAck", {
          sessionId: frame.sessionId,
        });
      });

      socket.on("disconnect", () => {
        session.detach().catch(() => {});
      });
    } catch (err) {
      socket.emit("error", err.message);
    }
  });

  socket.on("command", async (data) => {
    try {
      if (!page) return;

      const { type, x, y, text, url } = data || {};

      if (type === "click") {
        await page.mouse.click(Number(x), Number(y));
      } else if (type === "type") {
        await page.keyboard.type(String(text || ""));
      } else if (type === "goto") {
        if (url && String(url).trim()) {
          let finalUrl = String(url).trim();
          if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
            finalUrl = "https://" + finalUrl;
          }
          await page.goto(finalUrl, { waitUntil: "networkidle0" });
        }
      } else if (type === "keydown") {
        await page.keyboard.press(String(text || ""));
      } else if (type === "scroll") {
        await page.evaluate((s) => window.scrollBy(0, s), Number(text || 0));
      }
    } catch (err) {
      socket.emit("error", err.message);
    }
  });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on ${PORT}`);
});
