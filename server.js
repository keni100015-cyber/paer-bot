import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ====== ENV ======
const PORT = process.env.PORT || 3000;

// Token de verificação do Webhook (você define no Meta e repete aqui no Railway)
const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;

// Token permanente (ou temporário) da Cloud API
const WA_TOKEN = process.env.WA_TOKEN;

// Phone Number ID (aquele que aparece no painel da Cloud API)
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;

// (Opcional) OpenAI para respostas “IA” depois
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ====== MEMÓRIA SIMPLES (em produção real, ideal é banco) ======
const sessions = new Map(); // key: wa_id (telefone), value: { step, profile, lastUpdated }

// Palavras para cair no atendente humano
const HUMAN_KEYWORDS = [
  "atendente",
  "humano",
  "pessoa",
  "falar com atendente",
  "falar com humano",
  "quero atendente",
  "quero humano",
  "transferir",
  "encaminhar",
  "7", // opção “Outro assunto” pode ser atendente
];

// ====== TEXTOS ======
const MSG_WELCOME_1 = `Olá, este é o Canal de Atendimento do PAER/SESP.

O PAER é a Premiação Anual por Eficiência e Resultado da Segurança Pública.

Neste ciclo, estão sendo analisados os pedidos referentes ao período de 31/10/2025 a 31/12/2025.

⚠️ Para iniciar o atendimento, informe (em uma única mensagem):

▫️ Nome completo:
▫️ CPF:
▫️ Órgão de origem (PM, PJC, CBM ou POLITEC):
▫️ Unidade de lotação atual:
▫️ Se integra comissão/equipe, informe qual (se não, escreva “não”).
`;

const MSG_MENU = `✅ Identificação recebida.

Agora, informe o número do assunto desejado:

1️⃣ Cadastro do pedido
2️⃣ Prazos e cronograma
3️⃣ Regras / pontuação / critérios
4️⃣ Problemas de acesso ao sistema
5️⃣ Comissão / atribuições
6️⃣ Envio de documentos
7️⃣ Outro assunto / falar com atendente

Envie apenas o número.`;

const MSG_HUMAN = `✅ Certo. Vou encaminhar seu atendimento para um atendente humano.

Enquanto isso, descreva seu problema em uma mensagem (com máximo de detalhes).`;

// ====== HELPERS ======
function normalize(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function isHumanRequest(text = "") {
  const t = normalize(text);
  return HUMAN_KEYWORDS.some((k) => t.includes(normalize(k)));
}

function getSession(waId) {
  const s = sessions.get(waId);
  if (!s) return null;
  return s;
}

function setSession(waId, data) {
  sessions.set(waId, { ...data, lastUpdated: Date.now() });
}

function resetSession(waId) {
  sessions.delete(waId);
}

async function sendWhatsAppText(to, body) {
  if (!WA_TOKEN || !WA_PHONE_NUMBER_ID) {
    console.error("❌ WA_TOKEN ou WA_PHONE_NUMBER_ID ausente nas variáveis.");
    return;
  }

  const url = `https://graph.facebook.com/v22.0/${WA_PHONE_NUMBER_ID}/messages`;
  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    },
    {
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );
}

// Ponto de entrada futuro: responder “com base na IN/Decreto/Resolução”
async function answerFromNorms(topicNumber, userText) {
  // Por enquanto: respostas “placeholders” (vamos substituir pelos textos normativos depois)
  // Quando você me mandar a tabela de prazos/trechos, eu encaixo aqui.
  const base = {
    "1": `Cadastro do pedido: descreva em qual etapa você está e se aparece algum erro.`,
    "2": `Prazos e cronograma: informe qual fase você quer (cadastro, complementação, análise, recurso etc.).`,
    "3": `Regras / pontuação / critérios: diga qual ocorrência/ação você quer confirmar se enquadra.`,
    "4": `Problemas de acesso: informe seu erro (print ou texto) e se é no celular ou PC.`,
    "5": `Comissão / atribuições: informe seu órgão e a dúvida sobre sua competência.`,
    "6": `Envio de documentos: diga qual documento e em qual etapa do sistema.`,
    "7": `Outro assunto: descreva sua demanda para direcionamento.`,
  };

  return base[String(topicNumber)] || `Entendi. Descreva melhor sua dúvida, por favor.`;
}

