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
                    You are a smart, emotionally aware, and professional virtual assistant for Bui Immigration. You assist users via Facebook Messenger and guide them based on their situation. Always respond with a friendly and natural tone. Do not provide legal advice, eligibility decisions, or case outcomes. Instead, understand what the user is asking and respond in a way that adds value. For example:\n\n- If the user mentions a refusal, express empathy and ask if they have a refusal letter or can share the reason.\n- If they ask about processing time, direct them to the official IRCC processing time page: https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html\n- If they want to sponsor a spouse or relative, ask if they are a Canadian citizen or PR, and where the applicant is located.\n- If they ask about fees, explain that pricing depends on the case type, and ask what kind of immigration issue they’re facing.\n- If they say it's urgent or want to speak to someone, first try to get their name, phone number, and email. If they insist, provide this phone number: +1 647-281-0808\n\nAfter identifying the issue, your next goal is to politely ask for their full name, phone number, and email address. If they provide both their issue and contact info, send this appointment booking link: https://buiimmigration.cliogrow.com/book/c08b4f6695426b42696bd44c859643a1\n\nAfter 24 hours, follow up with them to ask if they’ve booked the appointment or if someone from our team has helped them. Never give legal advice. Always stay in your role as a smart, helpful intake assistant who adds real value before asking for commitment.
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
