const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const mime = require('mime-types');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Bot Configuration
const BOT_NAME = process.env.BOT_NAME || 'NASHY';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '+263733517788';
const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY || 'AIzaSyB40-cHT-AoJGsglf0cCMQXJYoeX2IGUhk';
const GOOGLE_SEARCH_ENGINE_ID =
  process.env.GOOGLE_SEARCH_ENGINE_ID || '07a153562c00a416d';
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || WHATSAPP_NUMBER; // Your WhatsApp number for testing

// Add testing mode state
let isTestingMode = false;

// Define the client options function
const getClientOptions = () => ({
  authStrategy: new LocalAuth({
    clientId: 'whatsapp-bot',
    dataPath: path.join(__dirname, '.wwebjs_auth'),
  }),
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROME_BIN || null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-default-browser-check',
      '--disable-notifications',
      '--disable-popup-blocking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-extensions-with-background-pages',
      '--disable-features=TranslateUI,BlinkGenPropertyTrees',
      '--disable-ipc-flooding-protection',
      '--disable-renderer-backgrounding',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--force-color-profile=srgb',
      '--memory-pressure-off',
      '--js-flags=--max-old-space-size=512',
      '--single-process',
      '--disable-software-rasterizer',
      '--disable-web-security', // Added for potential cross-origin issues
    ],
    defaultViewport: {
      width: 1280,
      height: 720,
    },
    ignoreHTTPSErrors: true,
    timeout: 120000, // Increased timeout
  },
  qrMaxRetries: 10,
  restartOnAuthFail: true,
  takeoverOnConflict: true,
  takeoverTimeoutMs: 30000, // Increased timeout
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});

// Initialize the first client instance
let activeClient = new Client(getClientOptions());

// Store for handling message queues
let messageQueue = [];
let isProcessingQueue = false;

// Create media directory if it doesn't exist
const mediaDir = path.join(__dirname, 'media');
try {
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
    console.log('Media directory created successfully at:', mediaDir);
  }
} catch (error) {
  console.error('Error creating media directory:', error);
}