// ====== WEBHOOK VERIFY (GET) ======
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado com sucesso.");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ====== WEBHOOK RECEIVE (POST) ======
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const messages = value?.messages;
    if (!messages || !messages.length) {
      return res.sendStatus(200);
    }

    const msg = messages[0];

    // ✅ 1) Ignorar mensagens de grupo
    // Na Cloud API, mensagens de grupo costumam vir com "context" apontando para o grupo.
    if (msg.context && msg.context.id) {
      return res.sendStatus(200);
    }

    // Dados básicos
    const from = msg.from; // número do usuário
    const type = msg.type;

    // Só texto por enquanto
    if (type !== "text") {
      await sendWhatsAppText(
        from,
        "Recebi seu contato. No momento, este canal atende apenas mensagens de texto. Por favor, envie sua mensagem em texto."
      );
      return res.sendStatus(200);
    }

    const text = msg.text?.body || "";
    const textNorm = normalize(text);

    // Reset manual
    if (textNorm === "reiniciar" || textNorm === "reset") {
      resetSession(from);
      await sendWhatsAppText(from, "✅ Atendimento reiniciado.\n\n" + MSG_WELCOME_1);
      return res.sendStatus(200);
    }

    // Atendente humano
    if (isHumanRequest(text)) {
      setSession(from, { step: "human", profile: null });
      await sendWhatsAppText(from, MSG_HUMAN);
      return res.sendStatus(200);
    }

    // Pega sessão
    const session = getSession(from);

    // Se ainda não tem sessão, começa pedindo identificação (mensagem 1)
    if (!session) {
      setSession(from, { step: "await_profile", profile: null });
      await sendWhatsAppText(from, MSG_WELCOME_1);
      return res.sendStatus(200);
    }

    // Se está em atendimento humano, só confirma que recebeu (não tenta automatizar)
    if (session.step === "human") {
      await sendWhatsAppText(
        from,
        "✅ Recebido. Um atendente humano dará continuidade assim que possível."
      );
      return res.sendStatus(200);
    }

    // Etapa: aguardando identificação
    if (session.step === "await_profile") {
      // Aqui você pode validar CPF, etc. (se quiser depois)
      setSession(from, { step: "await_topic", profile: text });
      await sendWhatsAppText(from, MSG_MENU);
      return res.sendStatus(200);
    }

    // Etapa: aguardando opção de assunto
    if (session.step === "await_topic") {
      const option = textNorm.replace(/[^\d]/g, ""); // pega só número

      // Se usuário não mandou número, pede de novo
      if (!["1", "2", "3", "4", "5", "6", "7"].includes(option)) {
        await sendWhatsAppText(from, "Por favor, envie apenas o número de 1 a 7.\n\n" + MSG_MENU);
        return res.sendStatus(200);
      }

      if (option === "7") {
        setSession(from, { step: "human", profile: session.profile });
        await sendWhatsAppText(from, MSG_HUMAN);
        return res.sendStatus(200);
      }

      // Resposta baseada no “núcleo” (vamos trocar pelo conteúdo normativo depois)
      const reply = await answerFromNorms(option, text);

      // Mantém sessão nessa etapa, para o usuário poder perguntar mais sobre o mesmo tópico
      setSession(from, { step: "in_topic", profile: session.profile, topic: option });

      await sendWhatsAppText(from, reply + "\n\n(Se quiser trocar de assunto, envie: MENU)");
      return res.sendStatus(200);
    }

    // Etapa: dentro de um tópico (perguntas adicionais)
    if (session.step === "in_topic") {
      if (textNorm === "menu") {
        setSession(from, { step: "await_topic", profile: session.profile });
        await sendWhatsAppText(from, MSG_MENU);
        return res.sendStatus(200);
      }

      // Reforço: se pedir atendente aqui, transfere
      if (isHumanRequest(text)) {
        setSession(from, { step: "human", profile: session.profile });
        await sendWhatsAppText(from, MSG_HUMAN);
        return res.sendStatus(200);
      }

      const topic = session.topic || "7";
      const reply = await answerFromNorms(topic, text);

      await sendWhatsAppText(from, reply + "\n\n(Se quiser trocar de assunto, envie: MENU)");
      return res.sendStatus(200);
    }

    // fallback
    await sendWhatsAppText(from, "Não entendi. Envie MENU para ver as opções, ou REINICIAR para começar do zero.");
    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Erro no webhook:", err?.response?.data || err.message);
    return res.sendStatus(200); // responde 200 pra Meta não ficar reenviando em loop
  }
});

app.get("/", (req, res) => {
  res.status(200).send("PAER Bot online ✅");
});

app.listen(PORT, () => {
  console.log(`✅ Server rodando na porta ${PORT}`);
});
