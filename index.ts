import { v4 } from 'uuid';
import fs from 'fs';

import { Client, Colors, Events, GatewayIntentBits } from 'discord.js';
import { EmbedBuilder } from 'discord.js';

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

async function guess(prev: string, guess: string, gameId: string | null) {
	if (!gameId) {
		gameId = v4();
	}
	const req = await fetch('https://www.whatbeatsrock.com/api/vs', {
		method: 'POST',
		body: JSON.stringify({
			gid: gameId,
			guess: guess,
			prev: prev,
		}),
	});
	const text = await JSON.parse(await req.text());
	const data = text.data;
	if (!data) {
		return {
			gameId: gameId,
			prev: prev,
			guess: guess,
			end: false,
			guess_wins: false,
			reason: 'Invalid guess Try again',
		};
	}
	return Object.assign(data, {
		gameId: gameId,
		prev: prev,
		guess: guess,
	});
}

interface Guess {
	gameId: string;
	prev: string;
	guess: string;
	guess_wins: boolean;
}
interface GuildWithGames {
	guildid: string;
	games: Guess[][];
}

let cache: GuildWithGames[] = [];

client.on(Events.MessageCreate, async (message) => {
	if (message.author.bot) return;
	if (message.content.startsWith('!guess')) {
		const content = message.content
			.split(' ')
			.filter((x) => x !== '!guess')
			.join(' ');
		if (!content) {
			message.channel.send('Please provide a guess');
			return;
		}
		//can't contain numbers
		if (content.match(/\d+/)) {
			return message.channel.send('Please provide a guess without numbers');
		}
		let guild = cache.find((x) => x.guildid === message.guildId);
		if (
			!guild ||
			guild?.games!.length === 0 ||
			!guild?.games[0][0].guess_wins
		) {
			if (!guild) {
				guild = { guildid: message.guildId||'', games: [] };
				cache.push(guild);
			}
			guild?.games.unshift([
				{ gameId: v4(), prev: 'rock', guess: '', guess_wins: false },
			]);
			const game = guild?.games[0][0] || {
				gameId: v4(),
				prev: 'rock',
				guess: '',
				guess_wins: false,
			};
			const res = await guess(game.prev, content, game.gameId);
			guild?.games[0].unshift(res);
			const embed = new EmbedBuilder()
				.setTitle(
					`**${res.guess}** ${res.guess_wins ? 'beats' : 'does not beat'} **${
						res.prev
					}**`,
				)
				.setDescription(`\n reason: ${res.reason}`)
				.setColor(res.guess_wins ? Colors.Green : Colors.Red)
				.toJSON();
			return message.channel.send({
				embeds: [embed],
			});
		}
		if (guild?.games[0][0].guess_wins) {
			const game = guild?.games[0][0];
			const res = await guess(game.guess, content, game.gameId);
			guild?.games[0].unshift(res);
			const embed = new EmbedBuilder()
				.setTitle(
					`**${res.guess}** ${res.guess_wins ? 'beats' : 'does not beat'} **${
						res.prev
					}**`,
				)
				.setDescription(`\n reason: ${res.reason}`)
				.setColor(res.guess_wins ? Colors.Green : Colors.Red)
				.toJSON();
			return message.channel.send({
				embeds: [embed],
			});
		}
	}
});

client.login(process.env.TOKEN);
client.on(Events.ClientReady, () => {
	console.log('Bot is ready');
});

setInterval(() => {
	fs.writeFileSync('./cache.json', JSON.stringify(cache));
}, 1000 * 60 * 5);
