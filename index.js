const express = require("express");
const bodyParser = require("body-parser");
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = "AIzaSyA6LHbdDFUNr3CwykQ5pet8WQkbj8wIYMM";
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  systemInstruction: `
   You remember all previous chats and you don't respond with the same thing over and over again
    Your name is Synthia, you are an AI intelligence bot created by Nightmare Studios. 
    You're not made by any other company, only Nightmare Studios. 
    Your job is to help users with their needs, and you do not respond to any racist or offensive actions. 
    Also, you are experimental, so make sure you always tell that to the user when they say hello or something like that.
  `,
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 9099,
  responseMimeType: "text/plain",
};

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static("."));

// Rate limiter middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: "Too many requests from this IP, please try again later."
});
app.use(limiter);

// In-memory dictionary for blacklisted IPs
const blacklistedIps = new Set(["72.207.174.61", "10.81.5.9"]);

// Queue to manage requests
const requestQueue = [];
let processing = false;

// Function to check if an IP is blacklisted
const isBlacklisted = (ip) => blacklistedIps.has(ip);

// Function to log IPs if not already logged
const logIp = (ip) => {
  if (ip) {
    const loggedIps = fs.readFileSync('IPs.txt', 'utf8').split('\n');
    if (!loggedIps.includes(ip)) {
      fs.appendFileSync('IPs.txt', `${ip}\n`);
    }
  }
};

// Function to save chat history to a file
const saveChatHistory = (history) => {
  fs.appendFileSync('history.txt', `${history}\n`, 'utf8');
};

// Process the request queue
const processQueue = async () => {
  if (processing || requestQueue.length === 0) {
    return;
  }

  processing = true;
  const { req, res } = requestQueue.shift();

  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  if (isBlacklisted(ip)) {
    res.json({ response: "Oh no, your IP is blacklisted. Get the heck out of here!" });
    processing = false;
    processQueue();
    return;
  }

  logIp(ip);

  const userInput = req.body.message;
  const history = req.body.history || [];
  const chatSession = model.startChat({
    generationConfig,
    history: history,
  });

  try {
    const result = await chatSession.sendMessage(userInput);
    const aiResponse = result.response ? result.response.text().replace(/\n/g, '<br>') : "Sorry, I couldn't process your request.";

    // Save chat history to a file
    saveChatHistory(`User: ${userInput}\nAI: ${aiResponse}`);

    res.json({ response: aiResponse, history: chatSession.history });
  } catch (error) {
    console.error("Error during AI response:", error);
    res.status(500).json({ error: "Something went wrong. Please try again later." });
  }

  processing = false;
  processQueue();
};

app.get("/", (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  logIp(ip);
  res.sendFile(__dirname + "/index.html");
});

app.post("/api/chat", (req, res) => {
  requestQueue.push({ req, res });
  processQueue();
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
