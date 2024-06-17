const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removechannel")
    .setDescription(
      "removes current / specified channel from the list of active channels."
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription(
          "The channel to remove from the list of active channels."
        )
        .setRequired(false)
    ),
  async execute(interaction) {
    let channel =
      interaction.options.getChannel("channel") || interaction.channel;

    if (!channel.isText()) {
      await interaction.reply("This command only works for text channels.");
      return;
    }

    let channel_id = channel.id;

    let config = require("../../config.json");

    if (config.active_channels.includes(channel_id)) {
      myArray.splice(myArray.indexOf(channel_id), 1);
      require("fs").writeFileSync(
        require("path").join(__dirname, "../../config.json"),
        JSON.stringify(config, null, 2)
      );
      await interaction.reply(
        `Removed <#${channel_id}> from the list of active channels.`
      );
    } else {
      await interaction.reply(
        `Channel <#${channel_id}> is not in the list of active channels.`
      );
    }
  },
};
