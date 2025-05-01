// enhanced_chatbot_memory.js

const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const sessions = {}; // session memory by sender_psid

app.get("/", (req, res) => {
  res.send("Bui Immigration Chatbot Running on Heroku!");
});

app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "buiimmigration";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", (req, res) => {
  const body = req.body;
  if (body.object === "page") {
    body.entry.forEach(function (entry) {
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;
      if (webhook_event.message && webhook_event.message.text) {
        const userMessage = webhook_event.message.text;
        handleUserMessage(sender_psid, userMessage);
      }
    });
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

function sendMessage(sender_psid, responseText) {
  const request_body = {
    recipient: { id: sender_psid },
    message: { text: responseText },
  };

  request(
    {
      uri: "https://graph.facebook.com/v12.0/me/messages",
      qs: { access_token: PAGE_ACCESS_TOKEN },
      method: "POST",
      json: request_body,
    },
    (err) => {
      if (err) {
        console.error("Unable to send message:", err);
      } else {
        console.log("Message sent!");
      }
    }
  );
}

function extractAndStoreInfo(sender_psid, message) {
  if (!sessions[sender_psid]) {
    sessions[sender_psid] = {
      name: null,
      phone: null,
      email: null,
      issue: null,
    };
  }
  const session = sessions[sender_psid];

  const emailMatch = message.match(/[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = message.match(/\b\d{9,}\b/);
  const nameMatch = message.match(/tên(?:\s+tôi|\s+em|\s+là)?\s+(.*?)\b/i);

  if (!session.email && emailMatch) session.email = emailMatch[0];
  if (!session.phone && phoneMatch) session.phone = phoneMatch[0];
  if (!session.name && nameMatch) session.name = nameMatch[1];
  if (!session.issue && message.length > 15) session.issue = message;

  return session;
}

function buildPrompt(session, userMessage) {
  const missing = [];
  if (!session.issue) missing.push("vấn đề di trú");
  if (!session.name) missing.push("họ tên");
  if (!session.phone) missing.push("số điện thoại");
  if (!session.email) missing.push("email");

  const knownInfo = `Thông tin đã có:\n- Họ tên: ${
    session.name || "(chưa có)"
  }\n- SĐT: ${session.phone || "(chưa có)"}\n- Email: ${
    session.email || "(chưa có)"
  }\n- Vấn đề: ${session.issue || "(chưa rõ)"}`;

  const instruction =
    missing.length === 0
      ? `Bạn đã có đầy đủ thông tin. Gửi link đặt lịch: https://buiimmigration.cliogrow.com/book/c08b4f6695426b42696bd44c859643a1`
      : `Hãy hỏi phần còn thiếu: ${missing.join(
          ", "
        )} (không hỏi lại nếu đã có).`;

  return `Bạn là trợ lý intake của công ty di trú Bùi Immigration. Không được lặp lại câu hỏi nếu đã có thông tin. Không đưa ra lời khuyên pháp lý.\n\n${knownInfo}\n\nKhách nhắn: "${userMessage}"\n\n${instruction}`;
}

function handleUserMessage(sender_psid, userMessage) {
  const session = extractAndStoreInfo(sender_psid, userMessage);
  const prompt = buildPrompt(session, userMessage);

  const options = {
    method: "POST",
    uri: "https://api.openai.com/v1/chat/completions",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.5,
    },
    json: true,
  };

  request(options, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      const reply = body.choices[0].message.content.trim();
      sendMessage(sender_psid, reply);
    } else {
      console.error("OpenAI API Error", error || body);
      sendMessage(
        sender_psid,
        "Xin lỗi, hệ thống đang bận. Vui lòng thử lại sau!"
      );
    }
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
