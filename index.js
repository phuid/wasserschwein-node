const { Client, Events, GatewayIntentBits, Partials } = require("discord.js");
const fs = require("fs");
const { exit, send } = require("process");

if (!fs.existsSync("./config.json")) {
  console.log("config.json does not exist");
  exit(1);
}

const config = require("./config.json");

if (!config.token) {
  console.log("No token found in config.json");
  exit(1);
}
if (!config.channel_id) {
  console.log("No channel_id found in config.json");
  exit(1);
}

if (!fs.existsSync("./stats.json")) {
  console.log("stats.json does not exist");
  fs.writeFileSync("stats.json", '{"players":[]}');
}

const saved_stats = require("./stats.json");
const { get } = require("http");

let stats;

function moveStatsToOld() {
  fs.renameSync("./stats.json", "./stats.json.old", (err) => {
    if (err) {
      console.log("Error renaming file:", err);
      exit(1);
    } else {
      console.log("stats.json renamed to stats.json.old");
    }
  });
}

if (
  saved_stats.hasOwnProperty("players") &&
  saved_stats.players.constructor === Array
) {
  for (const player of saved_stats.players) {
    if (!player.hasOwnProperty("id") || !player.hasOwnProperty("points")) {
      console.log("Invalid player found in stats.json");
      moveStatsToOld();
      break;
    }
  }
  stats = saved_stats;
} else {
  console.log("No players found in stats.json");
  moveStatsToOld();
}

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// It makes some properties non-nullable.
// client.once(Events.ClientReady, (readyClient) => {});

function getTopPlayers() {
  const topPlayers = stats.players
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);
  return topPlayers;
}

function getTopPlayersString() {
  const topPlayers = getTopPlayers();
  let topPlayersString = "";
  for (const [i, player] of topPlayers.entries()) {
    topPlayersString += `**${i + 1}. <@${player.id}>:**${
      player.points
    } points\n`;
  }
  return topPlayersString;
}

function getTopPlayersEmbed() {
  const topPlayers = getTopPlayers();
  const embed = {
    color: 0x383d6b,
    title: "Top 10 Players",
    description: getTopPlayersString(),
    fields: [],
  };
  return embed;
}

async function sendTopPlayersMessage(channel) {
  const topPlayersEmbed = getTopPlayersEmbed();
  if (stats.hasOwnProperty("message_id")) {
    const message = await channel.messages.fetch(stats.message_id);
    message.edit({ embeds: [topPlayersEmbed] });
  } else {
    const message = await channel.send({
      embeds: [topPlayersEmbed],
      fetchReply: true,
    });

    stats.message_id = message.id;
    fs.writeFile("stats.json", JSON.stringify(stats), "utf8", (err) => {
      if (err) {
        console.log("Error writing stats.json:", err);
      }
    });
  }
}

const collectorFilter = (reaction, user) => {
  return reaction.emoji.name === "💦" && user.id != "1232769193515155580";
};

async function water_your_plants(channel) {
  const message = await channel.send({
    content: config.STRINGS[Math.floor(Math.random() * config.STRINGS.length)],
    fetchReply: true,
  });
  message.react("💦");

  const collector = message.createReactionCollector({
    filter: collectorFilter,
    time: (3 * 60 * 60 * 1000),
    dispose: true,
  });

  collector.on("collect", (reaction, user) => {
    console.log(`Collected ${reaction.emoji.name} from ${user.id}`);
    const player = stats.players.find((p) => p.id === user.id);
    if (player) {
      player.points += 1;
    } else {
      stats.players.push({ id: user.id, points: 1 });
    }
    fs.writeFile("stats.json", JSON.stringify(stats), "utf8", (err) => {
      if (err) {
        console.log("Error writing stats.json:", err);
      }
    });
    sendTopPlayersMessage(channel);
  });

  collector.on("remove", (reaction, user) => {
    console.log(`Removed ${reaction.emoji.name} from ${user.id}`);
    const player = stats.players.find((p) => p.id === user.id);
    if (player) {
      player.points -= 1;
      fs.writeFile("stats.json", JSON.stringify(stats), "utf8", (err) => {
        if (err) {
          console.log("Error writing stats.json:", err);
        }
      });
    }
  });

  collector.on("end", (collected) => {
    console.log(`Collected ${collected.size} items`);
  });
}

let water_interval;

client.on("ready", async (client) => {
  console.log(`Ready! Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(config.channel_id);

  channel.send("start");
  water_interval = setInterval(() => {
    water_your_plants(channel);
  }, 3 * 60 * 60 * 1000); // 1 hour
  water_your_plants(channel);
});

// Log in to Discord with your client's token
client.login(config.token);
