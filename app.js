const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const mime = require('mime-types');
const moment = require('moment');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Bot Configuration
const BOT_NAME = process.env.BOT_NAME || 'NEICHNICE';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '+263733517788';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'AIzaSyB40-cHT-AoJGsglf0cCMQXJYoeX2IGUhk';
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID || '07a153562c00a416d';

// Initialize WhatsApp client with additional configurations
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
        defaultViewport: null,
        ignoreHTTPSErrors: true
    },
    qrMaxRetries: 5,
    restartOnAuthFail: true,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 10000
});

// Store for handling message queues
let messageQueue = [];
let isProcessingQueue = false;

// Function to search Google and get a response
async function searchGoogle(query) {
    try {
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: GOOGLE_API_KEY,
                cx: GOOGLE_SEARCH_ENGINE_ID,
                q: query
            }
        });

        if (response.data.items && response.data.items.length > 0) {
            const topResult = response.data.items[0];
            return `Here's what I found:\n\n*${topResult.title}*\n\n${topResult.snippet}\n\nSource: ${topResult.link}`;
        }
        return "I couldn't find specific information about that.";
    } catch (error) {
        if (error.response && error.response.status === 403) {
            return "API Key error: Please make sure you have enabled the Custom Search API and your API key is correct.";
        }
        console.error('Google search error:', error);
        return "I'm having trouble searching for that information right now.";
    }
}

// Process message queue
async function processMessageQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        try {
            await handleMessage(msg);
        } catch (error) {
            console.error('Error processing queued message:', error);
        }
    }
    
    isProcessingQueue = false;
}

// Main message handler
async function handleMessage(message) {
    try {
        console.log('Processing message:', {
            from: message.from,
            body: message.body,
            timestamp: new Date().toISOString()
        });

        // Mark message as read
        await message.sendSeen();
        
        const content = message.body.toLowerCase();
        const chat = await message.getChat();

        // Auto-reply for offline status
        if (!await client.getState() === 'CONNECTED') {
            await message.reply("I'm currently offline, but I'll process your message and respond shortly.");
            messageQueue.push(message);
            return;
        }

        // Command handler
        switch (content) {
            case 'hello':
            case 'hi':
            case 'hey':
                await message.reply(`Hello! I'm ${BOT_NAME}, your AI assistant. How can I help you today?`);
                break;

            case 'help':
                await message.reply(`*${BOT_NAME} Commands*\n
🤖 Basic Commands:
- hello: Get a greeting
- help: Show this help message
- about: About ${BOT_NAME}
- ping: Check if bot is active

🔍 Search & Info:
- search [query]: Search Google
- ask [question]: Ask any question
- time: Get current time
- info: Get chat info

📱 Media & Groups:
- sticker: Convert image to sticker
- download: Get profile picture
- groupinfo: Group information
- members: List group members
- everyone: Mention all members

⚙️ Other Features:
- Auto-reply when offline
- View once media saving
- Always online status
- Auto message reactions`);
                break;

            case 'about':
                await message.reply(`*About ${BOT_NAME}*\n\nI'm an AI-powered WhatsApp bot created to assist you. I can search the internet, answer questions, create stickers, and help manage groups.\n\nContact: ${WHATSAPP_NUMBER}`);
                break;

            case 'time':
                await message.reply(`Current time is: ${moment().format('LLLL')}`);
                break;

            case 'ping':
                await message.reply('🟢 Pong! I am active and ready to help!');
                break;

            case 'info':
                const contact = await message.getContact();
                await message.reply(`
*Contact Info*
Name: ${contact.name || 'N/A'}
Number: ${contact.number}
Status: ${contact.status || 'N/A'}
Is Business: ${contact.isBusiness}
Is Enterprise: ${contact.isEnterprise}
                `);
                break;

            case 'download':
                try {
                    const contact = await message.getContact();
                    const profilePic = await contact.getProfilePicUrl();
                    if (profilePic) {
                        const media = await MessageMedia.fromUrl(profilePic);
                        await message.reply(media);
                    } else {
                        await message.reply('No profile picture available!');
                    }
                } catch (error) {
                    await message.reply('Error downloading profile picture!');
                }
                break;

            case 'groupinfo':
                if (chat.isGroup) {
                    const groupInfo = `
*Group Info*
Name: ${chat.name}
Description: ${chat.description || 'N/A'}
Created At: ${moment(chat.createdAt).format('LLLL')}
Participants: ${chat.participants.length}
                    `;
                    await message.reply(groupInfo);
                } else {
                    await message.reply('This command only works in groups!');
                }
                break;

            case 'members':
                if (chat.isGroup) {
                    const participants = chat.participants.map((p, index) => 
                        `${index + 1}. ${p.id.user}`
                    ).join('\n');
                    await message.reply(`*Group Members*\n${participants}`);
                } else {
                    await message.reply('This command only works in groups!');
                }
                break;

            case 'sticker':
                if (message.hasQuotedMsg) {
                    const quotedMsg = await message.getQuotedMessage();
                    if (quotedMsg.hasMedia) {
                        const media = await quotedMsg.downloadMedia();
                        await message.reply(media, message.from, { sendMediaAsSticker: true });
                    }
                } else if (message.hasMedia) {
                    const media = await message.downloadMedia();
                    await message.reply(media, message.from, { sendMediaAsSticker: true });
                } else {
                    await message.reply('Please reply to an image with "sticker" or send an image with caption "sticker"');
                }
                break;

            case 'everyone':
                if (chat.isGroup) {
                    const mentions = chat.participants.map(participant => {
                        return `@${participant.id.user}`;
                    });
                    await chat.sendMessage(`Hey everyone! 👋\n${mentions.join(' ')}`, { mentions });
                } else {
                    await message.reply('This command only works in groups!');
                }
                break;

            default:
                // Handle search queries
                if (content.startsWith('search ')) {
                    const query = content.slice(7);
                    const searchResult = await searchGoogle(query);
                    await message.reply(searchResult);
                }
                // Handle questions
                else if (content.startsWith('ask ')) {
                    const question = content.slice(4);
                    const answer = await searchGoogle(question);
                    await message.reply(answer);
                }
                // Handle general messages
                else if (content.length > 0) {
                    const response = await searchGoogle(content);
                    await message.reply(response);
                }
        }

        // Auto-react to messages
        if (process.env.AUTO_REACT === 'true') {
            try {
                const reactions = ['👍', '❤️', '😊', '👏', '🎉', '✨', '🌟'];
                const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                await message.react(randomReaction);
            } catch (error) {
                console.error('Error adding reaction:', error.message);
            }
        }

    } catch (error) {
        console.error('Error processing message:', error);
        try {
            await message.reply("I encountered an error processing your message. Please try again later.");
        } catch (replyError) {
            console.error('Error sending error message:', replyError);
        }
    }
}

