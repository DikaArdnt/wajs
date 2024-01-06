'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const Util = require('./Util/Util');
const InterfaceController = require('./Util/InterfaceController');
const ChatFactory = require('./Factories/ChatFactory');
const ContactFactory = require('./Factories/ContactFactory');
const { getPage } = require('./Util/Browser');
const { DefaultOptions, Events, WAState } = require('./Util/Constant');
const { GroupNotification, Message, ClientInfo, Call, MessageMedia, Location, Poll, Contact, Label, Reaction } = require('./Structures/index');

/**
 * Starting point for interacting with the WhatsApp Web API
 * @extends {EventEmitter}
 * @param {object} options - Client options
 * @param {string} options.version - The version of WhatsApp Web to use. Use options.version to configure how the version is retrieved.
 * @param {object} options.playwright - Playwright launch options. View docs here: https://github.com/microsoft/playwright/
 * @param {number} options.qrMaxRetries - How many times should the qrcode be refreshed before giving up
 * @param {string} options.sessionName - Set your browser and WhatsApp session name, default .wajs_auth
 * @param {string} options.sessionPath - folder name of your session, default session
 * @param {number} options.takeoverOnConflict - If another whatsapp web session is detected (another browser), take over the session in the current browser
 * @param {number} options.takeoverTimeoutMs - How much time to wait before taking over the session
 * @param {string} options.userAgent - User agent to use in playwright
 * @param {string} options.ffmpegPath - Ffmpeg path to use when formating videos to webp while sending stickers
 * 
 * @fires Client#qr
 * @fires Client#authenticated
 * @fires Client#ready
 * @fires Client#message
 * @fires Client#message_ack
 * @fires Client#message_create
 * @fires Client#message_revoke_me
 * @fires Client#message_revoke_everyone
 * @fires Client#message_ciphertext
 * @fires Client#media_uploaded
 * @fires Client#group_join
 * @fires Client#group_leave
 * @fires Client#group_update
 * @fires Client#disconnected
 * @fires Client#change_state
 * @fires Client#contact_changed
 * @fires Client#group_admin_changed
 * @fires Client#group_membership_request
 */
