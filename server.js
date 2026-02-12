const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Variáveis (Railway > Variables)
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;         // Token do WhatsApp (Cloud API)
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;       // ID do número (phone number id)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;             // você escolhe (ex: paer123)

// --------- helpers ----------
async function sendText(to, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.log("Faltando WHATSAPP_TOKEN ou PHONE_NUMBER_ID");
    return;
  }

  await axios.post(
    `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// Memória simples em RAM (bom para teste)
const sessions = new Map();

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      stage: "WELCOME", // WELCOME -> IDENT -> MENU -> TOPIC
      ident: { nome: "", cpf: "", orgao: "", lotacao: "", comissao: "" }
    });
  }
  return sessions.get(phone);
}

function normalize(text) {
  return (text || "").trim().toLowerCase();
}

// --------- rotas ----------
app.get("/", (req, res) => res.send("PAER bot online ✅"));

/**
 * Verificação do Webhook (Meta chama isso ao configurar)
 */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/**
 * Recebe mensagens
 */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const msg = value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from; // telefone do usuário
    const text = msg.text?.body || "";
    const t = normalize(text);

    const s = getSession(from);

    // Atalho humano
    if (t === "0" || t.includes("atendente") || t.includes("humano")) {
      s.stage = "MENU";
      await sendText(from, "✅ Certo. Vou encaminhar para um atendente.\n(Para voltar ao menu depois, digite: MENU)");
      return res.sendStatus(200);
    }

    // Comando MENU
    if (t === "menu") {
      s.stage = "MENU";
    }

    if (s.stage === "WELCOME") {
      s.stage = "IDENT";
      await sendText(
        from,
        "Olá, este é o Canal de Atendimento do PAER/SESP.\n\n" +
        "O PAER é a Premiação Anual por Eficiência e Resultado da Segurança Pública.\n" +
        "Neste ciclo, estão sendo analisados os pedidos referentes ao período de 31/10/2025 a 31/12/2025.\n\n" +
        "⚠️ Para iniciar o atendimento, informe (em uma única mensagem, se possível):\n" +
        "▫️ Nome completo:\n▫️ CPF:\n▫️ Órgão de origem (PM, PJC, CBM ou POLITEC):\n▫️ Unidade de lotação atual:\n▫️ Se integra comissão/equipe, informe qual:\n\n" +
        "Se quiser falar direto com atendente, digite: 0"
      );
      return res.sendStatus(200);
    }

    if (s.stage === "IDENT") {
      // Para teste: aceita qualquer texto como “identificação enviada”
      s.stage = "MENU";
      await sendText(
        from,
        "✅ Identificação recebida.\n\n" +
        "Agora escolha o assunto (envie só o número):\n" +
        "1️⃣ Cadastro do pedido\n" +
        "2️⃣ Prazos e cronograma\n" +
        "3️⃣ Regras / pontuação / critérios\n" +
        "4️⃣ Problemas de acesso ao sistema\n" +
        "5️⃣ Comissão / atribuições\n" +
        "6️⃣ Envio de documentos\n" +
        "7️⃣ Outro assunto\n\n" +
        "Para atendente, digite: 0"
      );
      return res.sendStatus(200);
    }

    if (s.stage === "MENU") {
      if (["1","2","3","4","5","6","7"].includes(t)) {
        // respostas-base (depois vamos “amarrar” com IN/Decreto/Resolução)
        const base = {
          "1": "📌 *Cadastro do pedido*\nMe diga qual etapa você está (ex: cadastro, evidências, envio, conclusão) e qual mensagem/erro aparece.",
          "2": "⏱️ *Prazos e cronograma*\nMe diga se sua dúvida é sobre: prazo do usuário, prazo de análise, prazo de recurso ou cronograma geral.",
          "3": "🎯 *Regras / pontuação / critérios*\nDescreva a ocorrência/ação e qual órgão (PM/PJC/CBM/POLITEC).",
          "4": "🧩 *Problemas de acesso*\nInforme seu órgão e o erro (print ou texto).",
          "5": "👥 *Comissão / atribuições*\nQual comissão/equipe você faz parte e qual dúvida específica?",
          "6": "📎 *Envio de documentos*\nQual tipo de evidência você vai anexar (pdf, foto, boletim, relatório) e qual etapa do sistema?",
          "7": "📝 *Outro assunto*\nEscreva sua dúvida completa."
        };

        await sendText(from, base[t] + "\n\nPara voltar ao menu: MENU\nPara atendente: 0");
      } else {
        await sendText(from, "Envie um número de 1 a 7. Para menu: MENU. Para atendente: 0");
      }
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.log("Erro webhook:", err?.response?.data || err.message);
    return res.sendStatus(200);
  }
});

// Railway define PORT automaticamente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
