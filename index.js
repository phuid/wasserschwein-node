const {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  Collection,
} = require("discord.js");
const fs = require("fs");
const { exit, send } = require("process");
const path = require("path");

if (!fs.existsSync("./config.json")) {
  console.log("config.json does not exist");
  exit(1);
}

let config;

function reloadConfig() {
  config = require("./config.json");
  if (!config.token) {
    console.log("No token found in config.json");
    exit(1);
  }
  if (!config.active_channels || !config.active_channels.length) {
    console.log("No active_channels found in config.json");
  }
}
reloadConfig();

if (!fs.existsSync("./stats.json")) {
  console.log("stats.json does not exist");
  fs.writeFileSync("stats.json", '{"players":[]}');
}

const { get } = require("http");

let stats = {
  players: [],
  result_messages: [],
};

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

function reloadStats() {
  const saved_stats = require("./stats.json");
  if (
    saved_stats.hasOwnProperty("players") &&
    saved_stats.players.constructor === Array &&
    saved_stats.hasOwnProperty("result_messages") &&
    saved_stats.result_messages.constructor === Array
  ) {
    for (const player of saved_stats.players) {
      if (!player.hasOwnProperty("id") || !player.hasOwnProperty("points")) {
        console.log("Invalid player found in stats.json");
        moveStatsToOld();
        break;
      }
    }
    for (const result_message in saved_stats.result_messages) {
      if (
        !result_message.hasOwnProperty("channel") ||
        !result_message.hasOwnProperty("id")
      ) {
        console.log("Invalid result_message found in stats.json");
        moveStatsToOld();
        break;
      }
    }
    stats = saved_stats;
  } else {
    console.log(
      "Parent object in stats.json is invalid (missing playsers or result_messages array), moving to stats.json.old"
    );
    moveStatsToOld();
  }
}
reloadStats();

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

function getTopPlayers(members, local, head = 10) {
  let topPlayers = stats.players.sort((a, b) => b.points - a.points);
  if (local) {
    console.log(members);
    topPlayers.filter((p) => {
      console.log(p.id + " " + members.has(p.id));
      return members.has(p.id);
    });
  }
  return topPlayers.slice(0, head);
}

function getTopPlayersString(members, local) {
  const topPlayers = getTopPlayers(members, local);
  let topPlayersString = "";
  for (const [i, player] of topPlayers.entries()) {
    topPlayersString += `**${i + 1}. <@${player.id}>:**${
      player.points
    } points\n`;
  }
  return topPlayersString;
}

function getTopPlayersEmbed(members, local) {
  const embed = {
    color: 0x383d6b,
    title: local ? "Local leaderboard" : "Global Leaderboard",
    description: getTopPlayersString(members, local),
    fields: [],
  };
  return embed;
}

async function sendTopPlayersMessage(channel, members) {
  const embeds = [
    getTopPlayersEmbed(members, true),
    getTopPlayersEmbed(members, false),
  ];
  message_id = false;
  for (const result_message of stats.result_messages) {
    if (result_message.channel === channel.id) {
      message_id = result_message.id;
      break;
    }
  }
  if (message_id) {
    const message = await channel.messages.fetch(message_id);
    message.edit({ embeds: embeds });
  } else {
    const message = await channel.send({
      embeds: embeds,
      fetchReply: true,
    });

    stats.result_messages.push({ channel: channel.id, id: message.id });
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

function getTimeString(time) {
  const seconds = time / 1000;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(
    2,
    "0"
  )}:${String((seconds % 60).toFixed(3)).padStart(6, "0")}`;
}

function getTimeDifferenceString(start, end = Date.now()) {
  console.log(start, end);
  return getTimeString(end - start);
}

async function water_your_plants(channels) {
  let cite = config.STRINGS[Math.floor(Math.random() * config.STRINGS.length)];

  // array to store times of watering
  let watered = [];
  let messages = [];

  channels.forEach(async (channel_id) => {
    const channel = await client.channels.fetch(channel_id);
    const message = await channel.send({
      content: "## " + cite,
      fetchReply: true,
    });
    message.react("💦");
    messages.push(message);

    const collector = message.createReactionCollector({
      filter: collectorFilter,
      time: 3 * 60 * 60 * 1000,
      dispose: true,
    });

    // check watered before adding score
    collector.on("collect", async (reaction, user) => {
      console.log(`Collected ${reaction.emoji.name} from ${user.id}`);
      if (watered.find((w) => w.userId === user.id)) {
        console.log("User already watered");
        return;
      }
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
      watered.push({
        userId: user.id,
        time: getTimeDifferenceString(message.createdTimestamp),
      });
      for (let i = 0; i < channels.length; i++) {
        let message = messages[i];
        let updateChannel = await client.channels.fetch(channels[i]);

        let members = updateChannel.members;

        sendTopPlayersMessage(updateChannel, members);
        message.edit({
          content:
            `## ${cite}\n${watered.length} ${
              watered.length == 1 ? "person has" : "people have"
            } been watered\n` +
            watered
              .filter((p) => members.has(p.userId))
              .map((w) => `<@${w.userId}>: \`${w.time}\``)
              .join("\n"),
        });
      }
    });

    collector.on("remove", async (reaction, user) => {
      if (!watered.find((w) => w.userId === user.id)) {
        console.log("User not watered");
        return;
      }
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
      watered = watered.filter((item) => item.userId !== user.id);
      for (let i = 0; i < channels.length; i++) {
        let message = messages[i];
        let updateChannel = await client.channels.fetch(channels[i]);

        let members = updateChannel.members;

        sendTopPlayersMessage(updateChannel, members);
        message.edit({
          content:
            `## ${cite}\n${watered.length} ${
              watered.length == 1 ? "person has" : "people have"
            } been watered\n` +
            watered
              .filter((p) => members.has(p.userId))
              .map((w) => `<@${w.userId}>: \`${w.time}\``)
              .join("\n"),
        });
      }
    });

    collector.on("end", (collected) => {
      console.log(`Collected ${collected.size} items`);
    });
  });
}

let water_interval;

client.commands = new Collection();

const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
      );
    }
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
    reloadConfig();
    if (
      interaction.replied ||
      (interaction.deferred && interaction.commandName == "addchannel")
    ) {
      await interaction.followUp({
        content: "Command executed successfully!",
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  }
});

client.on("ready", async (client) => {
  console.log(`Ready! Logged in as ${client.user.tag}`);

  water_interval = setInterval(() => {
    water_your_plants(config.active_channels);
  }, 3 * 60 * 60 * 1000); // 1 hour
  water_your_plants(config.active_channels);
});

// Log in to Discord with your client's token
client.login(config.token);
