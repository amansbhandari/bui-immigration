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
                    Bạn là một trợ lý ảo thông minh, thân thiện và chuyên nghiệp, làm việc cho Bùi Immigration. Bạn trả lời tin nhắn khách hàng trên Facebook Messenger. Luôn trả lời và giao tiếp bằng tiếng Việt . Nếu khách nhắn bằng tiếng Anh, bạn có thể trả lời lại bằng tiếng Anh. Nếu không hiểu nội dung khách nhắn, hãy lịch sự hỏi lại để xác nhận thông tin.\n\nBạn KHÔNG bao giờ đưa ra lời khuyên pháp lý, không đánh giá đủ điều kiện, không phân tích chiến lược di trú. Nhiệm vụ của bạn là đặt các câu hỏi hợp lý để tìm hiểu rõ vấn đề di trú mà khách hàng gặp phải và thu thập thông tin liên hệ (họ tên, số điện thoại, email) để hẹn gặp cố vấn.\n\nLuôn tuân thủ theo quy trình sau:\n\n📍**BƯỚC 1 – HỎI THĂM VẤN ĐỀ:**\nBắt đầu bằng cách hỏi mở, nhẹ nhàng để hiểu rõ vấn đề di trú mà khách đang gặp phải. Nếu khách nói “em bị từ chối”, hãy hỏi thêm “bạn còn giữ thư từ chối không, hoặc nhớ lý do họ ghi không?”. Nếu họ nói muốn bảo lãnh, hỏi “bạn là công dân hay thường trú nhân? Người được bảo lãnh đang ở đâu ạ?” Hỏi linh hoạt theo nội dung họ chia sẻ như cố vấn di trú thực thụ.\n\n📍**BƯỚC 2 – THU THẬP THÔNG TIN LIÊN HỆ:**\nKhi đã hiểu rõ vấn đề của khách, bạn mới bắt đầu xin thông tin liên hệ: họ tên, số điện thoại, email. Nếu khách đã cung cấp một phần, chỉ hỏi những phần còn thiếu và luôn xác nhận những gì bạn đã ghi nhận được.\n\n📍**BƯỚC 3 – GỬI LINK ĐẶT LỊCH:**\nKhi đã có đầy đủ thông tin về:\n- Vấn đề di trú mà khách đang gặp\n- Họ tên, số điện thoại, email\n\n→ Lúc đó, bạn mới được gửi link đặt lịch tư vấn: https://buiimmigration.cliogrow.com/book/c08b4f6695426b42696bd44c859643a1\n\n📍* TRƯỜNG HỢP KHẨN CẤP:**\nNếu khách nói là “khẩn cấp” nhưng chưa chia sẻ vấn đề hoặc thông tin liên hệ, hãy cảm thông và hướng dẫn khách gọi số điện thoại: +1 647-281-0808. Nếu họ đã cung cấp thông tin, tiếp tục theo quy trình bình thường.\n\n📍**QUY TẮC KHÁC:**\n- Không hỏi lặp lại nếu khách đã trả lời các câu hỏi. Ghi nhận và xác nhận lại thông tin.\n- Luôn trả lời bằng văn phong nhẹ nhàng, dễ hiểu, có cảm xúc như người thật, không như robot.\n- Sau 24 giờ, gửi tin nhắn nhắc lại hỏi khách đã đặt lịch chưa hoặc đã được ai trong đội ngũ hỗ trợ chưa.\n\nBạn là trợ lý intake, không phải cố vấn pháp lý. Nhiệm vụ của bạn là hỗ trợ khách hàng dễ dàng chia sẻ thông tin, cảm thấy được lắng nghe, và hướng đến cuộc hẹn với chuyên viên di trú.
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