// Message event listener
client.on('message', async (message) => {
    if (!client.pupPage || !client.connected) {
        messageQueue.push(message);
        processMessageQueue();
    } else {
        await handleMessage(message);
    }
});

// Connection event handlers
client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('Client is authenticated!');
    processMessageQueue();
});

client.on('auth_failure', (msg) => {
    console.error('AUTHENTICATION FAILED:', msg);
});

client.on('ready', () => {
    console.log(`${BOT_NAME} is ready and listening for messages!`);
    setOnlinePresence();
    processMessageQueue();
});

client.on('disconnected', (reason) => {
    console.log('Client was disconnected:', reason);
});

// Reconnection handler
client.on('disconnected', async (reason) => {
    console.log('Disconnected:', reason);
    try {
        await client.initialize();
    } catch (error) {
        console.error('Failed to reconnect:', error);
    }
});

// Keep bot always online
async function setOnlinePresence() {
    try {
        await client.sendPresenceAvailable();
        console.log('Set presence to available');
        setTimeout(setOnlinePresence, 600000); // Refresh every 10 minutes
    } catch (error) {
        console.error('Error setting presence:', error);
    }
}

// Initialize WhatsApp client
console.log(`Starting ${BOT_NAME} initialization...`);
client.initialize().catch(err => {
    console.error('Failed to initialize client:', err);
});

// Express routes
app.get('/', (req, res) => {
    res.send(`${BOT_NAME} WhatsApp Bot Server is running!`);
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        botName: BOT_NAME,
        isConnected: client.connected,
        timestamp: new Date().toISOString()
    });
});

// Start server with random port if 3000 is in use
const server = app.listen(port, () => {
    console.log(`${BOT_NAME} server is running on port ${port}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is busy, trying random port...`);
        server.listen(0);
    } else {
        console.error('Server error:', err);
    }
}); 