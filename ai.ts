import {
	GoogleGenerativeAI,
	ChatSession,
	type Content,
	GenerativeModel,
	type SafetySetting,
	POSSIBLE_ROLES,
} from '@google/generative-ai';
import { v4 } from 'uuid';
import fs from 'fs';

const apikey = process.env.APIKEY || '';
const genAI = new GoogleGenerativeAI(apikey);
const safetySettings: SafetySetting[] = [];
const createChat = async (
	model: GenerativeModel,
	topK?: number,
	topP?: number,
	history?: Content[],
	maxTokens = 200,
) => {
	const obj: {
		generationConfig?: {
			maxOutputTokens: number;
		};
		history?: Content[];
		topK?: number;
		topP?: number;
	} = {};
	if (history) obj.history = history;
	if (topK) obj.topK = topK;
	if (topP && (topP > 0 || topP < 1)) obj.topP = topP;
	//if(maxTokens)obj.generationConfig = {maxOutputTokens:maxTokens};
	return model.startChat(obj);
};

const sendmessage = async (
	chat: ChatSession,
	message: string,
): Promise<string> => {
	if (message === '' || message === undefined)
		throw new Error('Message is empty');
	await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
	const result = await chat.sendMessage(message);
	const res = result.response;
	let text;
	try {
		text = res.text();
		if (text === '') return await sendmessage(chat, message);
		return text;
	} catch (e) {
		return await sendmessage(chat, message);
	}
};

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
			guess_emoji: data.guess_emoji,
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
	content?: string;
	guess_emoji?: string;
}

let history = [];

if (fs.existsSync('./history.json')) {
	history = JSON.parse(fs.readFileSync('./history.json').toString());
}

let cache: Game[][] = [];

const gemini = genAI.getGenerativeModel({
	model: 'gemini-1.5-flash',
	safetySettings,
});

const ai = await createChat(gemini);

async function run(prev: string) {
	let message = `What Thing beats ${prev}?(Not Paper or Scissors Give me "one thing or a simple sentence",and be creativity,must not contain numbers or special characters)`;
	let content = await sendmessage(ai, message);
	while (true) {
		if (content.match(/\d+/)) {
			await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
			content = await sendmessage(ai, message);
			continue;
		}
		if (content.split('\n').length > 3) {
			await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
			content = await sendmessage(ai, message);
			continue;
		}
		if (cache[0].find((x) => x.guess === content)) {
			await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
			content = await sendmessage(ai, message);
			continue;
		}
		break;
	}
	// Lowercase the content and remove all non-alphabetic characters
	content = content
		.toLowerCase()
		.replace('\n', '')
		.replace('\r', '')
		.replace(/^(a|an) /gm, '')
		.replace(/^ /, '');
	const game = cache[0][0];
	const res = await guess(game.guess, content, game.gameId);
	cache[0].unshift(res);
	console.log(
		`${game.guess} ${prev === 'rock' ? '🪨' : game.guess_emoji} vs ${content} ${
			res.guess_emoji
		} => ${res.guess_wins ? 'Win' : 'Lose'} ${
			res.cache_count === null
				? '(The First Try)'
				: `(be tried ${res.cache_count} times)`
		}`,
	);
	if (res.guess_wins) return run(res.guess);
	await fetch('https://www.whatbeatsrock.com/api/scores', {
		method: 'POST',
		body: JSON.stringify({
			gid: game.gameId,
			score: cache[0].filter((x) => x.guess_wins).length,
			initials: 'GAI',
			text: `${res.content} ${res.guess_emoji} did not beat ${cache[0][1].content} ${cache[0][1].guess_emoji}`,
		}),
	});
	return start();
}
async function start() {
	if (
		(cache.length === 0 || !cache[0][0].guess_wins) &&
		cache[0] !== undefined
	) {
		fs.writeFileSync(
			`./history/${new Date().getTime()}-game.json`,
			JSON.stringify(cache[0]),
		);
	}
	console.log(''.padEnd(20, '-'));
	console.log('Start A New Game');
	console.log(''.padEnd(20, '-'));
	cache.unshift([
		{ gameId: v4(), prev: 'rock', guess: 'rock', guess_wins: false },
	]);
	try {
		run('rock');
	} catch (e) {
		console.log(e);
		start();
	}
}
start();

function quit(history: any[]) {
	console.log('Exiting');
	if (history.length === 0 && cache.length === 0) return process.exit();
	history.push(
		cache
			.map((game) =>
				game.map((g) => [
					{
						roles: 'user',
						parts: [
							{
								text: `What Thing beats ${g.prev}?(Not Paper or Scissors Give me "one thing or a sentence",and be creativity)`,
							},
						],
					},
					{
						roles: 'model',
						parts: [
							{
								text: g.guess,
							},
						],
					},
				]),
			)
			.flat(2),
	);
	fs.writeFileSync('./history.json', JSON.stringify(history));
}

process.on('SIGINT', () => {
	quit(history);
	process.exit();
});
process.on('uncaughtException', (e) => {
	console.log(e);
	quit(history);
	start();
});
process.on('unhandledRejection', (e) => {
	console.log(e);
	quit(history);
	start();
});
