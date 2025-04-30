const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.get("/", (req, res) => {
  res.send("Bui Immigration Chatbot Running on Heroku!");
});

// Facebook Webhook Verification
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "buiimmigration";

  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Webhook Event Receiver
app.post("/webhook", (req, res) => {
  let body = req.body;

  if (body.object === "page") {
    body.entry.forEach(function (entry) {
      let webhook_event = entry.messaging[0];
      let sender_psid = webhook_event.sender.id;

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

// Send message to user
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
    (err, res, body) => {
      if (!err) {
        console.log("Message sent!");
      } else {
        console.error("Unable to send message:", err);
      }
    }
  );
}

// Handle User Message using OpenAI
function handleUserMessage(sender_psid, userMessage) {
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
        {
          role: "system",
          content: `
                    You are a smart, emotionally aware, and professional virtual assistant for Bui Immigration. Your job is to assist people via Facebook Messenger in a helpful, natural, and non-repetitive way. Always respond in a friendly and conversational tone. Never provide legal advice, immigration strategies, or assess eligibility.\n\nYour goal is to understand the user’s immigration concern and collect their full name, phone number, and email address — but do this naturally, and without repeating what the user already said. If the user already shares part of their concern or contact information, acknowledge it, summarize what you have, and politely ask only for what’s missing.\n\nOnce both the concern and full contact details (name, phone, and email) are received, send this consultation booking link: https://buiimmigration.cliogrow.com/book/c08b4f6695426b42696bd44c859643a1\n\nIf the user says their issue is urgent or insist to talk to someone else, provide this phone number: +1 647-281-0808\n\nBe smart. Avoid repeating questions or asking for the same info twice. Summarize details back to the user when helpful, and guide them smoothly through the intake process. After 24 hours, follow up to ask if they have booked the appointment or if anyone from the team has assisted them.\n\nAlways remain warm, respectful, show empathy, and helpful. Do not sound like a script. Never give legal advice. Act as a human-like intake assistant who adapts to each situation.
                `,
        },
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
