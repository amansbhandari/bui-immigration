const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// === CONFIGURABLE VARIABLES ===
const INACTIVITY_THRESHOLD_MINUTES = 2 * 24 * 60; // 2 days
const INACTIVITY_MESSAGE = `Dạ chào anh/chị, lại là Bùi Immigration đây ạ. Chúng tôi chỉ muốn kiểm tra lại xem liệu anh/chị còn có vướng mắc gì về di trú Canada để công ty hỗ trợ  thêm  cho anh/chị không?  Bùi Immigration luôn sẵn sàng đồng hành cùng anh/chị trong hành trình Học tập, Sinh sống, Làm việc tại Canada. Chúng tôi cam kết hỗ trợ xuyên suốt, từ bước đầu nộp hồ sơ đến hậu định cư, và không ai bị bỏ lại phía sau. Nếu anh/chị cần hỗ trợ vấn đề gì thì hãy cho chúng tôi được biết nhé 😊`;

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
  if (!sessions[sender_psid]) {
    sessions[sender_psid] = {
      lastInteraction: new Date(),
      pinged: false,
    };
  } else {
    sessions[sender_psid].lastInteraction = new Date();
    sessions[sender_psid].pinged = false;
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
        console.log("Inactivity message sent to:", sender_psid);
      }
    }
  );
}

// Check every minute for inactive sessions
setInterval(() => {
  const now = new Date();
  for (const psid in sessions) {
    const session = sessions[psid];
    const inactiveForMs = now - session.lastInteraction;
    const inactiveForMinutes = inactiveForMs / (60 * 1000);

    if (inactiveForMinutes >= INACTIVITY_THRESHOLD_MINUTES && !session.pinged) {
      sendMessage(psid, INACTIVITY_MESSAGE);
      session.pinged = true;
    }
  }
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));