var dotenv = require('dotenv');
var Discord = require('discord.js');
var _a = require('discord.js'), Client = _a.Client, GatewayIntentBits = _a.GatewayIntentBits, Partials = _a.Partials;
var client = new Client({
    intents: Object.values(Discord.Intents.FLAGS),
    partials: "USER,CHANNEL,GUILD_MEMBER,MESSAGE,REACTION".split(',').map(function (partial) { return Partials[partial]; }),
});
dotenv.config();
client.on('ready', function () { return console.log("Logged in as ".concat(client.user.tag, " at ").concat(new Date())); });
client.on('error', function (err) { return console.log(err); });
client.login(process.env.DISCORD_TOKEN);
