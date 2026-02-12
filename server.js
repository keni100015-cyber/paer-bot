const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const {
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  VERIFY_TOKEN
} = process.env;

function isGroupMessage(msg) {
  // Segurança extra: em alguns provedores/formatos grupo vem com sufixo g.us
  const from = msg?.from || "";
  const contextFrom = msg?.context?.from || "";
  return (
    String(from).includes("g.us") ||
    String(contextFrom).includes("g.us")
  );
}

function normalizeText(s) {
  return (s || "").toString().trim().toLowerCase();
}

function isSupport(texto) {
  const suporte = [
    "acesso", "login", "senha", "erro", "bug",
    "não entra", "nao entra", "link", "fora do ar",
    "não abre", "nao abre", "upload", "anexar", "travou",
    "problema", "portal", "sistema"
  ];
  return suporte.some(p => texto.includes(p));
}

function isRules(texto) {
  const regras = [
    "prazo", "critério", "criterio", "meta", "beneficiário",
    "beneficiario", "decreto", "instrução normativa", "instrucao normativa",
    "resolução", "resolucao", "comissão", "comissao"
  ];
  return regras.some(p => texto.includes(p));
}

async function sendWhatsAppText(to, body) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.log("⚠️ Variáveis do WhatsApp não configuradas.");
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      text: { body }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ✅ Verificação do Webhook (Meta chama via GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado com sucesso!");
    return res.status(200).send(challenge);
  }

  console.log("❌ Falha na verificação do webhook.");
  return res.sendStatus(403);
});

// ✅ Recebimento de mensagens (Meta chama via POST)
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const messages = value?.messages || [];
    if (!messages.length) return res.sendStatus(200);

    const msg = messages[0];

    // 🚫 NÃO RESPONDE EM GRUPO
    if (isGroupMessage(msg)) {
      console.log("🚫 Mensagem de grupo ignorada.");
      return res.sendStatus(200);
    }

    const from = msg.from; // telefone do usuário (ex: "5565....")
    const texto = normalizeText(msg?.text?.body);

    if (!from || !texto) return res.sendStatus(200);

    // 🎯 PROBLEMAS DE ACESSO = ATENDENTE
    if (isSupport(texto)) {
      await sendWhatsAppText(
        from,
        "Essa situação está relacionada a SUPORTE TÉCNICO / ACESSO ao SISPAER.\nEncaminhe sua solicitação ao atendente responsável."
      );
      return res.sendStatus(200);
    }

    // ❓ DÚVIDAS SOBRE REGRA / PRAZO / CRITÉRIO
    if (isRules(texto)) {
      await sendWhatsAppText(
        from,
        "Sua dúvida está relacionada às NORMAS/CRITÉRIOS/PRAZOS da PAER.\nOrienta-se consultar a Instrução Normativa/Resolução/Decreto ou a Comissão responsável."
      );
      return res.sendStatus(200);
    }

    // 📌 PADRÃO
    await sendWhatsAppText(
      from,
      "Recebemos sua mensagem.\nSe for suporte de acesso, encaminhe ao atendente.\nSe for norma/prazo/critério, consulte a Comissão."
    );

    return res.sendStatus(200);
  } catch (err) {
    console.log("❌ Erro no webhook:", err?.response?.data || err.message);
    return res.sendStatus(200); // Meta exige 200 pra não ficar reenviando
  }
});

app.get("/", (req, res) => res.send("PAER WhatsApp Bot Online ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Rodando na porta ${PORT}`));

