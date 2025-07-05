// --- Robust WhatsApp Bot ---
// Enable debug logging
process.env.DEBUG = 'whatsapp-web.js*,puppeteer*';

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

// --- Bot Configuration ---
const BOT_NAME = 'NASHY';
const WHATSAPP_NUMBER =  '+263733517788';
const GOOGLE_API_KEY = 'AIzaSyB40-cHT-AoJGsglf0cCMQXJYoeX2IGUhk';
const GOOGLE_SEARCH_ENGINE_ID = '07a153562c00a416d';
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || WHATSAPP_NUMBER;

// --- Ensure Directories Exist ---
const mediaDir = path.join(__dirname, 'media');
const authDir = path.join(__dirname, '.wwebjs_auth');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

// --- Client Options ---
const getClientOptions = () => ({
  authStrategy: new LocalAuth({
    clientId: 'whatsapp-bot',
    dataPath: authDir,
  }),
  puppeteer: {
    headless: true,
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
      '--disable-web-security',
    ],
    defaultViewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    timeout: 120000,
  },
  qrMaxRetries: 10,
  restartOnAuthFail: true,
  takeoverOnConflict: true,
  takeoverTimeoutMs: 30000,
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});

// --- Main WhatsApp Client ---
let activeClient = new Client(getClientOptions());
let messageQueue = [];
let isProcessingQueue = false;
let isTestingMode = false;
let isNashyAvailable = true;

// --- Google Search Helper ---
async function searchGoogle(query) {
  try {
    console.log('Making Google search request for:', query);
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: { key: GOOGLE_API_KEY, cx: GOOGLE_SEARCH_ENGINE_ID, q: query },
    });
    
    console.log('Google API response status:', response.status);
    console.log('Google API response data keys:', Object.keys(response.data));
    
    if (response.data.items && response.data.items.length > 0) {
      const topResult = response.data.items[0];
      return `Here's what I found:\n\n*${topResult.title}*\n\n${topResult.snippet}\n\nSource: ${topResult.link}`;
    } else {
      console.log('No search results found for query:', query);
      return `I couldn't find any specific information about "${query}". Try rephrasing your question or ask something else!`;
    }
  } catch (error) {
    console.error('Google search error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
    
    if (error.response && error.response.status === 403) {
      return 'API Key error: Please make sure you have enabled the Custom Search API and your API key is correct.';
    }
    if (error.response && error.response.status === 429) {
      return 'Google search quota exceeded. Please try again later.';
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return 'Network error: Unable to connect to Google search service.';
    }
    
    return "I'm having trouble searching for that information right now. Please try again later.";
  }
}

// --- Main Message Handler (add your commands here) ---
async function handleMessage(message) {
  try {
    console.log('=== MESSAGE RECEIVED ===');
    const content = message.body.toLowerCase();
    const chat = await message.getChat();
    const contact = await message.getContact();
    console.log('Received message from:', contact.number, 'Content:', content);
    
    // Mark message as seen
    try {
      await chat.sendSeen();
      console.log('Message marked as seen');
    } catch (seenError) {
      console.error('Error marking message as seen:', seenError);
    }
    
    // Testing mode commands
    if (contact.number === ADMIN_NUMBER) {
      console.log('Message from admin, checking admin commands...');
      if (content === '!test on') { 
        isTestingMode = true; 
        await message.reply('🟢 Testing mode enabled!'); 
        console.log('Replied to admin: Testing mode enabled');
        return; 
      }
      if (content === '!test off') { 
        isTestingMode = false; 
        await message.reply('🔴 Testing mode disabled!'); 
        console.log('Replied to admin: Testing mode disabled');
        return; 
      }
      if (content === '!test status') { 
        await message.reply(`Testing mode is currently ${isTestingMode ? 'enabled 🟢' : 'disabled 🔴'}`); 
        console.log('Replied to admin: Testing mode status');
        return; 
      }
      // --- Nashy availability toggle commands ---
      if (content === '!offline') {
        isNashyAvailable = false;
        await message.reply('🔴 Nashy is now marked as unavailable.');
        console.log('Nashy set to unavailable by admin.');
        return;
      }
      if (content === '!online') {
        isNashyAvailable = true;
        await message.reply('🟢 Nashy is now marked as available.');
        console.log('Nashy set to available by admin.');
        return;
      }
      if (content === '!nashy status') {
        await message.reply(`Nashy is currently ${isNashyAvailable ? 'available 🟢' : 'not available 🔴'}`);
        console.log('Replied to admin: Nashy status');
        return;
      }
      // --- Session management commands ---
      if (content === '!clear session') {
        try {
          await message.reply('🔄 Clearing WhatsApp session... Please wait.');
          console.log('Admin requested session clear');
          
          // Close the current client
          if (activeClient.pupPage && !activeClient.pupPage.isClosed()) {
            await activeClient.pupPage.close();
          }
          
          // Clear the auth folder
          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
            console.log('Auth folder cleared');
          }
          
          await message.reply('✅ Session cleared! Restart the bot to scan QR code again.');
          console.log('Session clear completed');
          
          // Exit the process to force restart
          process.exit(0);
        } catch (error) {
          console.error('Error clearing session:', error);
          await message.reply('❌ Error clearing session. Please restart the bot manually.');
        }
        return;
      }
    }
    
    // --- If Nashy is not available, reply accordingly to non-admins ---
    if (!isNashyAvailable && contact.number !== ADMIN_NUMBER) {
      console.log('Nashy is unavailable, sending offline message');
      await message.reply('Nashy not available');
      console.log('Replied: Nashy not available (offline mode)');
      return;
    }
    
    // Add your command handlers here (hello, help, time, etc.)
    if (content === 'hello') { 
      await message.reply('Hello! I am your WhatsApp bot.'); 
      console.log('Replied: hello');
      return; 
    }
    if (content === 'help') { 
      await message.reply('Available commands: hello, help, time, ping, info, download, groupinfo, members, sticker, everyone, weather [city], translate [text]'); 
      console.log('Replied: help');
      return; 
    }
    if (content === 'time') { 
      await message.reply(`Current time: ${moment().format('YYYY-MM-DD HH:mm:ss')}`); 
      console.log('Replied: time');
      return; 
    }
    if (content === 'ping') { 
      await message.reply('Pong!'); 
      console.log('Replied: ping');
      return; 
    }
    
    // Add more commands as needed...
    console.log('No matching command for:', content);
    
    // If no command matched, search Google and reply
    console.log('Performing Google search for:', content);
    const googleResult = await searchGoogle(content);
    console.log('Google search completed, result length:', googleResult.length);
    
    try {
      await chat.sendMessage(googleResult);
      console.log('Successfully sent Google search result for:', content);
    } catch (sendError) {
      console.error('Error sending message with chat.sendMessage:', sendError);
      console.error('Send error details:', {
        message: sendError.message,
        stack: sendError.stack
      });
      // Do not attempt a fallback send to avoid duplicate replies
    }
    
    console.log('=== MESSAGE PROCESSING COMPLETED ===');
  } catch (error) {
    console.error('=== CRITICAL ERROR IN MESSAGE HANDLER ===');
    console.error('Error processing message:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    
    try {
      await message.reply('Sorry, I encountered an error processing your request. Please try again.');
      console.log('Sent error message to user');
    } catch (replyError) {
      console.error('Failed to send error message to user:', replyError);
    }
  }
}

