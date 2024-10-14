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
const cron = require('node-cron');

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

const { get } = require("http");
const { channel } = require("diagnostics_channel");

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

  if (!fs.existsSync("./stats.json")) {
    console.log("stats.json does not exist");
    return;
  }

  const saved_stats = require("./stats.json");
  if (
    saved_stats.hasOwnProperty("players") &&
    saved_stats.players.constructor === Array &&
    saved_stats.hasOwnProperty("result_messages") &&
    saved_stats.result_messages.constructor === Array
  ) {
    for (const player of saved_stats.players) {
      if (!player.hasOwnProperty("id") || !player.hasOwnProperty("points")) {
        console.log("Invalid player found in stats.json:");
        console.log(player);
        moveStatsToOld();
        break;
      }
    }
    for (const result_message in saved_stats.result_messages) {
      if (
        !result_message.hasOwnProperty("channel") ||
        !result_message.hasOwnProperty("id")
      ) {
        console.log("Invalid result_message found in stats.json:");
        console.log(result_message);
        moveStatsToOld();
        break;
      }
    }
    console.log("success - reloadStats()");
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
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// It makes some properties non-nullable.
// client.once(Events.ClientReady, (readyClient) => {});

function getTopPlayers(members, local, time_limited, head = 10) {
  let topPlayers;
  switch (time_limited) {
    case "false":
      topPlayers = stats.players.sort((a, b) => b.points - a.points);
      break;

    case "weekly":
      topPlayers = stats.players.sort((a, b) => b.weekly - a.weekly);
      break;

    case "monthly":
      topPlayers = stats.players.sort((a, b) => b.monthly - a.monthly);
      break;

    case "yearly":
      topPlayers = stats.players.sort((a, b) => b.yearly - a.yearly);
      break;

    default:
      console.error("error: getTopPlayers() got \"" + time_limited + "\" as time_limited argument - INVALID ARGUMENT");
      break;
  }
  if (local) {
    topPlayers = topPlayers.filter((p) => {
      console.log(p.id + " " + members.includes(p.id));
      return members.includes(p.id);
    });
  }
  return topPlayers.slice(0, head);
}

function getTopPlayersString(members, local, time_limited) {
  const topPlayers = getTopPlayers(members, local, time_limited);
  let topPlayersString = "";
  for (const [i, player] of topPlayers.entries()) {
    let timed_points;
    switch (time_limited) {
      case "false":
        timed_points = player.points;
        break;

      case "weekly":
        timed_points = player.weekly;
        break;

      case "monthly":
        timed_points = player.monthly;
        break;

      case "yearly":
        timed_points = player.yearly;
        break;

      default:
        console.error("error: getTopPlayersString() got \"" + time_limited + "\" as time_limited argument - INVALID ARGUMENT");
        break;
    }

    topPlayersString += `**${i + 1}. <@${player.id}>:**${timed_points
      } points\n`;
  }
  return topPlayersString;
}

function getTopPlayersEmbed(members, local, time_limited) {
  const embed = {
    color: 0x383d6b,
    title: (local ? "Local" : "Global") + (time_limited == "false" ? "" : (" " + time_limited)) + " leaderboard",
    description: getTopPlayersString(members, local, time_limited),
    fields: [],
  };
  return embed;
}

//time_limited {"false", "monthly", "weekly", "yearly"}
async function sendTopPlayersMessage(channel, members, time_limited = "false") {
  const embeds = [
    getTopPlayersEmbed(
      members.map((m) => m.user.id),
      true,
      time_limited
    ),
    getTopPlayersEmbed(
      members.map((m) => m.user.id),
      false,
      time_limited
    ),
  ];
  message_id = false;
  process.stdout.write("time limited: " + time_limited + "; result_messages: ");
  console.log(stats.result_messages);
  for (const result_message of stats.result_messages) {
    if (result_message.channel === channel.id) {
      message_id = (time_limited == "false") ? result_message.id : (time_limited == "weekly") ? result_message.weekly : (time_limited == "monthly") ? result_message.monthly : (time_limited == "yearly") ? result_message.yearly : undefined;
      break;
    }
  }
  if (message_id) {
    console.log("found result message for channel " + channel.id + " (" + channel.name + ")")
    const message = await channel.messages.fetch(message_id);
    message.edit({ embeds: embeds });
  } else {
    console.log("didnt find result message for channel " + channel.id);
    const message = await channel.send({
      embeds: embeds,
      fetchReply: true,
    });

    if (message_id === false) {
      //create a new entry in result_messages because this channel doesnt have one yet
      switch (time_limited) {
        case "false":
          stats.result_messages.push({ channel: channel.id, id: message.id });
          break;

        case "weekly":
          stats.result_messages.push({ channel: channel.id, weekly: message.id });
          break;

        case "monthly":
          stats.result_messages.push({ channel: channel.id, monthly: message.id });
          break;

        case "yearly":
          stats.result_messages.push({ channel: channel.id, yearly: message.id });
          break;

        default:
          console.error("error: sendTopPlayersMessage() got \"" + time_limited + "\" as time_limited argument - INVALID ARGUMENT");
          break;
      }
    }
    else {
      //add to the entry in result messages this channel already has
      stats.result_messages.forEach((result_message, index) => {
        if (result_message.channel === channel.id) {
          switch (time_limited) {
            case "false":
              this[index].id = message.id;
              break;

            case "weekly":
              this[index].weekly = message.id;
              break;

            case "monthly":
              this[index].monthly = message.id;
              break;

            case "yearly":
              this[index].yearly = message.id;
              break;

            default:
              console.error("error: getTopPlayers() got \"" + time_limited + "\" as time_limited argument - INVALID ARGUMENT");
              break;
          }
          return;
        }
      }, stats.result_messages); {
      }
    }

    fs.writeFile("stats.json", JSON.stringify(stats), "utf8", (err) => {
      if (err) {
        console.error("Error writing stats.json:", err);
        console.log("here are the stats that i couldnt save:\n" + JSON.stringify(stats) + "\n");
      }
    });
  }
}

function resetTimeLimitedData(time_limited) {
  stats.players.forEach((player, index) => {
    switch (time_limited) {
      case "false":
        console.error("error: trying to reset all time score if forbidden in resetTimeLimitedData function");
        break;

      case "weekly":
        this[index].weekly = 0;
        break;

      case "monthly":
        this[index].monthly = 0;
        break;

      case "yearly":
        this[index].yearly = 0;
        break;

      default:
        console.error("error: resetTimeLimitedData() got \"" + time_limited + "\" as time_limited argument - INVALID ARGUMENT");
        break;
    }
  }, stats.players)

  fs.writeFile("stats.json", JSON.stringify(stats), "utf8", (err) => {
    if (err) {
      console.error("Error writing stats.json:", err);
      console.log("here are the stats that i couldnt save:\n" + JSON.stringify(stats) + "\n");
    }
  });
}

async function newTimeLimitedMessage(channel, members, time_limited) {
  const embeds = [
    getTopPlayersEmbed(
      members.map((m) => m.user.id),
      true,
      time_limited
    ),
    getTopPlayersEmbed(
      members.map((m) => m.user.id),
      false,
      time_limited
    ),
  ];
  await channel.send({
    content: time_limited + " leaderboard just ended! take a look at the results :eyes:",
    embeds: embeds,
  });
  //TODO: records here!
  resetTimeLimitedData(time_limited);
  sendTopPlayersMessage(channel, members, time_limited);
}

async function newTimeLimitedMessages(channels, time_limited) {
  for (const channel of channels) {
    let updateChannel = await client.channels.fetch(channel);

    const guild = await client.guilds.fetch(updateChannel.guildId);
    const members = await guild.members.fetch();

    newTimeLimitedMessage(updateChannel, members, time_limited);
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

async function updateResults(channels, messages, watered, cite) {
  for (let i = 0; i < channels.length; i++) {
    let message = messages[i];
    let updateChannel = await client.channels.fetch(channels[i]);

    const guild = await client.guilds.fetch(updateChannel.guildId);
    const members = await guild.members.fetch();

    sendTopPlayersMessage(updateChannel, members);
    message.edit({
      content:
        `## ${cite}\n${watered.length} ${watered.length == 1 ? "person has" : "people have"
        } been watered\n` +
        watered.map((w) => `<@${w.userId}>: \`${w.time}\``).join("\n"),
    });
  }
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
        player.weekly += 1;
        player.monthly += 1;
        player.yearly += 1;
      } else {
        stats.players.push({ id: user.id, points: 1, weekly: 1, monthly: 1, yearly: 1 });
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
      await updateResults(channels, messages, watered, cite);
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
        player.weekly -= 1;
        player.monthly -= 1;
        player.yearly -= 1;
        fs.writeFile("stats.json", JSON.stringify(stats), "utf8", (err) => {
          if (err) {
            console.log("Error writing stats.json:", err);
          }
        });
      }
      watered = watered.filter((item) => item.userId !== user.id);
      await updateResults(channels, messages, watered, cite);
    });

    collector.on("end", (collected) => {
      console.log(`Collected ${collected.size} items`);
    });
  });
}

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

// const SECOND_MS = 1000;
// const MINUTE_MS = 60 * SECOND_MS
// const HOUR_MS = 60 * MINUTE_MS;

client.on("ready", async (client) => {
  console.log(`Ready! Logged in as ${client.user.tag}`);

  cron.schedule('30 1,4,7,10,13,16,19,22 * * *', () => {
    water_your_plants(config.active_channels);
  });

  cron.schedule('0 0 * * 1', () => {
    newTimeLimitedMessages(config.active_channels, "weekly");
  });

  cron.schedule('0 0 1 * *', () => {
    newTimeLimitedMessages(config.active_channels, "monthly");
  });

  cron.schedule('0 0 1 1 *', () => {
    newTimeLimitedMessages(config.active_channels, "yearly");
  });

  water_your_plants([config.active_channels[0]]);
});

// Log in to Discord with your client's token
client.login(config.token);