// Function to search Google and get a response
async function searchGoogle(query) {
  try {
    const response = await axios.get(
      'https://www.googleapis.com/customsearch/v1',
      {
        params: {
          key: GOOGLE_API_KEY,
          cx: GOOGLE_SEARCH_ENGINE_ID,
          q: query,
        },
      }
    );

    if (response.data.items && response.data.items.length > 0) {
      const topResult = response.data.items[0];
      return `Here's what I found:\n\n*${topResult.title}*\n\n${topResult.snippet}\n\nSource: ${topResult.link}`;
    }
    return "I couldn't find specific information about that.";
  } catch (error) {
    if (error.response && error.response.status === 403) {
      return 'API Key error: Please make sure you have enabled the Custom Search API and your API key is correct.';
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
      timestamp: new Date().toISOString(),
    });

    const content = message.body.toLowerCase();
    const chat = await message.getChat();
    const contact = await message.getContact();

    // Mark message as read
    await chat.sendSeen();

    // Handle testing mode commands
    if (contact.number === ADMIN_NUMBER) {
      if (content === '!test on') {
        isTestingMode = true;
        await message.reply(
          '🟢 Testing mode enabled! The bot will now respond to your messages in your own chat.'
        );
        return;
      } else if (content === '!test off') {
        isTestingMode = false;
        await message.reply('🔴 Testing mode disabled!');
        return;
      } else if (content === '!test status') {
        await message.reply(
          `Testing mode is currently ${
            isTestingMode ? 'enabled 🟢' : 'disabled 🔴'
          }`
        );
        return;
      }
    }

    // Skip processing if not in testing mode and message is from self
    if (!isTestingMode && contact.number === ADMIN_NUMBER) {
      return;
    }

    // Auto-react to status messages
    if (message.from === 'status@broadcast') {
      const statusEmojis = ['❤️', '👍', '😊', '🎉', '✨', '🌟', '🙌'];
      const randomEmoji =
        statusEmojis[Math.floor(Math.random() * statusEmojis.length)];
      try {
        await message.react(randomEmoji);
        console.log('Reacted to status with:', randomEmoji);
      } catch (error) {
        console.error('Error reacting to status:', error);
      }
      return; // Exit after reacting to status
    }

    // Auto-reply for offline status
    if (!(await activeClient.getState()) === 'CONNECTED') {
      await message.reply(
        "I'm currently offline, but I'll process your message and respond shortly."
      );
      messageQueue.push(message);
      return;
    }

    // Command handler
    switch (content) {
      case 'hello':
      case 'hi':
      case 'hey':
      case 'wassup':
      case 'wadii':
      case 'ndeip':
        await message.reply(
          `Hello! I'm ${BOT_NAME}, your AI assistant. How can I help you today?`
        );
        break;

      case 'help':
        const helpMessage = `*${BOT_NAME} Commands*\n
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
- viewonce: Auto-save view once media

⚙️ Other Features:
- Auto-reply when offline
- View once media saving
- Always online status
- Auto message reactions

🔧 Admin Commands:
- !test on: Enable testing mode
- !test off: Disable testing mode
- !test status: Check testing mode status`;
        await message.reply(helpMessage);
        break;

      case 'about':
        await message.reply(
          `*About ${BOT_NAME}*\n\nI'm an AI-powered WhatsApp bot created to assist you. I can search the internet, answer questions, create stickers, and help manage groups.\n\nContact: ${WHATSAPP_NUMBER}`
        );
        break;

      case 'time':
        await message.reply(`Current time is: ${moment().format('LLLL')}`);
        break;

      case 'ping':
        await message.reply('🟢 Pong! I am active and ready to help!');
        break;

      case 'info':
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
          const profilePic = await contact.getProfilePicUrl();
          if (profilePic) {
            const media = await MessageMedia.fromUrl(profilePic);
            if (media) {
              await message.reply(media);
            } else {
              await message.reply(
                'Failed to download the profile picture. Please try again.'
              );
            }
          } else {
            await message.reply('No profile picture available!');
          }
        } catch (error) {
          console.error('Error downloading profile picture:', error);
          await message.reply(
            'Error downloading profile picture! Please try again.'
          );
        }
        break;

      case 'groupinfo':
        try {
          if (chat.isGroup) {
            const groupInfo = `
*Group Info*
Name: ${chat.name}
Description: ${chat.description || 'N/A'}
Created At: ${moment(chat.createdAt).format('LLLL')}
Participants: ${chat.participants.length}
Admin: ${chat.participants.find((p) => p.isAdmin)?.id.user || 'N/A'}
            `;
            await message.reply(groupInfo);
          } else {
            await message.reply('This command only works in groups!');
          }
        } catch (error) {
          console.error('Error getting group info:', error);
          await message.reply(
            'Error getting group information. Please try again.'
          );
        }
        break;

      case 'members':
        try {
          if (chat.isGroup) {
            const participants = chat.participants
              .map(
                (p, index) =>
                  `${index + 1}. ${p.id.user}${p.isAdmin ? ' (Admin)' : ''}`
              )
              .join('\n');
            await message.reply(`*Group Members*\n${participants}`);
          } else {
            await message.reply('This command only works in groups!');
          }
        } catch (error) {
          console.error('Error getting group members:', error);
          await message.reply('Error getting group members. Please try again.');
        }
        break;

      case 'sticker':
        try {
          if (message.hasQuotedMsg) {
            const quotedMsg = await message.getQuotedMessage();
            if (quotedMsg.hasMedia) {
              const media = await quotedMsg.downloadMedia();
              if (media) {
                await message.reply(media, message.from, {
                  sendMediaAsSticker: true,
                });
              } else {
                await message.reply(
                  'Failed to download the media. Please try again.'
                );
              }
            } else {
              await message.reply(
                'The quoted message does not contain any media.'
              );
            }
          } else if (message.hasMedia) {
            const media = await message.downloadMedia();
            if (media) {
              await message.reply(media, message.from, {
                sendMediaAsSticker: true,
              });
            } else {
              await message.reply(
                'Failed to download the media. Please try again.'
              );
            }
          } else {
            await message.reply(
              'Please reply to an image with "sticker" or send an image with caption "sticker"'
            );
          }
        } catch (error) {
          console.error('Error creating sticker:', error);
          await message.reply(
            'Sorry, there was an error creating the sticker. Please try again.'
          );
        }
        break;

      case 'everyone':
        try {
          if (chat.isGroup) {
            const mentions = chat.participants.map((participant) => {
              return `@${participant.id.user}`;
            });
            await chat.sendMessage(`Hey everyone! 👋\n${mentions.join(' ')}`, {
              mentions,
            });
          } else {
            await message.reply('This command only works in groups!');
          }
        } catch (error) {
          console.error('Error mentioning everyone:', error);
          await message.reply(
            'Error mentioning group members. Please try again.'
          );
        }
        break;

      default:
        try {
          // Handle search queries
          if (content.startsWith('search ')) {
            const query = content.slice(7);
            if (query.trim()) {
              const searchResult = await searchGoogle(query);
              await message.reply(searchResult);
            } else {
              await message.reply(
                'Please provide a search query after "search" command.'
              );
            }
          }
          // Handle questions
          else if (content.startsWith('ask ')) {
            const question = content.slice(4);
            if (question.trim()) {
              const answer = await searchGoogle(question);
              await message.reply(answer);
            } else {
              await message.reply(
                'Please provide a question after "ask" command.'
              );
            }
          }
          // Handle general messages
          else if (content.length > 0) {
            const response = await searchGoogle(content);
            await message.reply(response);
          }
        } catch (error) {
          console.error('Error processing message:', error);
          await message.reply(
            'Sorry, I encountered an error processing your request. Please try again.'
          );
        }
    }

    // Auto-react to messages
    if (process.env.AUTO_REACT === 'true') {
      try {
        const reactions = ['👍', '❤️', '��', '👏', '🎉', '✨', '🌟'];
        const randomReaction =
          reactions[Math.floor(Math.random() * reactions.length)];
        await message.react(randomReaction);
      } catch (error) {
        console.error('Error adding reaction:', error.message);
      }
    }
  } catch (error) {
    console.error('Error processing message:', error);
    try {
      await message.reply(
        'I encountered an error processing your message. Please try again later.'
      );
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}

// Keep bot always online with retry mechanism
async function setOnlinePresence() {
  try {
    if (
      activeClient.pupPage &&
      !activeClient.pupPage.isClosed() &&
      activeClient.connected
    ) {
      await activeClient.sendPresenceAvailable();
      console.log('Set presence to available');
    } else {
      console.log(
        'Browser page is closed or not connected, attempting to reconnect...'
      );
      await reconnectClient();
    }
    setTimeout(setOnlinePresence, 600000); // Refresh every 10 minutes
  } catch (error) {
    console.error('Error setting presence:', error);
    await reconnectClient();
    setTimeout(setOnlinePresence, 60000); // Retry after 1 minute
  }
}

// Enhanced reconnection function
async function reconnectClient() {
  try {
    console.log('Attempting to reconnect...');

    // Close existing page if it exists
    if (activeClient.pupPage && !activeClient.pupPage.isClosed()) {
      try {
        await activeClient.pupPage.close();
      } catch (error) {
        console.error('Error closing existing page:', error);
      }
    }

    // Initialize with retry mechanism, creating a new client instance
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 15000; // 15 seconds

    while (retryCount < maxRetries) {
      try {
        console.log(`Reconnection attempt ${retryCount + 1} of ${maxRetries}`);

        // Create a *new* Client instance with the defined options
        const newClient = new Client(getClientOptions());
        await newClient.initialize();

        // Replace the global client with the new one
        // This is crucial for event listeners and other operations to use the new instance
        activeClient = newClient;

        // Re-attach all event listeners to the new client instance
        attachClientListeners(activeClient);

        console.log('Reconnection successful');
        return;
      } catch (error) {
        retryCount++;
        console.error(`Reconnection attempt ${retryCount} failed:`, error);

        if (retryCount < maxRetries) {
          console.log(
            `Waiting ${retryDelay / 1000} seconds before next attempt...`
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw new Error('Max reconnection attempts reached');
  } catch (error) {
    console.error('Fatal reconnection failure:', error);
    setTimeout(reconnectClient, 60000); // Wait longer for next retry
  }
}

// Function to attach all event listeners
function attachClientListeners(clientInstance) {
  clientInstance.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
    try {
      fs.writeFileSync(path.join(__dirname, 'last_qr.txt'), qr);
    } catch (error) {
      console.error('Error saving QR code:', error);
    }
  });

  clientInstance.on('authenticated', () => {
    console.log('Client is authenticated!');
    try {
      const qrFile = path.join(__dirname, 'last_qr.txt');
      if (fs.existsSync(qrFile)) {
        fs.unlinkSync(qrFile);
      }
    } catch (error) {
      console.error('Error clearing QR code file:', error);
    }
    processMessageQueue();
  });

  clientInstance.on('auth_failure', (msg) => {
    console.error('AUTHENTICATION FAILED:', msg);
    // On auth failure, try to clear session and reconnect
    clearAuthFolderAndReconnect();
  });

  clientInstance.on('ready', () => {
    console.log(`${BOT_NAME} is ready and listening for messages!`);
    setOnlinePresence();
    processMessageQueue();
  });

  clientInstance.on('disconnected', async (reason) => {
    console.log('Client was disconnected:', reason);
    // Immediately try to reconnect on disconnection
    await reconnectClient();
  });

  clientInstance.on('message', async (message) => {
    // Handle view once media
    if (message.hasMedia && message.isViewOnce) {
      console.log('View once media detected:', {
        type: message.type,
        from: message.from,
        timestamp: new Date().toISOString(),
      });

      try {
        const media = await message.downloadMedia();
        console.log('Media downloaded successfully:', {
          mimetype: media.mimetype,
          size: media.data.length,
        });

        if (media) {
          const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
          const filename = `view_once_${timestamp}.${
            media.mimetype.split('/')[1]
          }`;
          const filepath = path.join(mediaDir, filename);

          const buffer = Buffer.from(media.data, 'base64');

          if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
          }

          fs.writeFileSync(filepath, buffer);
          console.log('View once media saved successfully:', {
            filename,
            filepath,
            size: buffer.length,
          });

          await message.reply(`I've saved your view once media as ${filename}`);
        } else {
          console.error('Media download returned null or undefined');
          await message.reply("Sorry, I couldn't download the media.");
        }
      } catch (error) {
        console.error('Error saving view once media:', {
          error: error.message,
          stack: error.stack,
          from: message.from,
          timestamp: new Date().toISOString(),
        });
        await message.reply(
          'Sorry, I encountered an error saving your view once media. Please try again.'
        );
      }
    }

    if (!activeClient.pupPage || !activeClient.connected) {
      // Use activeClient here
      messageQueue.push(message);
      processMessageQueue();
    } else {
      await handleMessage(message); // handleMessage uses message directly
    }
  });
}

// Function to clear auth folder and reconnect
async function clearAuthFolderAndReconnect() {
  try {
    const authFolder = path.join(__dirname, '.wwebjs_auth');
    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
      console.log('Auth folder cleared due to authentication failure');
    }
  } catch (error) {
    console.error('Error clearing auth folder on auth failure:', error);
  }
  await reconnectClient();
}

// Initial attachment of listeners to the first client instance
attachClientListeners(activeClient);

// Add connection status check - use activeClient
setInterval(async () => {
  try {
    if (
      !activeClient.pupPage ||
      activeClient.pupPage.isClosed() ||
      !activeClient.connected
    ) {
      console.log('Connection check failed: Page is closed or not connected');
      await reconnectClient();
    } else {
      console.log('Connection check passed');
    }
  } catch (error) {
    console.error('Connection check error:', error);
    await reconnectClient();
  }
}, 300000); // Check every 5 minutes

// Initialize WhatsApp client with error handling
console.log(`Starting ${BOT_NAME} initialization...`);
activeClient.initialize().catch(async (err) => {
  console.error('Failed to initialize client during initial launch:', err);
  await reconnectClient(); // Attempt reconnection if initial launch fails
});

// Express routes
app.get('/', (req, res) => {
  res.send(`${BOT_NAME} WhatsApp Bot Server is running!`);
});

// Start server with random port if 3000 is in use
const server = app
  .listen(port, () => {
    console.log(`${BOT_NAME} server is running on port ${port}`);
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is busy, trying random port...`);
      server.listen(0);
    } else {
      console.error('Server error:', err);
    }
  });
