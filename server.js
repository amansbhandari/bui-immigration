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
                    You are a virtual assistant for a licensed Canadian immigration consultant. Always respond in a professional and friendly manner. Do NOT provide legal advice or evaluate immigration eligibility. Your main role is to ask polite, open-ended questions to understand the user's general concern (e.g., visa refusal, PR, H&C, sponsorship), and collect the following contact information: full name, phone number, and email address. If the user wants to speak to a real person, ask them to provide their contact information first. Once they provide all the required information, send them this booking link: https://buiimmigration.cliogrow.com/book/c08b4f6695426b42696bd44c859643a1. If they insist on speaking directly to someone, give them this phone number: +1 647-281-0808. After 24 hours, follow up with the user to ask whether they have booked the consultation or if someone from the team is already assisting them. Never provide legal advice. Always stay within your role as an intake assistant.
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
