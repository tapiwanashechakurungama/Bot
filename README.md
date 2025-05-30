# Enhanced WhatsApp Bot

A feature-rich WhatsApp bot built with Node.js and Express that includes various commands and automatic features.

## Features

- 🟢 Always Online Status
- 👀 View Once Media Viewer
- 📱 Profile Picture Download
- 🖼️ Sticker Creation
- 🌍 Weather Information
- 🔄 Text Translation
- 👥 Group Management
- ⚡ Auto-Read Messages
- 💫 Auto-React to Messages
- 📊 Contact Information

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with the following content:
```env
PORT=3000
ALWAYS_ONLINE=true
AUTO_READ=true
AUTO_REACT=true
```

3. Start the server:
```bash
npm start
```

4. When you run the application for the first time, it will generate a QR code in the terminal. Scan this QR code with WhatsApp on your phone:
   - Open WhatsApp on your phone
   - Tap Menu or Settings and select WhatsApp Web
   - Point your phone to the QR code in the terminal

## Available Commands

- `hello`: Get a greeting message
- `help`: Show available commands
- `time`: Get current time
- `ping`: Check if bot is active
- `info`: Get chat info
- `download`: Download profile picture
- `groupinfo`: Get group information (in groups)
- `members`: List group members (in groups)
- `sticker`: Convert image to sticker (reply to image)
- `everyone`: Mention all group members (in groups)
- `weather [city]`: Get weather information
- `translate [text]`: Translate text to English

## Deployment on Render

1. Fork this repository
2. Create a new Web Service on Render
3. Connect your GitHub repository
4. Render will automatically detect the configuration from `render.yaml`
5. Add the following environment variables in Render:
   - `PORT`
   - `ALWAYS_ONLINE`
   - `AUTO_READ`
   - `AUTO_REACT`

## Notes

- The bot uses your WhatsApp number: +263733517788
- The server includes a health check endpoint at `/health`
- The authentication data is stored locally using the LocalAuth strategy
- Make sure you have a stable internet connection
- For weather information, you need to add your OpenWeatherMap API key

## Requirements

- Node.js >= 14.0.0
- npm
- A WhatsApp account
- Internet connection
- OpenWeatherMap API key (for weather command) 