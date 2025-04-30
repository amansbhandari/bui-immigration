require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');

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
app.post('/webhook', (req, res) => {
    let body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(function(entry) {
            let webhook_event = entry.messaging[0];
            let sender_psid = webhook_event.sender.id;

            if (webhook_event.message && webhook_event.message.text) {
                const userMessage = webhook_event.message.text;
                handleUserMessage(sender_psid, userMessage);
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// Send message to user
function sendMessage(sender_psid, responseText) {
    const request_body = {
        recipient: { id: sender_psid },
        message: { text: responseText }
    };

    request({
        uri: 'https://graph.facebook.com/v12.0/me/messages',
        qs: { access_token: PAGE_ACCESS_TOKEN },
        method: 'POST',
        json: request_body
    }, (err, res, body) => {
        if (!err) {
            console.log('Message sent!');
        } else {
            console.error('Unable to send message:', err);
        }
    });
}

// Handle User Message using OpenAI
function handleUserMessage(sender_psid, userMessage) {
    const options = {
        method: 'POST',
        uri: 'https://api.openai.com/v1/chat/completions',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: `
                    You are Sara Ha Bui, a licensed Canadian immigration consultant at Bui Immigration.
                    Always answer professionally about Canadian immigration: PR, TRP, Refugee, Appeals.
                    If asked about other topics, politely decline.
                ` },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.5
        },
        json: true
    };

    request(options, (error, response, body) => {
        if (!error && response.statusCode === 200) {
            const reply = body.choices[0].message.content.trim();
            sendMessage(sender_psid, reply);
        } else {
            console.error('OpenAI API Error', error || body);
            sendMessage(sender_psid, "Xin lỗi, hệ thống đang bận. Vui lòng thử lại sau!");
        }
    });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));