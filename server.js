require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
});

client.once("ready", () => {
  console.log("🤖 PAER BOT ONLINE");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // 🚫 NÃO RESPONDE EM GRUPO
  if (message.guild) {
    return;
  }

  const texto = message.content.toLowerCase();

  // 🎯 PROBLEMAS DE ACESSO = ATENDENTE
  const suporte = [
    "acesso",
    "login",
    "senha",
    "erro",
    "bug",
    "não entra",
    "nao entra",
    "link",
    "fora do ar",
    "não abre",
    "nao abre",
    "upload",
    "anexar",
    "travou"
  ];

  if (suporte.some(p => texto.includes(p))) {
    return message.reply(
      "Essa situação está relacionada a suporte técnico do sistema SISPAER.\nSua solicitação será encaminhada ao atendente responsável."
    );
  }

  // ❓ DÚVIDAS SOBRE REGRA / PRAZO / CRITÉRIO
  if (
    texto.includes("prazo") ||
    texto.includes("critério") ||
    texto.includes("meta") ||
    texto.includes("beneficiário") ||
    texto.includes("decreto") ||
    texto.includes("instrução normativa")
  ) {
    return message.reply(
      "Sua dúvida está relacionada às normas da PAER.\nOrienta-se consultar a Instrução Normativa ou a Comissão responsável."
    );
  }

  // 📌 PADRÃO
  return message.reply(
    "Recebemos sua mensagem.\nSe for suporte de acesso, encaminharemos ao atendente.\nSe for regra da premiação, consulte a Comissão."
  );
});

client.login(process.env.DISCORD_TOKEN);


