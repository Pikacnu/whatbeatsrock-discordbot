import { v4 } from 'uuid';

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

interface Game {
	gameId: string;
	prev: string;
	guess: string;
	guess_wins: boolean;
}

let cache: Game[][] = [];

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
		if (cache.length === 0 || !cache[0][0].guess_wins) {
			cache.unshift([
				{ gameId: v4(), prev: 'rock', guess: '', guess_wins: false },
			]);
			const game = cache[0][0];
			const res = await guess(game.prev, content, game.gameId);
			cache[0].unshift(res);
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
		if (cache[0][0].guess_wins) {
			const game = cache[0][0];
			const res = await guess(game.guess, content, game.gameId);
			cache[0].unshift(res);
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
