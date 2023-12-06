## Installation

```bash
> npm i github:DikaArdnt/wajs
```

## Getting started Multidevice and Normal
```javascript
// Supports ES6
// import { Client } from 'wajs';
const { Client } = require('wajs');

const client = new Client({
   sessionName: 'session',
   playwright: {
      headless: false
   },
   // pairingNumber: '62xxx' 
});

client.on('qr', (qr) => {
   console.log('QR RECEIVED', qr);
});

/ if you login via pairing
client.on('code', (code) => {
   console.log('PAIRING CODE RECEIVED ', code);
});

client.on('ready', () => {
    console.log('READY');
});

client.on('message_create', (msg) => {
   console.log(msg);
});
```

## Configuring the Client
```javascript
const options = {
   browser: 'chromium', // browser that playwright uses to launch whatsapp web
   deviceName: false, // Set the device name connected, false to disable
   liveLocationLimit: 3, // Number of last chats to check live location after a page reload
   disableGoogleAnalytics: false, // Disable Google Analytics tracking
   googleAnalyticsId: '', // Google Analytics Id
   googleAnalyticsUserProperty: { '': '' }, // Google Analytics Id
   linkPreviewApiServers: [''], // Link Preview API servers
   poweredBy: '', // Project name for google analytics
   sendStatusToDevice: false, // Send the status to your device, set it to false to avoid WhatsApp crashing
   syncAllStatus: false, // Option to disable status sync
   playwright: {
      headless: false,
      args: ['--no-sandbox']
   }, // Playwright launch options. View docs here: https://github.com/microsoft/playwright/
   version: '', // The version of WhatsApp Web to use.
   qrMaxRetries: 2, // How many times should the qrcode be refreshed before giving up
   pairingNumber: '', // gunakan ini jika kalian tidak ingin login melalui QR, awali dengan kode negaramu
   sessioName: '', // session name for your WhatsApp web, set it to false if you don't want to save
   sessionPath: '', // folder name of your session
   takeoverOnConflict: false, // If another whatsapp web session is detected (another browser), take over the session in the current browser
   takeoverTimeoutMs: 0, // How much time to wait before taking over the session
   userAgent: '', // User agent to use in playwright.
   ffmpegPath: '' // Ffmpeg path to use when formating videos to webp while sending stickers 
}

const client = new Client(options)
```

## Basic Functions (usage)
### client
```javascript
client.destroy(); // close browser

client.logout(); // Logs out the client, closing the current session

const version = await client.getWWebVersion(); // Returns the version of WhatsApp Web currently being run
console.log(version);

client.sendSeen('62xxx@c.us'); // Mark as seen for the Chat

client.sendMessage('62xxx@c.us', 'Halo'); // Send a message to a specific chatId

const result = await client.searchMessages('hai', { page: 1, limit: 10, chatId: '' }); // Searches for messages
console.log(result);

const chats = await client.getChats(); // Get all current chat instances
console.log(chats); 

const chat = await client.getChatById('62xxx@c.us'); // Get chat instance by ID
console.log(chat);

const contacts = await client.getContacts(); // Get all current contact instances
console.log(contacts);

const chat = await client.getContactById('62xxx@c.us'); // Get contact instance by ID
console.log(chat);

const message = await client.getMessageById('false_xxx'); // Get message by id
console.log(message);

const info = await client.getInviteInfo('xxx'); // Returns an object with information about the invite code's group
console.log(info);

client.acceptInvite('xxx'); // Accepts an invitation to join a group

client.setStatus('Hello World'); // Sets the current user's status message

client.setDisplayName('Hello World'); // Sets the current user's display name.

const state = await client.getState(); // Gets the current connection state for the client
console.log(state);

client.sendPresenceAvailable(); // Marks the client as online

client.sendPresenceUnavailable(); // Marks the client as unavailable

client.archiveChat('62xxx@c.us'); // Enables and returns the archive state of the Chat

client.unarchiveChat('62xxx@c.us'); // Changes and returns the archive state of the Chat

client.pinChat('62xxx@c.us'); // Pins the Chat

client.unpinChat('62xxx@c.us'); // Unpins the Chat

client.muteChat('62xxx@c.us', ''); // Mute the Chat

client.unmuteChat('62xxx@c.us'); // Unmute the Chat

client.markChatUnread('62xxx@c.us'); // Mark the Chat as unread

const url = await client.getProfilePicUrl('62xxx@c.us'); // Returns the contact ID's profile picture URL, if privacy settings allow it
console.log(url);

const groups = await client.getCommonGroups('62xxx@c.us'); // Gets the Contact's common groups with you.
console.log(groups);

client.resetState(); // Force reset of connection state for the client

const status = await client.isRegisteredUser(); // Check if a given ID is registered in whatsapp
console.log(status);

const number = await client.getNumberId('62xxx@c.us'); // Get the registered WhatsApp ID for a number
console.log(number);

const format = await client.getFormattedNumber('62xxx@c.us'); // Get the formatted number of a WhatsApp ID
console.log(format);

const code = await client.getCountryCode('62xxx@c.us'); // Get the country code of a WhatsApp ID
console.log(code);

await client.createGroup('Hello World', ['62xxx@c.us'], options); // Creates a new group

const labels = await client.getLabels(); // Get all current Labels
```