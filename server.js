const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// === GLOBAL CONFIGURATION === //
const FOLLOW_UP_SCHEDULE_MINUTES = [1, 2]; // [15 days, 45 days] in minutes
const FOLLOW_UP_MESSAGES = [
  `Dạ em chào anh/chị. Không biết anh/chị đã được giải đáp đầy đủ vấn đề di trú của mình chưa? Nếu có câu hỏi gì anh/chị đừng ngại liên hệ lại với công ty nhé`,
  `Dạ chào anh/chị, lại là Bùi Immigration đây ạ. Chúng tôi chỉ muốn kiểm tra lại xem liệu anh/chị còn có vướng mắc gì về di trú Canada để công ty hỗ trợ  thêm  cho anh/chị không?  Bùi Immigration luôn sẵn sàng đồng hành cùng anh/chị trong hành trình Học tập, Sinh sống, Làm việc tại Canada. Chúng tôi cam kết hỗ trợ xuyên suốt, từ bước đầu nộp hồ sơ đến hậu định cư, và không ai bị bỏ lại phía sau. Nếu anh/chị cần hỗ trợ vấn đề gì thì hãy cho chúng tôi được biết nhé 😊`,
];
const CHECK_INTERVAL_MS = 60000; // 1 minute

// === SESSION STORE === //
const sessions = {};

app.get("/", (req, res) => {
  res.send("Bui Immigration Chatbot Running!");
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
        updateLastInteraction(sender_psid);
      }
    });
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

function updateLastInteraction(sender_psid) {
  const now = new Date();
  if (!sessions[sender_psid]) {
    sessions[sender_psid] = {
      lastInteraction: now,
      followUpCount: 0,
      lastPingTime: null,
    };
  } else {
    sessions[sender_psid].lastInteraction = now;
  }
}

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
        console.log("Follow-up sent to:", sender_psid);
      }
    }
  );
}

// === AUTO FOLLOW-UP CHECK === //
setInterval(() => {
  const now = new Date();

  for (const psid in sessions) {
    const session = sessions[psid];
    const { lastInteraction, followUpCount } = session;

    // Skip if already sent all follow-ups
    if (followUpCount >= FOLLOW_UP_SCHEDULE_MINUTES.length) continue;

    const inactiveMinutes = (now - lastInteraction) / (1000 * 60);
    const threshold = FOLLOW_UP_SCHEDULE_MINUTES[followUpCount];

    if (inactiveMinutes >= threshold) {
      sendMessage(psid, FOLLOW_UP_MESSAGES[followUpCount]);
      session.lastPingTime = now;
      session.followUpCount += 1;
    }
  }
}, CHECK_INTERVAL_MS);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));