const fs = require('fs');
const path = require('path');

console.log('🔄 Clearing WhatsApp session...');

// Clear the auth folder
const authDir = path.join(__dirname, '.wwebjs_auth');
if (fs.existsSync(authDir)) {
  try {
    fs.rmSync(authDir, { recursive: true, force: true });
    console.log('✅ Auth folder cleared successfully');
  } catch (error) {
    console.error('❌ Error clearing auth folder:', error);
  }
} else {
  console.log('ℹ️ Auth folder does not exist');
}

// Clear QR code file if it exists
const qrFile = path.join(__dirname, 'last_qr.txt');
if (fs.existsSync(qrFile)) {
  try {
    fs.unlinkSync(qrFile);
    console.log('✅ QR code file cleared');
  } catch (error) {
    console.error('❌ Error clearing QR file:', error);
  }
}

console.log('✅ Session cleared! You can now restart the bot with: node app.js');
console.log('📱 A new QR code will appear for you to scan'); 