class Client extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = Util.mergeDefault(DefaultOptions, options);

        /**
         * @type {import('playwright').Browser}
         */
        this.playBrowser = null;
        /**
         * @type {import('playwright').Page}
         */
        this.playPage = null;
    }

    async initialize() {
        let { browser, page } = await getPage(this.options);

        // set User-Agent Browser
        await page.setExtraHTTPHeaders({
            'User-Agent': this.options.userAgent
        });

        this.playBrowser = browser;
        this.playPage = page;

        let qrRetries;
        await page.exposeFunction('qrChanged', async (qr) => {
            this.emit(Events.QR_RECEIVED, qr);
            if (this.options.qrMaxRetries > 0) {
                qrRetries++;
                if (qrRetries > this.options.qrMaxRetries) {
                    this.emit(Events.DISCONNECTED, 'Max qrcode retries reached');
                    await this.destroy();
                }
            }
        });

        await page.exposeFunction('EmitEvent', (event, ...data) => {
            if (event) {
                this.emit(event, ...data);
            }
        });

        // Register events
        await page.exposeFunction('onAddMessageEvent', msg => {
            if (msg.type === 'gp2') {
                const notification = new GroupNotification(this, msg);
                if (['add', 'invite', 'linked_group_join'].includes(msg.subtype)) {
                    /**
                     * Emitted when a user joins the chat via invite link or is added by an admin.
                     * @event Client#group_join
                     * @param {GroupNotification} notification GroupNotification with more information about the action
                     */
                    this.emit(Events.GROUP_JOIN, notification);
                } else if (msg.subtype === 'remove' || msg.subtype === 'leave') {
                    /**
                     * Emitted when a user leaves the chat or is removed by an admin.
                     * @event Client#group_leave
                     * @param {GroupNotification} notification GroupNotification with more information about the action
                     */
                    this.emit(Events.GROUP_LEAVE, notification);
                } else if (msg.subtype === 'promote' || msg.subtype === 'demote') {
                    /**
                     * Emitted when a current user is promoted to an admin or demoted to a regular user.
                     * @event Client#group_admin_changed
                     * @param {GroupNotification} notification GroupNotification with more information about the action
                     */
                    this.emit(Events.GROUP_ADMIN_CHANGED, notification);
                } else if (msg.subtype === 'created_membership_requests') {
                    /**
                     * Emitted when some user requested to join the group
                     * that has the membership approval mode turned on
                     * @event Client#group_membership_request
                     * @param {GroupNotification} notification GroupNotification with more information about the action
                     * @param {string} notification.chatId The group ID the request was made for
                     * @param {string} notification.author The user ID that made a request
                     * @param {number} notification.timestamp The timestamp the request was made at
                     */
                    this.emit(Events.GROUP_MEMBERSHIP_REQUEST, notification);
                } else {
                    /**
                     * Emitted when group settings are updated, such as subject, description or picture.
                     * @event Client#group_update
                     * @param {GroupNotification} notification GroupNotification with more information about the action
                     */
                    this.emit(Events.GROUP_UPDATE, notification);
                }
                return;
            }

            const message = new Message(this, msg);

            /**
             * Emitted when a new message is created, which may include the current user's own messages.
             * @event Client#message_create
             * @param {Message} message The message that was created
             */
            this.emit(Events.MESSAGE_CREATE, message);

            if (msg.id.fromMe) return;

            /**
             * Emitted when a new message is received.
             * @event Client#message
             * @param {Message} message The message that was received
             */
            this.emit(Events.MESSAGE_RECEIVED, message);
        });

        let last_message;
        await page.exposeFunction('onChangeMessageTypeEvent', (msg) => {

            if (msg.type === 'revoked') {
                const message = new Message(this, msg);
                let revoked_msg;
                if (last_message && msg.id.id === last_message.id.id) {
                    revoked_msg = new Message(this, last_message);
                }

                /**
                 * Emitted when a message is deleted for everyone in the chat.
                 * @event Client#message_revoke_everyone
                 * @param {Message} message The message that was revoked, in its current state. It will not contain the original message's data.
                 * @param {?Message} revoked_msg The message that was revoked, before it was revoked. It will contain the message's original data. 
                 * Note that due to the way this data is captured, it may be possible that this param will be undefined.
                 */
                this.emit(Events.MESSAGE_REVOKED_EVERYONE, message, revoked_msg);
            }

        });

        await page.exposeFunction('onChangeMessageEvent', (msg) => {

            if (msg.type !== 'revoked') {
                last_message = msg;
            }

            /**
             * The event notification that is received when one of
             * the group participants changes their phone number.
             */
            const isParticipant = msg.type === 'gp2' && msg.subtype === 'modify';

            /**
             * The event notification that is received when one of
             * the contacts changes their phone number.
             */
            const isContact = msg.type === 'notification_template' && msg.subtype === 'change_number';

            if (isParticipant || isContact) {
                /** @type {GroupNotification} object does not provide enough information about this event, so a @type {Message} object is used. */
                const message = new Message(this, msg);

                const newId = isParticipant ? msg.recipients[0] : msg.to;
                const oldId = isParticipant ? msg.author : msg.templateParams.find(id => id !== newId);

                /**
                 * Emitted when a contact or a group participant changes their phone number.
                 * @event Client#contact_changed
                 * @param {Message} message Message with more information about the event.
                 * @param {String} oldId The user's id (an old one) who changed their phone number
                 * and who triggered the notification.
                 * @param {String} newId The user's new id after the change.
                 * @param {Boolean} isContact Indicates if a contact or a group participant changed their phone number.
                 */
                this.emit(Events.CONTACT_CHANGED, message, oldId, newId, isContact);
            }
        });

        await page.exposeFunction('onRemoveMessageEvent', (msg) => {

            if (!msg.isNewMsg) return;

            const message = new Message(this, msg);

            /**
             * Emitted when a message is deleted by the current user.
             * @event Client#message_revoke_me
             * @param {Message} message The message that was revoked
             */
            this.emit(Events.MESSAGE_REVOKED_ME, message);

        });

        await page.exposeFunction('onMessageAckEvent', (msg, ack) => {

            const message = new Message(this, msg);

            /**
             * Emitted when an ack event occurrs on message type.
             * @event Client#message_ack
             * @param {Message} message The message that was affected
             * @param {MessageAck} ack The new ACK value
             */
            this.emit(Events.MESSAGE_ACK, message, ack);

        });

        await page.exposeFunction('onMessageMediaUploadedEvent', (msg) => {

            const message = new Message(this, msg);

            /**
             * Emitted when media has been uploaded for a message sent by the client.
             * @event Client#media_uploaded
             * @param {Message} message The message with media that was uploaded
             */
            this.emit(Events.MEDIA_UPLOADED, message);
        });

        await page.exposeFunction('onAppStateChangedEvent', async (state) => {

            /**
             * Emitted when the connection state changes
             * @event Client#change_state
             * @param {WAState} state the new connection state
             */
            this.emit(Events.STATE_CHANGED, state);

            const ACCEPTED_STATES = [WAState.CONNECTED, WAState.OPENING, WAState.PAIRING, WAState.TIMEOUT];

            if (this.options.takeoverOnConflict) {
                ACCEPTED_STATES.push(WAState.CONFLICT);

                if (state === WAState.CONFLICT) {
                    setTimeout(() => {
                        this.playPage.evaluate(() => window.WPP.whatsapp.Socket.takeover());
                    }, this.options.takeoverTimeoutMs);
                }
            }

            if (!ACCEPTED_STATES.includes(state)) {
                /**
                 * Emitted when the client has been disconnected
                 * @event Client#disconnected
                 * @param {WAState|"NAVIGATION"} reason reason that caused the disconnect
                 */
                this.emit(Events.DISCONNECTED, state);
                this.destroy();
            }
        });

        await page.exposeFunction('onIncomingCall', (call) => {
            /**
             * Emitted when a call is received
             * @event Client#incoming_call
             * @param {object} call
             * @param {number} call.id - Call id
             * @param {string} call.peerJid - Who called
             * @param {boolean} call.isVideo - if is video
             * @param {boolean} call.isGroup - if is group
             * @param {boolean} call.canHandleLocally - if we can handle in waweb
             * @param {boolean} call.outgoing - if is outgoing
             * @param {boolean} call.webClientShouldHandle - If Waweb should handle
             * @param {object} call.participants - Participants
             */
            const cll = new Call(this, call);
            this.emit(Events.INCOMING_CALL, cll);
        });

        await page.exposeFunction('onChatUnreadCountEvent', async (data) => {
            const chat = await this.getChatById(data.id);

            /**
             * Emitted when the chat unread count changes
             */
            this.emit(Events.UNREAD_COUNT, chat);
        });

        await page.exposeFunction('onReaction', (reactions) => {
            for (const reaction of reactions) {
                /**
                 * Emitted when a reaction is sent, received, updated or removed
                 * @event Client#message_reaction
                 * @param {object} reaction
                 * @param {object} reaction.id - Reaction id
                 * @param {number} reaction.orphan - Orphan
                 * @param {?string} reaction.orphanReason - Orphan reason
                 * @param {number} reaction.timestamp - Timestamp
                 * @param {string} reaction.reaction - Reaction
                 * @param {boolean} reaction.read - Read
                 * @param {object} reaction.msgId - Parent message id
                 * @param {string} reaction.senderId - Sender id
                 */

                this.emit(Events.MESSAGE_REACTION, new Reaction(this, reaction));
            }
        });

        await page.exposeFunction('onRemoveChatEvent', async (chat) => {
            const _chat = await this.getChatById(chat.id);

            /**
             * Emitted when a chat is removed
             * @event Client#chat_removed
             * @param {Chat} chat
             */
            this.emit(Events.CHAT_REMOVED, _chat);
        });

        await page.exposeFunction('onArchiveChatEvent', async (chat, currState, prevState) => {
            const _chat = await this.getChatById(chat.id);

            /**
             * Emitted when a chat is archived/unarchived
             * @event Client#chat_archived
             * @param {Chat} chat
             * @param {boolean} currState
             * @param {boolean} prevState
             */
            this.emit(Events.CHAT_ARCHIVED, _chat, currState, prevState);
        });

        await page.exposeFunction('log', (data) => console.log(data));

        const isRegistered = await this.playPage.evaluate(() => window.WPP.conn.isRegistered());

        if (isRegistered === false) {
            await this.playPage.evaluate(({ CODE_RECEIVED, pairingNumber }) => {
                window.WPP.on('conn.auth_code_change', async (auth) => {
                    if (pairingNumber) {
                        const code = await window.WPP.conn.genLinkDeviceCodeForPhoneNumber(pairingNumber);
                        window.EmitEvent(CODE_RECEIVED, code);
                    } else {
                        window.qrChanged(auth.fullCode + ',1');
                    }
                });
            }, { CODE_RECEIVED: Events.CODE_RECEIVED, pairingNumber: this.options.pairingNumber });
        }

        if (isRegistered === null) {
            await this.playPage.evaluate((Events) => {
                const streamStatus = window.WPP?.whatsapp?.Stream?.displayInfo;
                window.EmitEvent(Events.AUTHENTICATION_FAILURE, streamStatus);
            }, Events);
        }

        await this.playPage.waitForFunction(() => window.WPP.conn.isRegistered());

        await this.playPage.evaluate((Events) => {
            const streamStatus = window.WPP?.whatsapp?.Stream?.displayInfo;
            window.EmitEvent(Events.AUTHENTICATED, streamStatus);

            window.WPP.on('conn.main_loaded', () => {
                const info = window.WPP.conn.getHistorySyncProgress();
                if (info.inProgress) {
                    window.EmitEvent(Events.LOADING_SCREEN, info.progress, info.progress + '% Organizing your messages');
                } else {
                    window.EmitEvent(Events.LOADING_SCREEN, '', 'Loading Your Chats');
                }
            });
            window.WPP.on('conn.main_ready', () => window.EmitEvent(Events.READY));

            window.WPP.whatsapp.MsgStore.on('change', (msg) => { window.onChangeMessageEvent(window.WAJS.getMessageModel(msg)); });
            window.WPP.whatsapp.MsgStore.on('change:type', (msg) => { window.onChangeMessageTypeEvent(window.WAJS.getMessageModel(msg)); });
            window.WPP.whatsapp.MsgStore.on('change:ack', (msg, ack) => { window.onMessageAckEvent(window.WAJS.getMessageModel(msg), ack); });
            window.WPP.whatsapp.MsgStore.on('change:isUnsentMedia', (msg, unsent) => { if (msg.id.fromMe && !unsent) window.onMessageMediaUploadedEvent(window.WAJS.getMessageModel(msg)); });
            window.WPP.whatsapp.MsgStore.on('remove', (msg) => { if (msg.isNewMsg) window.onRemoveMessageEvent(window.WAJS.getMessageModel(msg)); });
            window.WPP.whatsapp.MsgStore.on('change:body change:caption', (msg, newBody, prevBody) => { window.onAddMessageEvent(window.WAJS.getMessageModel(msg), newBody, prevBody); });
            window.WPP.whatsapp.Socket.on('change:state', (_AppState, state) => { window.onAppStateChangedEvent(state); });
            window.WPP.whatsapp.CallStore.on('add', (call) => { window.onIncomingCall(call); });
            window.WPP.whatsapp.ChatStore.on('remove', async (chat) => { window.onRemoveChatEvent(await window.WAJS.getChatModel(chat)); });
            window.WPP.whatsapp.ChatStore.on('change:archive', async (chat, currState, prevState) => { window.onArchiveChatEvent(await window.WAJS.getChatModel(chat), currState, prevState); });
            window.WPP.on('chat.new_message', (msg) => {
                if (msg.isNewMsg) {
                    if (msg.type === 'ciphertext') {
                        // defer message event until ciphertext is resolved (type changed)
                        msg.once('change:type', (_msg) => window.onAddMessageEvent(window.WAJS.getMessageModel(_msg)));
                        window.EmitEvent(Events.MESSAGE_CIPHERTEXT, window.WWebJS.getMessageModel(msg));
                    } else {
                        window.onAddMessageEvent(window.WAJS.getMessageModel(msg));
                    }
                }
            });
            window.WPP.whatsapp.ChatStore.on('change:unreadCount', async (chat) => { window.onChatUnreadCountEvent(await window.WAJS.getChatModel(chat)); });

            window.WPP.on('chat.new_reaction', (reaction) => {
                window.onReaction([reaction]);
            });
        }, Events);

        await this.playPage.evaluate((Events) => {
            window.WPP.whatsapp.Cmd.on('logout', () => window.EmitEvent(Events.DISCONNECTED, 'NAVIGATION'));
        }, Events);

        // Expose client info
        /**
         * Current connection information
         * @type {ClientInfo}
         */
        this.info = new ClientInfo(this, await page.evaluate(() => {
            const pushname = window.WPP.whatsapp.Conn.pushname;
            const platform = window.WPP.whatsapp.Conn.platform;
            return { pushname, platform, wid: window.WPP.whatsapp.UserPrefs.getMeUser() };
        }));

        // Add InterfaceController
        this.interface = new InterfaceController(this);
    }

    async destroy() {
        await this.playBrowser.close();
    }

    /**
      * Logs out the client, closing the current session
      */
    async logout() {
        await this.playPage.evaluate(async () => {
            return await window.WPP.conn.logout();
        });
        await this.playBrowser.close();

        await Util.sleep(1000);

        const sessionDir = path.join(this.options.sessionPath, this.options.sessionName);
        if (fs.existsSync(sessionDir)) {
            (fs.rmSync ? fs.rmSync : fs.rmdirSync).call(this, sessionDir, { recursive: true, force: true });
        }
    }

    /**
     * Returns the version of WhatsApp Web currently being run
     * @returns {Promise<string>}
     */
    async getWWebVersion() {
        return await this.playPage.evaluate(() => {
            return window.Debug.VERSION;
        });
    }

    /**
     * Mark as seen for the Chat
     *  @param {string} chatId
     *  @param {string} msgId 
     *  @returns {Promise<boolean>} result
     * 
     */
    async sendSeen(chatId, msgId) {
        if (msgId && !msgId.includes('status@broadcast')) throw 'use the message id from status';
        if (msgId && !msgId.includes(chatId)) throw 'chatId has no match in msgId';

        const result = await this.playPage.evaluate(async ({ chatId, msgId }) => {
            if (msgId) return window.WPP.status.sendReadStatus(chatId, msgId);
            return await window.WPP.chat.markIsRead(chatId);
        }, { chatId, msgId });
        return result;
    }

    /**
     * Message options.
     * @typedef {Object} MessageSendOptions
     * @property {boolean} [linkPreview=true] - Show links preview. Has no effect on multi-device accounts.
     * @property {boolean} [sendAudioAsVoice=false] - Send audio as voice message with a generated waveform
     * @property {boolean} [sendVideoAsGif=false] - Send video as gif
     * @property {boolean} [sendMediaAsSticker=false] - Send media as a sticker
     * @property {boolean} [sendMediaAsDocument=false] - Send media as a document
     * @property {boolean} [isViewOnce=false] - Send photo/video as a view once message
     * @property {boolean} [parseVCards=true] - Automatically parse vCards and send them as contacts
     * @property {string} [caption] - Image or video caption
     * @property {string} [quotedMessageId] - Id of the message that is being quoted (or replied to)
     * @property {Contact[]} [mentions] - Contacts that are being mentioned in the message
     * @property {boolean} [sendSeen=true] - Mark the conversation as seen after sending the message
     * @property {string} [stickerAuthor=undefined] - Sets the author of the sticker, (if sendMediaAsSticker is true).
     * @property {string} [stickerName=undefined] - Sets the name of the sticker, (if sendMediaAsSticker is true).
     * @property {string[]} [stickerCategories=undefined] - Sets the categories of the sticker, (if sendMediaAsSticker is true). Provide emoji char array, can be null.
     * @property {string} [stickerIsAvatar=false] - Sets sticker as avatar, (if sendMediaAsSticker is true)
     * @property {MessageMedia} [media] - Media to be sent
     */

    /**
     * Send a message to a specific chatId
     * @param {string} chatId
     * @param {string|MessageMedia|Location|Poll|Contact|Array<Contact>} content
     * @param {MessageSendOptions} [options] - Options used when sending the message
     * 
     * @returns {Promise<Message>} Message that was just sent
     */
    async sendMessage(chatId, content, options = {}) {
        let internalOptions = {
            linkPreview: options.linkPreview === false ? undefined : true,
            sendAudioAsVoice: options.sendAudioAsVoice,
            sendVideoAsGif: options.sendVideoAsGif,
            sendMediaAsSticker: options.sendMediaAsSticker,
            sendMediaAsDocument: options.sendMediaAsDocument,
            caption: options.caption,
            quotedMessageId: options.quotedMessageId,
            parseVCards: options.parseVCards === false ? false : true,
            mentionedJidList: Array.isArray(options.mentions) ? options.mentions.map(v => typeof v === 'object' ? v.id._serialized : v) : [],
            extraOptions: options.extra,
            messageId: options.messageId
        };

        const sendSeen = typeof options.sendSeen === 'undefined' ? true : options.sendSeen;

        if (content instanceof MessageMedia) {
            internalOptions.attachment = content;
            internalOptions.isViewOnce = options.isViewOnce,
            content = '';
        } else if (options.media instanceof MessageMedia) {
            internalOptions.attachment = options.media;
            internalOptions.caption = content;
            internalOptions.isViewOnce = options.isViewOnce,
            content = '';
        } else if (content instanceof Location) {
            internalOptions.location = content;
            content = '';
        } else if (content instanceof Poll) {
            internalOptions.poll = content;
            content = '';
        } else if (content instanceof Contact) {
            internalOptions.contactCard = content.id._serialized;
            content = '';
        } else if (Array.isArray(content) && content.length > 0 && content[0] instanceof Contact) {
            internalOptions.contactCardList = content.map(contact => contact.id._serialized);
            content = '';
        }

        if (internalOptions.sendMediaAsSticker && internalOptions.attachment) {
            internalOptions.attachment = await Util.formatToWebpSticker(
                internalOptions.attachment, {
                    name: options.stickerName,
                    author: options.stickerAuthor,
                    categories: options.stickerCategories,
                    isAvatarSticker: options.stickerIsAvatar,
                }, this.playPage
            );
        }

        const newMessage = await this.playPage.evaluate(async ({ chatId, message, options, sendSeen }) => {
            if (chatId === 'status@broadcast') {
                if (typeof message === 'string') {
                    const result = await window.WPP.status.sendTextStatus(message, options);
                    return await (await window.WPP.whatsapp.MsgStore.get(result.id)).serialize();
                } else if (/image/.test(message.mimetype)) {
                    const result = await window.WPP.status.sendImageStatus(`data:${message.mimetype};base64,${message.data}`, options);
                    return await (await window.WPP.whatsapp.MsgStore.get(result.id)).serialize();
                } else if (/video/.test(message.mimetype)) {
                    const result = await window.WPP.status.sendVideoStatus(`data:${message.mimetype};base64,${message.data}`, options);
                    return await (await window.WPP.whatsapp.MsgStore.get(result.id)).serialize();
                } else {
                    throw new Error('Invalid type for status broadcast');
                }
            } else {
                const chatWid = window.WPP.whatsapp.WidFactory.createWid(chatId);
                const chat = await window.WPP.whatsapp.ChatStore.find(chatWid);


                if (sendSeen) {
                    await window.WPP.whatsapp.functions.sendSeen(chat, false);
                }

                const msg = await window.WAJS.sendMessage(chat, message, options, sendSeen);
                return msg.serialize();
            }
        }, { chatId, message: content, options: internalOptions, sendSeen });

        return new Message(this, newMessage);
    }

    /**
     * Searches for messages
     * @param {string} query
     * @param {Object} [options]
     * @param {number} [options.page]
     * @param {number} [options.limit]
     * @param {string} [options.chatId]
     * @returns {Promise<Message[]>}
     */
    async searchMessages(query, options = {}) {
        const messages = await this.playPage.evaluate(async ({ query, page, count, remote }) => {
            const { messages } = await window.WPP.whatsapp.MsgStore.search(query, page, count, remote);
            return messages.map(msg => window.WAJS.getMessageModel(msg));
        }, { query, page: options.page, count: options.limit, remote: options.chatId });

        return messages.map(msg => new Message(this, msg));
    }

    /**
     * Get all current chat instances
     * @returns {Promise<Array<Chat>>}
     */
    async getChats() {
        let chats = await this.playPage.evaluate(async () => {
            return await window.WAJS.getChats();
        });

        return chats.map(chat => ChatFactory.create(this, chat));
    }

    /**
      * Get chat instance by ID
      * @param {string} chatId 
      * @returns {Promise<Chat>}
      */
    async getChatById(chatId) {
        let chat = await this.playPage.evaluate(async chatId => {
            const chat = await window.WPP.chat.get(chatId);
            return await window.WAJS.getChatModel(chat);
        }, chatId);

        return ChatFactory.create(this, chat);
    }

    /**
     * Get all current contact instances
     * @returns {Promise<Array<Contact>>}
     */
    async getContacts() {
        let contacts = await this.playPage.evaluate(() => {
            return window.WAJS.getContacts();
        });

        return contacts.map(contact => ContactFactory.create(this, contact));
    }

    /**
     * Get contact instance by ID
     * @param {string} contactId
     * @returns {Promise<Contact>}
     */
    async getContactById(contactId) {
        let contact = await this.playPage.evaluate(async contactId => {
            const chat = await window.WPP.contact.get(contactId);
            return window.WAJS.getContactModel(chat);
        }, contactId);

        return ContactFactory.create(this, contact);
    }

    async getMessageById(messageId) {
        const msg = await this.playPage.evaluate(async messageId => {
            const msg = await window.WPP.chat.getMessageById(messageId);
            return window.WAJS.getMessageModel(msg);
        }, messageId);

        if (msg) return new Message(this, msg);
        return null;
    }

    /**
     * Returns an object with information about the invite code's group
     * @param {string} inviteCode 
     * @returns {Promise<object>} Invite information
     */
    async getInviteInfo(inviteCode) {
        return await this.playPage.evaluate(async inviteCode => {
            return await window.WPP.group.getGroupInfoFromInviteCode(inviteCode);
        }, inviteCode);
    }

    /**
     * Accepts an invitation to join a group
     * @param {string} inviteCode Invitation code
     * @returns {Promise<string>} Id of the joined Chat
     */
    async acceptInvite(inviteCode) {
        const res = await this.playPage.evaluate(async inviteCode => {
            return await window.WPP.group.join(inviteCode);
        }, inviteCode);

        return res.gid._serialized;
    }

    /**
     * Sets the current user's status message
     * @param {string} status New status message
     */
    async setStatus(status) {
        await this.playPage.evaluate(async status => {
            return await window.WPP.profile.setMyStatus(status);
        }, status);
    }

    /**
     * Sets the current user's display name. 
     * This is the name shown to WhatsApp users that have not added you as a contact beside your number in groups and in your profile.
     * @param {string} displayName New display name
     * @returns {Promise<Boolean>}
     */
    async setDisplayName(displayName) {
        const couldSet = await this.playPage.evaluate(async displayName => {
            return await window.WPP.profile.setMyProfileName(displayName);
        }, displayName);

        return couldSet;
    }

    /**
      * Gets the current connection state for the client
      * @returns {WAState} 
      */
    async getState() {
        return await this.playPage.evaluate(() => {
            return window.WPP.whatsapp.Socket.state;
        });
    }

    /**
     * Marks the client as online
     */
    async sendPresenceAvailable() {
        return await this.playPage.evaluate(() => {
            return window.WPP.whatsapp.ChatPresence.sendPresenceAvailable();
        });
    }

    /**
     * Marks the client as unavailable
     */
    async sendPresenceUnavailable() {
        return await this.playPage.evaluate(() => {
            return window.WPP.whatsapp.ChatPresence.sendPresenceUnavailable();
        });
    }

    /**
     * Enables and returns the archive state of the Chat
     * @returns {boolean}
     */
    async archiveChat(chatId) {
        return await this.playPage.evaluate(async chatId => {
            await window.WPP.chat.archive(chatId);
            return true;
        }, chatId);
    }

    /**
     * Changes and returns the archive state of the Chat
     * @returns {boolean}
     */
    async unarchiveChat(chatId) {
        return await this.playPage.evaluate(async chatId => {
            await window.WPP.chat.unarchive(chatId);
            return false;
        }, chatId);
    }

    /**
     * Pins the Chat
     * @returns {Promise<boolean>} New pin state. Could be false if the max number of pinned chats was reached.
     */
    async pinChat(chatId) {
        return this.playPage.evaluate(async chatId => {
            const MAX_PIN_COUNT = 3;
            const chatModels = window.WPP.whatsapp.ChatStore.getModelsArray();
            if (chatModels.length > MAX_PIN_COUNT) {
                let maxPinned = chatModels[MAX_PIN_COUNT - 1].pin;
                if (maxPinned) {
                    return false;
                }
            }
            await window.WPP.chat.pin(chatId);
            return true;
        }, chatId);
    }

    /**
     * Unpins the Chat
     * @returns {Promise<boolean>} New pin state
     */
    async unpinChat(chatId) {
        return this.playPage.evaluate(async chatId => {
            await window.WPP.chat.unpin(chatId);
            return false;
        }, chatId);
    }

    /**
     * Mutes this chat forever, unless a date is specified
     * @param {string} chatId ID of the chat that will be muted
     * @param {?Date} unmuteDate Date when the chat will be unmuted, leave as is to mute forever
     */
    async muteChat(chatId, unmuteDate) {
        unmuteDate = unmuteDate ? unmuteDate.getTime() / 1000 : -1;
        await this.playPage.evaluate(async ({ chatId, timestamp }) => {
            await window.WPP.chat.mute(chatId, { expiration: timestamp });
        }, { chatId, timestamp: unmuteDate || -1 });
    }

    /**
     * Unmutes the Chat
     * @param {string} chatId ID of the chat that will be unmuted
     */
    async unmuteChat(chatId) {
        await this.playPage.evaluate(async chatId => {
            await window.WPP.chat.unmute(chatId);
        }, chatId);
    }

    /**
    * Mark the Chat as unread
    * @param {string} chatId ID of the chat that will be marked as unread
    */
    async markChatUnread(chatId) {
        await this.playPage.evaluate(async chatId => {
            await window.WPP.chat.markIsUnread(chatId);
        }, chatId);
    }

    /**
     * Returns the contact ID's profile picture URL, if privacy settings allow it
     * @param {string} contactId the whatsapp user's ID
     * @returns {Promise<string>}
     */
    async getProfilePicUrl(contactId) {
        const profilePic = await this.playPage.evaluate(async contactId => {
            return await window.WPP.contact.getProfilePictureUrl(contactId);
        }, contactId);

        return profilePic ? profilePic : undefined;
    }

    /**
     * Gets the Contact's common groups with you. Returns empty array if you don't have any common group.
     * @param {string} contactId the whatsapp user's ID (_serialized format)
     * @returns {Promise<WAWebJS.ChatId[]>}
     */
    async getCommonGroups(contactId) {
        const commonGroups = await this.playPage.evaluate(async (contactId) => {
            let contact = window.WPP.whatsapp.ContactStore.get(contactId);
            if (!contact) {
                const wid = window.WPP.whatsapp.WidFactory.createUserWid(contactId);
                const chatConstructor = window.WPP.whatsapp.ContactStore.getModelsArray().find(c => !c.isGroup).constructor;
                contact = new chatConstructor({ id: wid });
            }

            if (contact.commonGroups) {
                return contact.commonGroups.serialize();
            }
            const status = await window.WPP.whatsapp.functions.findCommonGroups(contact);
            if (status) {
                return contact.commonGroups.serialize();
            }
            return [];
        }, contactId);
        const chats = [];
        for (const group of commonGroups) {
            chats.push(group.id);
        }
        return chats;
    }

    /**
     * Force reset of connection state for the client
    */
    async resetState() {
        await this.playPage.evaluate(() => {
            window.WPP.whatsapp.Socket.phoneWatchdog.shiftTimer.forceRunNow();
        });
    }

    /**
     * Check if a given ID is registered in whatsapp
     * @param {string} id the whatsapp user's ID
     * @returns {Promise<Boolean>}
     */
    async isRegisteredUser(id) {
        return Boolean(await this.getNumberId(id));
    }

    /**
     * Get the registered WhatsApp ID for a number. 
     * Will return null if the number is not registered on WhatsApp.
     * @param {string} number Number or ID ("@c.us" will be automatically appended if not specified)
     * @returns {Promise<Object|null>}
     */
    async getNumberId(number) {
        if (!number.endsWith('@c.us')) {
            number += '@c.us';
        }

        return await this.playPage.evaluate(async number => {
            const result = await window.WPP.contact.queryExists(number);
            if (!result || result.wid === undefined) return null;
            return result.wid;
        }, number);
    }

    /**
     * Get the formatted number of a WhatsApp ID.
     * @param {string} number Number or ID
     * @returns {Promise<string>}
     */
    async getFormattedNumber(number) {
        if (!number.endsWith('@s.whatsapp.net')) number = number.replace('c.us', 's.whatsapp.net');
        if (!number.includes('@s.whatsapp.net')) number = `${number}@s.whatsapp.net`;

        return await this.playPage.evaluate(async numberId => {
            return window.Store.NumberInfo.formattedPhoneNumber(numberId);
        }, number);
    }

    /**
     * Get the country code of a WhatsApp ID.
     * @param {string} number Number or ID
     * @returns {Promise<string>}
     */
    async getCountryCode(number) {
        number = number.replace(' ', '').replace('+', '').replace('@c.us', '');

        return await this.playPage.evaluate(async numberId => {
            return window.Store.NumberInfo.findCC(numberId);
        }, number);
    }

    /**
     * An object that represents the result for a participant added to a group
     * @typedef {Object} ParticipantResult
     * @property {number} statusCode The status code of the result
     * @property {string} message The result message
     * @property {boolean} isGroupCreator Indicates if the participant is a group creator
     * @property {boolean} isInviteV4Sent Indicates if the inviteV4 was sent to the participant
     */

    /**
     * An object that handles the result for {@link createGroup} method
     * @typedef {Object} CreateGroupResult
     * @property {string} title A group title
     * @property {Object} gid An object that handles the newly created group ID
     * @property {string} gid.server
     * @property {string} gid.user
     * @property {string} gid._serialized
     * @property {Object.<string, ParticipantResult>} participants An object that handles the result value for each added to the group participant
     */

    /**
     * An object that handles options for group creation
     * @typedef {Object} CreateGroupOptions
     * @property {number} [messageTimer = 0] The number of seconds for the messages to disappear in the group (0 by default, won't take an effect if the group is been creating with myself only)
     * @property {string|undefined} parentGroupId The ID of a parent community group to link the newly created group with (won't take an effect if the group is been creating with myself only)
     * @property {boolean} [autoSendInviteV4 = true] If true, the inviteV4 will be sent to those participants who have restricted others from being automatically added to groups, otherwise the inviteV4 won't be sent (true by default)
     * @property {string} [comment = ''] The comment to be added to an inviteV4 (empty string by default)
     */

    /**
     * Creates a new group
     * @param {string} title Group title
     * @param {string|Contact|Array<Contact|string>|undefined} participants A single Contact object or an ID as a string or an array of Contact objects or contact IDs to add to the group
     * @param {CreateGroupOptions} options An object that handles options for group creation
     * @returns {Promise<CreateGroupResult|string>} Object with resulting data or an error message as a string
     */
    async createGroup(title, participants = [], options = {}) {
        !Array.isArray(participants) && (participants = [participants]);
        participants.map(p => (p instanceof Contact) ? p.id._serialized : p);

        return await this.playPage.evaluate(async ({ title, participants, options }) => {
            const { messageTimer = 0, parentGroupId, autoSendInviteV4 = true, comment = '' } = options;
            const participantData = {}, participantWids = [], failedParticipants = [];
            let createGroupResult, parentGroupWid;

            const addParticipantResultCodes = {
                default: 'An unknown error occupied while adding a participant',
                200: 'The participant was added successfully',
                403: 'The participant can be added by sending private invitation only',
                404: 'The phone number is not registered on WhatsApp'
            };

            for (const participant of participants) {
                const pWid = window.WPP.whatsapp.WidFactory.createWid(participant);
                if ((await window.window.WPP.contact.queryExists(pWid))?.wid) participantWids.push(pWid);
                else failedParticipants.push(participant);
            }

            parentGroupId && (parentGroupWid = window.WPP.whatsapp.WidFactory.createWid(parentGroupId));

            try {
                createGroupResult = await window.WPP.whatsapp.functions.sendCreateGroup(
                    title,
                    participantWids,
                    messageTimer,
                    parentGroupWid
                );
            } catch (err) {
                return 'CreateGroupError: An unknown error occupied while creating a group';
            }

            for (const participant of createGroupResult.participants) {
                let isInviteV4Sent = false;
                const participantId = participant.wid._serialized;
                const statusCode = participant.error ?? 200;

                if (autoSendInviteV4 && statusCode === 403) {
                    await Util.sleep(2500);
                    await window.WPP.chat.sendGroupInviteMessage(participantId, {
                        inviteCode: participant.invite_code,
                        inviteCodeExpiration: participant.invite_code_exp,
                        groupId: createGroupResult.wid._serialized,
                        caption: comment
                    });
                    isInviteV4Sent = true;
                }

                participantData[participantId] = {
                    statusCode: statusCode,
                    message: addParticipantResultCodes[statusCode] || addParticipantResultCodes.default,
                    isGroupCreator: participant.type === 'superadmin',
                    isInviteV4Sent: isInviteV4Sent
                };
            }

            for (const f of failedParticipants) {
                participantData[f] = {
                    statusCode: 404,
                    message: addParticipantResultCodes[404],
                    isGroupCreator: false,
                    isInviteV4Sent: false
                };
            }

            return { title: title, gid: createGroupResult.wid, participants: participantData };
        }, { title, participants, options });
    }

    /**
     * Get all current Labels
     * @returns {Promise<Array<Label>>}
     */
    async getLabels() {
        const labels = await this.playPage.evaluate(async () => {
            return window.WAJS.getLabels();
        });

        return labels.map(data => new Label(this, data));
    }

    /**
     * Get Label instance by ID
     * @param {string} labelId
     * @returns {Promise<Label>}
     */
    async getLabelById(labelId) {
        const label = await this.playPage.evaluate(async (labelId) => {
            return window.WAJS.getLabel(labelId);
        }, labelId);

        return new Label(this, label);
    }

    /**
     * Get all Labels assigned to a chat 
     * @param {string} chatId
     * @returns {Promise<Array<Label>>}
     */
    async getChatLabels(chatId) {
        const labels = await this.playPage.evaluate(async (chatId) => {
            return window.WAJS.getChatLabels(chatId);
        }, chatId);

        return labels.map(data => new Label(this, data));
    }

    /**
     * Get all Chats for a specific Label
     * @param {string} labelId
     * @returns {Promise<Array<Chat>>}
     */
    async getChatsByLabelId(labelId) {
        const chatIds = await this.playPage.evaluate(async (labelId) => {
            const label = window.WPP.whatsapp.LabelStore.get(labelId);
            const labelItems = label.labelItemCollection.getModelsArray();
            return labelItems.reduce((result, item) => {
                if (item.parentType === 'Chat') {
                    result.push(item.parentId);
                }
                return result;
            }, []);
        }, labelId);

        return Promise.all(chatIds.map(id => this.getChatById(id)));
    }

    /**
     * Gets all blocked contacts by host account
     * @returns {Promise<Array<Contact>>}
     */
    async getBlockedContacts() {
        const blockedContacts = await this.playPage.evaluate(() => {
            let chatIds = window.WPP.whatsapp.BlocklistStore.getModelsArray().map(a => a.id._serialized);
            return Promise.all(chatIds.map(id => window.WAJS.getContact(id)));
        });

        return blockedContacts.map(contact => ContactFactory.create(this.client, contact));
    }

    /**
     * Sets the current user's profile picture.
     * @param {MessageMedia} media
     * @returns {Promise<boolean>} Returns true if the picture was properly updated.
     */
    async setProfilePicture(media) {
        const success = await this.playPage.evaluate(({ chatid, media }) => {
            return window.WAJS.setPicture(chatid, media);
        }, { chatId: this.info.wid._serialized, media });

        return success;
    }

    /**
     * Deletes the current user's profile picture.
     * @returns {Promise<boolean>} Returns true if the picture was properly deleted.
     */
    async deleteProfilePicture() {
        const success = await this.playPage.evaluate((chatid) => {
            const chat = window.WPP.whatsapp.WidFactory.createWid(chatid);
            return window.WPP.whatsapp.functions.requestDeletePicture(chat);
        }, this.info.wid._serialized);

        return success;
    }

    /**
     * Change labels in chats
     * @param {Array<number|string>} labelIds
     * @param {Array<string>} chatIds
     * @returns {Promise<void>}
     */
    async addOrRemoveLabels(labelIds, chatIds) {

        return this.playPage.evaluate(async ({ labelIds, chatIds }) => {
            return await window.WPP.labels.addOrRemoveLabels(chatIds, labelIds);
        }, { labelIds, chatIds });
    }

    /**
     * An object that handles the information about the group membership request
     * @typedef {Object} GroupMembershipRequest
     * @property {Object} id The wid of a user who requests to enter the group
     * @property {Object} addedBy The wid of a user who created that request
     * @property {Object|null} parentGroupId The wid of a community parent group to which the current group is linked
     * @property {string} requestMethod The method used to create the request: NonAdminAdd/InviteLink/LinkedGroupJoin
     * @property {number} t The timestamp the request was created at
     */

    /**
     * Gets an array of membership requests
     * @param {string} groupId The ID of a group to get membership requests for
     * @returns {Promise<Array<GroupMembershipRequest>>} An array of membership requests
     */
    async getGroupMembershipRequests(groupId) {
        return await this.playPage.evaluate(async (gropId) => {
            return await window.WPP.group.getMembershipRequests(gropId);
        }, groupId);
    }

    /**
     * An object that handles the result for membership request action
     * @typedef {Object} MembershipRequestActionResult
     * @property {string} requesterId User ID whos membership request was approved/rejected
     * @property {number|undefined} error An error code that occurred during the operation for the participant
     * @property {string} message A message with a result of membership request action
     */

    /**
     * An object that handles options for {@link approveGroupMembershipRequests} and {@link rejectGroupMembershipRequests} methods
     * @typedef {Object} MembershipRequestActionOptions
     * @property {Array<string>|string|null} requesterIds User ID/s who requested to join the group, if no value is provided, the method will search for all membership requests for that group
     * @property {Array<number>|number|null} sleep The number of milliseconds to wait before performing an operation for the next requester. If it is an array, a random sleep time between the sleep[0] and sleep[1] values will be added (the difference must be >=100 ms, otherwise, a random sleep time between sleep[1] and sleep[1] + 100 will be added). If sleep is a number, a sleep time equal to its value will be added. By default, sleep is an array with a value of [250, 500]
     */

    /**
     * Approves membership requests if any
     * @param {string} groupId The group ID to get the membership request for
     * @param {MembershipRequestActionOptions} options Options for performing a membership request action
     * @returns {Promise<Array<MembershipRequestActionResult>>} Returns an array of requester IDs whose membership requests were approved and an error for each requester, if any occurred during the operation. If there are no requests, an empty array will be returned
     */
    async approveGroupMembershipRequests(groupId, options = {}) {
        return await this.playPage.evaluate(async ({ groupId, options = {} }) => {
            const { requesterIds = null } = options;
            return await window.WPP.group.approve(groupId, requesterIds);
        }, { groupId, options });
    }

    /**
     * Rejects membership requests if any
     * @param {string} groupId The group ID to get the membership request for
     * @param {MembershipRequestActionOptions} options Options for performing a membership request action
     * @returns {Promise<Array<MembershipRequestActionResult>>} Returns an array of requester IDs whose membership requests were rejected and an error for each requester, if any occurred during the operation. If there are no requests, an empty array will be returned
     */
    async rejectGroupMembershipRequests(groupId, options = {}) {
        return await this.playPage.evaluate(async ({ groupId, options = {} }) => {
            const { requesterIds = null } = options;
            return await window.WPP.group.reject(groupId, requesterIds);
        }, { groupId, options });
    }

    /**
     * Setting  autoload download audio
     * @param {boolean} flag true/false
     */
    async setAutoDownloadAudio(flag) {
        await this.playPage.evaluate(async flag => {
            const autoDownload = window.Store.Settings.getAutoDownloadAudio();
            if (autoDownload === flag) {
                return flag;
            }
            await window.Store.Settings.setAutoDownloadAudio(flag);
            return flag;
        }, flag);
    }

    /**
     * Setting  autoload download documents
     * @param {boolean} flag true/false
     */
    async setAutoDownloadDocuments(flag) {
        await this.playPage.evaluate(async flag => {
            const autoDownload = window.Store.Settings.getAutoDownloadDocuments();
            if (autoDownload === flag) {
                return flag;
            }
            await window.Store.Settings.setAutoDownloadDocuments(flag);
            return flag;
        }, flag);
    }

    /**
     * Setting  autoload download photos
     * @param {boolean} flag true/false
     */
    async setAutoDownloadPhotos(flag) {
        await this.playPage.evaluate(async flag => {
            const autoDownload = window.Store.Settings.getAutoDownloadPhotos();
            if (autoDownload === flag) {
                return flag;
            }
            await window.Store.Settings.setAutoDownloadPhotos(flag);
            return flag;
        }, flag);
    }

    /**
     * Setting  autoload download videos
     * @param {boolean} flag true/false
     */
    async setAutoDownloadVideos(flag) {
        await this.playPage.evaluate(async flag => {
            const autoDownload = window.Store.Settings.getAutoDownloadVideos();
            if (autoDownload === flag) {
                return flag;
            }
            await window.Store.Settings.setAutoDownloadVideos(flag);
            return flag;
        }, flag);
    }

    /**
     * join as beta on WhatsApp Web
     * @param {boolean} action true/false
     * @returns 
     */
    async joinWebBeta(action = true) {
        return await this.playPage.evaluate(async (action) => {
            return await window.WPP.conn.joinWebBeta(action);
        }, action);
    }
}

module.exports = Client;