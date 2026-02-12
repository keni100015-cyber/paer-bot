const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

app.get("/", (req, res) => {
  res.send("PAER BOT ONLINE");
});

// verificação do webhook
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// recebimento das mensagens
app.post("/webhook", async (req, res) => {
  try {
    const message =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body?.toLowerCase() || "";

    let resposta = "Não entendi. Envie um número de 1 a 7.";

    if (text === "1") resposta = "Cadastro do pedido: siga as orientações do sistema.";
    if (text === "2") resposta = "Os prazos seguem a resolução vigente do PAER.";
    if (text === "3") resposta = "Os critérios estão definidos na Instrução Normativa.";
    if (text === "4") resposta = "Para problemas de acesso, procure o suporte.";
    if (text === "5") resposta = "As atribuições das comissões estão na resolução.";
    if (text === "6") resposta = "O envio de documentos deve ocorrer pelo sistema.";
    if (text === "7") resposta = "Descreva sua dúvida para o atendente.";

    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: resposta },
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.sendStatus(200);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor rodando"));
