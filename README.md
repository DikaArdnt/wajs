# Special Big Thanks To
<!-- Big thanks to. Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/pedroslopez"><img src="https://avatars.githubusercontent.com/u/4368928?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Pedro S. Lopez</b></sub></a><br /><sub><i>Author of whatsapp-web.js</i></sub></td>
    <td align="center"><a href="https://github.com/edgardmessias"><img src="https://avatars.githubusercontent.com/u/1530997?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Edgard Lorraine Messias</b></sub></a><br /><sub><i>Author of wa-js</i></sub></td>
  </tr>
</table>

# Info
This repo is the result of a recode from the [pedroslopez/whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) repo and additions from [wppconnect-team/wa-js](https://github.com/wppconnect-team/wa-js)


# wajs
A WhatsApp API client that connects through the WhatsApp Web browser app

It uses Playwright to run a real instance of Whatsapp Web to avoid getting blocked.

**NOTE:** I can't guarantee you will not be blocked by using this method, although it has worked for me. WhatsApp does not allow bots or unofficial clients on their platform, so this shouldn't be considered totally safe.

## Quick Links

* [GitHub](https://github.com/DikaArdnt/wajs)

## Installation

The module is now available on npm! `npm i github:DikaArdnt/wajs`

Please note that Node v12+ is required.

## Example usage

```js
const { Client } = require('wajs');

const client = new Client();

client.on('qr', (qr) => {
    // Generate and scan this code with your phone
    console.log('QR RECEIVED', qr);
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('message', msg => {
    if (msg.body == '!ping') {
        msg.reply('pong');
    }
});

client.initialize();
```

Take a look at [example.js](https://github.com/DikaArdnt/wajs/blob/master/example.js) for another example with more use cases.


## Supported features

| Feature  | Status |
| ------------- | ------------- |
| Multi Device  | ✅  |
| Send messages  | ✅  |
| Receive messages  | ✅  |
| Send media (images/audio/documents)  | ✅  |
| Send media (video)  | ✅ |
| Send stickers | ✅ |
| Receive media (images/audio/video/documents)  | ✅  |
| Send contact cards | ✅ |
| Send location | ✅ |
| Send status | ✅ |
| Receive location | ✅ | 
| Message replies | ✅ |
| Join groups by invite  | ✅ |
| Get invite for group  | ✅ |
| Modify group info (subject, description)  | ✅  |
| Modify group settings (send messages, edit info)  | ✅  |
| Add group participants  | ✅  |
| Kick group participants  | ✅  |
| Promote/demote group participants | ✅ |
| Mention users | ✅ |
| Mute/unmute chats | ✅ |
| Block/unblock contacts | ✅ |
| Get contact info | ✅ |
| Get profile pictures | ✅ |
| Set user status message | ✅ |
| React to messages | ✅ |

Something missing? Make an issue and let us know!

## Contributing

Pull requests are welcome! If you see something you'd like to add, please do. For drastic changes, please open an issue first.

## Supporting the project

You can support the maintainer of this project through the links below

- [Support via PayPal](https://www.paypal.me/CakHaho)
- [Sipport via Saweria](https://saweria.co/DikaArdnt)

## Disclaimer

This project is not affiliated, associated, authorized, endorsed by, or in any way officially connected with WhatsApp or any of its subsidiaries or its affiliates. The official WhatsApp website can be found at https://whatsapp.com. "WhatsApp" as well as related names, marks, emblems and images are registered trademarks of their respective owners.