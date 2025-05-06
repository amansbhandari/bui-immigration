const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const sessions = {}; // session memory by sender_psid
const inactivityIntervals = [2, 4, 6];

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
      inactivityStage: 0,
      name: null,
      phone: null,
      email: null,
      attempts: 0,
      greeted: false,
      linkSent: false,
      lastInteraction: new Date(),
      inactivityPinged: false,
      followUpHandled: false,
    };
  }
  const session = sessions[sender_psid];
  session.lastInteraction = new Date();
  session.inactivityPinged = false;

  const normalized = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\p{L}\p{N}\s]/gu, "");

  const emailMatch = message.match(/[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = message.match(/\b\d{9,}\b/);
  const nameMatch = normalized.match(
    /(?:ten(?:\s+toi|\s+em|\s+la)?|my name is|i am|i'm)\s+([\w\s]{2,40})/i
  );

  if (!session.email && emailMatch) session.email = emailMatch[0];
  if (!session.phone && phoneMatch) session.phone = phoneMatch[0];
  if (!session.name && nameMatch) session.name = nameMatch[1];

  return session;
}

async function handleUserMessage(sender_psid, userMessage) {
  if (userMessage.trim().toLowerCase() === "water!##") {
    delete sessions[sender_psid];
    sendMessage(sender_psid, "New conversation started");
    return;
  }

  const isFollowUpReply =
    sessions[sender_psid]?.inactivityPinged &&
    !sessions[sender_psid]?.followUpHandled;
  if (isFollowUpReply) {
    sessions[sender_psid].followUpHandled = true;
    return axios
      .post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "Does the following message contain a question? Reply only 'yes' or 'no'.",
            },
            {
              role: "user",
              content: userMessage,
            },
          ],
          temperature: 0,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      )
      .then((response) => {
        const isQuestion =
          response.data.choices[0].message.content.trim().toLowerCase() ===
          "yes";
        if (isQuestion) {
          sendMessage(
            sender_psid,
            " Cảm ơn anh chị đã để lại thông tin. Chuyên viên tư vấn di trú sẽ liên hệ trong vòng 24 giờ. Nếu muốn chủ động chọn thời gian, anh chị có thể đặt lịch hẹn trực tiếp tại đây: https://buiimmigration.cliogrow.com/book/c08b4f6695426b42696bd44c859643a1"
          );
        } else {
          sendMessage(
            sender_psid,
            "Không sao cả! Nếu cần hỗ trợ gì trong tương lai, anh chị cứ nhắn tin cho chúng tôi bất cứ lúc nào nhé! 💬"
          );
        }
      })
      .catch((err) => {
        console.error("Follow-up check error:", err);
      });
  }
  const session = extractAndStoreInfo(sender_psid, userMessage);

  if (!session.greeted) {
    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "Is the following message just a greeting? Reply only 'yes' or 'no'.",
            },
            { role: "user", content: userMessage },
          ],
          temperature: 0,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const isGreeting =
        response.data.choices[0].message.content.trim().toLowerCase() === "yes";
      session.greeted = true;

      if (isGreeting) {
        sendMessage(
          sender_psid,
          "Chào anh chị! Cảm ơn anh chị đã liên hệ với Bùi Immigration. Chúng tôi rất vui có thể được hỗ trợ anh chị về các vấn đề liên quan tới di trú Canada. ✨"
        );
        return;
      }
    } catch (err) {
      console.error("Greeting check failed:", err);
    }
  }

  const missing = [];
  if (!session.name) missing.push("họ tên");
  if (!session.phone) missing.push("số điện thoại");
  if (!session.email) missing.push("email");

  if (missing.length > 0) {
    session.attempts += 1;

    if (session.attempts <= 2) {
      sendMessage(
        sender_psid,
        `Anh chị vui lòng cung cấp thêm ${missing.join(
          ", "
        )} để chúng tôi hỗ trợ tốt nhất nhé.`
      );
    } else {
      sendMessage(
        sender_psid,
        `Anh chị có thể đặt lịch trực tiếp với cố vấn di trú của Bùi Immigration tại đây nhé: https://buiimmigration.cliogrow.com/book/c08b4f6695426b42696bd44c859643a1. Cảm ơn anh chị đã liên hệ với chúng tôi! 🙏`
      );
    }
  } else {
    if (!session.linkSent) {
      sendMessage(
        sender_psid,
        `Cảm ơn anh chị đã cung cấp đầy đủ thông tin! Anh chị có thể đặt lịch tư vấn với cố vấn di trú tại đây nhé: https://buiimmigration.cliogrow.com/book/c08b4f6695426b42696bd44c859643a1 ✨`
      );
      session.linkSent = true;
    } else {
      sendMessage(
        sender_psid,
        "Cảm ơn anh chị đã liên hệ! Nếu anh chị có thêm câu hỏi, đừng ngần ngại ghi chú lại - đội ngũ cố vấn của chúng tôi sẽ giải đáp kỹ lưỡng trong buổi hẹn sắp tới nhé. 🤝"
      );
    }
  }
}

setInterval(() => {
const now = new Date();
for (const psid in sessions) {
  const session = sessions[psid];
  const stage = session.inactivityStage;
  if (
    stage < inactivityIntervals.length &&
    session.lastInteraction &&
    now - session.lastInteraction > inactivityIntervals[stage] * 60 * 1000
  ) {
    sendMessage(
      psid,
      "Xin chào, anh chị có khỏe không? Chúng tôi chỉ muốn kiểm tra lại rằng anh chị đã được giải đáp đầy đủ chưa, và liệu còn điều gì chúng tôi có thể hỗ trợ thêm không? 😊"
    );
    session.inactivityStage += 1;
    session.inactivityPinged = true;
    session.followUpHandled = false;
  }
}
}, 60000);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));