// --- Attach All Event Listeners ---
function attachClientListeners(clientInstance) {
  clientInstance.on('qr', (qr) => {
    console.log('QR RECEIVED. Please scan with WhatsApp.');
    qrcode.generate(qr, { small: true });
    try { fs.writeFileSync(path.join(__dirname, 'last_qr.txt'), qr); } catch (error) { console.error('Error saving QR code:', error); }
  });
  clientInstance.on('authenticated', () => {
    console.log('Client is authenticated!');
    try { const qrFile = path.join(__dirname, 'last_qr.txt'); if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile); } catch (error) { console.error('Error clearing QR code file:', error); }
  });
  clientInstance.on('auth_failure', (msg) => {
    console.error('AUTHENTICATION FAILED:', msg);
    clearAuthFolderAndReconnect();
  });
  clientInstance.on('ready', () => {
    console.log(`${BOT_NAME} is ready and listening for messages!`);
  });
  clientInstance.on('disconnected', async (reason) => {
    console.log('Client was disconnected:', reason);
    await reconnectClient();
  });
  clientInstance.on('message', async (message) => {
    await handleMessage(message);
  });
}

// --- Reconnection Logic ---
async function reconnectClient() {
  try {
    console.log('=== ATTEMPTING RECONNECTION ===');
    if (activeClient.pupPage && !activeClient.pupPage.isClosed()) {
      try { 
        await activeClient.pupPage.close(); 
        console.log('Closed existing Puppeteer page');
      } catch (error) { 
        console.error('Error closing existing page:', error); 
      }
    }
    
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 15000;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`=== RECONNECTION ATTEMPT ${retryCount + 1} OF ${maxRetries} ===`);
        const newClient = new Client(getClientOptions());
        console.log('Created new client instance');
        
        await newClient.initialize();
        console.log('New client initialized successfully');
        
        activeClient = newClient;
        attachClientListeners(activeClient);
        console.log('=== RECONNECTION SUCCESSFUL ===');
        return;
      } catch (error) {
        retryCount++;
        console.error(`=== RECONNECTION ATTEMPT ${retryCount} FAILED ===`);
        console.error('Reconnection error details:', {
          message: error.message,
          stack: error.stack,
          code: error.code
        });
        
        if (retryCount < maxRetries) {
          console.log(`Waiting ${retryDelay / 1000} seconds before next attempt...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    throw new Error('Max reconnection attempts reached');
  } catch (error) {
    console.error('=== FATAL RECONNECTION FAILURE ===');
    console.error('Fatal reconnection failure:', error);
    console.error('Will retry in 60 seconds...');
    setTimeout(reconnectClient, 60000);
  }
}

// --- Clear Auth Folder and Reconnect ---
async function clearAuthFolderAndReconnect() {
  try {
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
      console.log('Auth folder cleared due to authentication failure');
    }
  } catch (error) {
    console.error('Error clearing auth folder on auth failure:', error);
  }
  await reconnectClient();
}

// --- Initial Setup ---
attachClientListeners(activeClient);
console.log(`Starting ${BOT_NAME} initialization...`);
console.log('Bot configuration:', {
  BOT_NAME,
  WHATSAPP_NUMBER,
  ADMIN_NUMBER,
  port,
  authDir,
  mediaDir
});

activeClient.initialize().catch(async (err) => {
  console.error('Failed to initialize client during initial launch:', err);
  console.error('Error details:', {
    message: err.message,
    stack: err.stack,
    code: err.code
  });
  await reconnectClient();
});

// --- Health Check and Express Route ---
app.get('/', (req, res) => {
  res.send(`${BOT_NAME} WhatsApp Bot Server is running!`);
});
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// --- Start Server ---
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

// --- Periodic Connection Check ---
setInterval(async () => {
  try {
    if (!activeClient.pupPage || activeClient.pupPage.isClosed() || !activeClient.connected) {
      console.log('Connection check failed: Page is closed or not connected');
      await reconnectClient();
    } else {
      console.log('Connection check passed');
    }
  } catch (error) {
    console.error('Connection check error:', error);
    await reconnectClient();
  }
}, 300000); // Every 5 minutes
