exports.StoreObject = () => {
    const storeObjects = [
        {
            id: 'Store',
            conditions: (module) =>
                module.default && module.default.Chat && module.default.Msg
                    ? module.default
                    : null,
        },
        {
            id: 'Validators',
            conditions: (module) => (module.findLinks ? module : null),
        },
        {
            id: 'StickerTools',
            conditions: (module) => module.toWebpSticker && module
        },
        {
            id: 'UploadUtils',
            conditions: (module) => (module.default && module.default.encryptAndUpload) ? module.default : null
        },
        {
            id: 'NumberInfo',
            conditions: (module) => module.formattedPhoneNumber && module
        },
        {
            id: 'Settings',
            conditions: (module) => module.ChatlistPanelState && module
        },
        {
            id: 'getMsgInfo',
            conditions: (module) => (module.sendQueryMsgInfo || module.queryMsgInfo)
        },
        {
            id: 'QueryOrder',
            conditions: (module) => module.queryOrder && module
        },
        {
            id: 'QueryProduct',
            conditions: (module) => module.queryProduct && module
        },
        {
            id: 'ContactMethods',
            conditions: (module) => module.getIsMe && module
        }
    ];

    if (typeof window.Store == 'undefined') {
        window.Store = {};
        window.Store.promises = {};

        for (const store of storeObjects) {
            window.Store.promises[store.id] = Promise.resolve(window.WPP.webpack.search(store.conditions))
                .then((m) => {
                    if (!m) {
                        console.error(`Store Object '${store.id}' was not found`);
                    }
                    return m;
                })
                .then(store.conditions)
                .then((m) => {
                    if (store.id === 'Store') {
                        window.Store = Object.assign({}, window.Store, m);
                    } else {
                        window.Store[store.id] = m;
                    }
                });
        }
    }
};

exports.LoadUtils = () => {
    window.WAJS = {};

    window.WAJS.compareWwebVersions = (lOperand, operator, rOperand) => {
        if (!['>', '>=', '<', '<=', '='].includes(operator)) {
            throw new class _ extends Error {
                constructor(m) { super(m); this.name = 'CompareWwebVersionsError'; }
            }('Invalid comparison operator is provided');

        }
        if (typeof lOperand !== 'string' || typeof rOperand !== 'string') {
            throw new class _ extends Error {
                constructor(m) { super(m); this.name = 'CompareWwebVersionsError'; }
            }('A non-string WWeb version type is provided');
        }

        lOperand = lOperand.replace(/-beta$/, '');
        rOperand = rOperand.replace(/-beta$/, '');

        while (lOperand.length !== rOperand.length) {
            lOperand.length > rOperand.length
                ? rOperand = rOperand.concat('0')
                : lOperand = lOperand.concat('0');
        }

        lOperand = Number(lOperand.replace(/\./g, ''));
        rOperand = Number(rOperand.replace(/\./g, ''));

        return (
            operator === '>' ? lOperand > rOperand :
                operator === '>=' ? lOperand >= rOperand :
                    operator === '<' ? lOperand < rOperand :
                        operator === '<=' ? lOperand <= rOperand :
                            operator === '=' ? lOperand === rOperand :
                                false
        );
    };

    window.WAJS.sendMessage = async (chat, content, options = {}) => {
        let attOptions = {};
        if (options.attachment) {
            attOptions = options.sendMediaAsSticker
                ? await window.WAJS.processStickerData(options.attachment)
                : await window.WAJS.processMediaData(options.attachment, {
                    forceVoice: options.sendAudioAsVoice,
                    forceDocument: options.sendMediaAsDocument,
                    forceGif: options.sendVideoAsGif
                });

            if (options.caption) {
                attOptions.caption = options.caption;
                delete options.caption;
            }
            content = options.sendMediaAsSticker ? undefined : attOptions.preview;
            attOptions.isViewOnce = options.isViewOnce;

            delete options.attachment;
            delete options.sendMediaAsSticker;
            delete options.isViewOnce;
        }

        let quotedMsgOptions = {};
        if (options.quotedMessageId) {
            let quotedMessage = await window.WPP.chat.getMessageById(options.quotedMessageId);

            const canReply = await window.WPP.chat.canReply(options.quotedMessageId);
            if (quotedMessage && canReply) {
                quotedMsgOptions = quotedMessage.msgContextInfo(chat);
            }
            delete options.quotedMessageId;
        }

        if (options.mentionedJidList) {
            options.mentionedJidList = options.mentionedJidList.map(cId => window.WPP.whatsapp.ContactStore.get(cId).id);
        }

        let locationOptions = {};
        if (options.location) {
            let { latitude, longitude, description, url } = options.location;
            url = window.Store.Validators.findLink(url)?.href;
            url && !description && (description = url);
            locationOptions = {
                type: 'location',
                loc: description,
                lat: latitude,
                lng: longitude,
                clientUrl: url
            };
            delete options.location;
        }

        let _pollOptions = {};
        if (options.poll) {
            const { pollName, pollOptions } = options.poll;
            const { allowMultipleAnswers, messageSecret } = options.poll.options;
            _pollOptions = {
                type: 'poll_creation',
                pollName: pollName,
                pollOptions: pollOptions,
                pollSelectableOptionsCount: allowMultipleAnswers ? 0 : 1,
                messageSecret:
                    Array.isArray(messageSecret) && messageSecret.length === 32
                        ? new Uint8Array(messageSecret)
                        : window.crypto.getRandomValues(new Uint8Array(32))
            };
            delete options.poll;
        }

        let vcardOptions = {};
        if (options.contactCard) {
            let contact = window.WPP.whatsapp.ContactStore.get(options.contactCard);
            vcardOptions = {
                body: window.WPP.whatsapp.VCard.vcardFromContactModel(contact).vcard,
                type: 'vcard',
                vcardFormattedName: contact.formattedName
            };
            delete options.contactCard;
        } else if (options.contactCardList) {
            let contacts = options.contactCardList.map(c => window.WPP.whatsapp.ContactStore.get(c));
            let vcards = contacts.map(c => window.WPP.whatsapp.VCard.vcardFromContactModel(c));
            vcardOptions = {
                type: 'multi_vcard',
                vcardList: vcards,
                body: undefined
            };
            delete options.contactCardList;
        } else if (options.parseVCards && typeof (content) === 'string' && content.startsWith('BEGIN:VCARD')) {
            delete options.parseVCards;
            try {
                const parsed = window.WPP.whatsapp.VCard.parseVCard(content);
                if (parsed) {
                    vcardOptions = {
                        type: 'vcard',
                        vcardFormattedName: window.WPP.whatsapp.VCard.vcardGetNameFromParsed(parsed)
                    };
                }
            } catch (_) {
                // not a vcard
            }
        }

        if (options.linkPreview) {
            delete options.linkPreview;
            const link = await window.Store.Validators.findLink(content);
            if (link && !window.WPP.conn.isMultiDevice()) {
                const preview = await window.WPP.whatsapp.functions.queryLinkPreview(link.url);
                preview.preview = true;
                preview.subtype = 'url';
                options = { ...options, ...preview };
            }
        }

        const fromwWid = window.WPP.whatsapp.UserPrefs.getMaybeMeUser();
        const isMD = window.WPP.conn.isMultiDevice();
        const newId = await window.WPP.whatsapp.MsgKey.newId();

        const newMsgId = new window.WPP.whatsapp.MsgKey({
            from: fromwWid,
            to: chat.id,
            id: newId,
            participant: isMD && chat.id.isGroup() ? fromwWid : undefined,
            selfDir: 'out',
        });

        const extraOptions = options.extraOptions || {};
        delete options.extraOptions;

        const ephemeralFields = window.WPP.whatsapp.functions.getEphemeralFields(chat);

        const message = {
            ...options,
            id: newMsgId,
            ack: 0,
            body: content,
            from: fromwWid,
            to: chat.id,
            local: true,
            self: 'out',
            t: parseInt(new Date().getTime() / 1000),
            isNewMsg: true,
            type: 'chat',
            ...ephemeralFields,
            ...locationOptions,
            ..._pollOptions,
            ...attOptions,
            ...(attOptions.toJSON ? attOptions.toJSON() : {}),
            ...quotedMsgOptions,
            ...vcardOptions,
            ...extraOptions
        };

        await window.WPP.whatsapp.functions.addAndSendMsgToChat(chat, message);

        return window.WPP.whatsapp.MsgStore.get(newMsgId._serialized);
    };

    window.WAJS.toStickerData = async (mediaInfo) => {
        if (mediaInfo.mimetype == 'image/webp') return mediaInfo;

        const file = window.WAJS.mediaInfoToFile(mediaInfo);
        const webpSticker = await window.Store.StickerTools.toWebpSticker(file);
        const webpBuffer = await webpSticker.arrayBuffer();
        const data = window.WAJS.arrayBufferToBase64(webpBuffer);

        return {
            mimetype: 'image/webp',
            data
        };
    };

    window.WAJS.processStickerData = async (mediaInfo) => {
        if (mediaInfo.mimetype !== 'image/webp') throw new Error('Invalid media type');

        const file = window.WAJS.mediaInfoToFile(mediaInfo);
        let filehash = await window.WAJS.getFileHash(file);
        let mediaKey = await window.WAJS.generateHash(32);

        const controller = new AbortController();
        const uploadedInfo = await window.Store.UploadUtils.encryptAndUpload({
            blob: file,
            type: 'sticker',
            signal: controller.signal,
            mediaKey
        });

        const stickerInfo = {
            ...uploadedInfo,
            clientUrl: uploadedInfo.url,
            deprecatedMms3Url: uploadedInfo.url,
            uploadhash: uploadedInfo.encFilehash,
            size: file.size,
            type: 'sticker',
            filehash
        };

        return stickerInfo;
    };

    window.WAJS.processMediaData = async (mediaInfo, { forceVoice, forceDocument, forceGif }) => {
        const file = window.WAJS.mediaInfoToFile(mediaInfo);
        const mData = await window.WPP.whatsapp.OpaqueData.createFromData(file, file.type);
        const mediaPrep = window.WPP.whatsapp.MediaPrep.prepRawMedia(mData, { asDocument: forceDocument });
        const mediaData = await mediaPrep.waitForPrep();
        const mediaObject = window.WPP.whatsapp.MediaObjectUtil.getOrCreateMediaObject(mediaData.filehash);

        if (forceVoice && mediaData.type === 'audio') {
            mediaData.type = 'ptt';
            const waveform = mediaObject.contentInfo.waveform;
            mediaData.waveform =
                waveform ?? await window.WAJS.generateWaveform(file);
        }

        if (forceGif && mediaData.type === 'video') {
            mediaData.isGif = true;
        }

        if (forceDocument) {
            mediaData.type = 'document';
        }

        if (!(mediaData.mediaBlob instanceof window.WPP.whatsapp.OpaqueData)) {
            mediaData.mediaBlob = await window.WPP.whatsapp.OpaqueData.createFromData(mediaData.mediaBlob, mediaData.mediaBlob.type);
        }

        mediaData.renderableUrl = mediaData.mediaBlob.url();
        mediaObject.consolidate(mediaData.toJSON());
        mediaData.mediaBlob.autorelease();

        const uploadedMedia = await window.WPP.whatsapp.functions.uploadMedia({
            mimetype: mediaData.mimetype,
            mediaObject,
            mediaType: mediaData.type
        });

        const mediaEntry = uploadedMedia.mediaEntry;
        if (!mediaEntry) {
            throw new Error('upload failed: media entry was not created');
        }

        mediaData.set({
            clientUrl: mediaEntry.mmsUrl,
            deprecatedMms3Url: mediaEntry.deprecatedMms3Url,
            directPath: mediaEntry.directPath,
            mediaKey: mediaEntry.mediaKey,
            mediaKeyTimestamp: mediaEntry.mediaKeyTimestamp,
            filehash: mediaObject.filehash,
            encFilehash: mediaEntry.encFilehash,
            uploadhash: mediaEntry.uploadHash,
            size: mediaObject.size,
            streamingSidecar: mediaEntry.sidecar,
            firstFrameSidecar: mediaEntry.firstFrameSidecar
        });

        return mediaData;
    };

    window.WAJS.getMessageModel = message => {
        const msg = message.serialize();

        msg.isEphemeral = message.isEphemeral;
        msg.isStatusV3 = message.isStatusV3;
        msg.links = (message.getRawLinks()).map(link => ({
            link: link.href,
            isSuspicious: Boolean(link.suspiciousCharacters && link.suspiciousCharacters.size)
        }));

        if (msg.buttons) {
            msg.buttons = msg.buttons.serialize();
        }
        if (msg.dynamicReplyButtons) {
            msg.dynamicReplyButtons = JSON.parse(JSON.stringify(msg.dynamicReplyButtons));
        }
        if (msg.replyButtons) {
            msg.replyButtons = JSON.parse(JSON.stringify(msg.replyButtons));
        }

        if (typeof msg.id.remote === 'object') {
            msg.id = Object.assign({}, msg.id, { remote: msg.id.remote._serialized });
        }

        delete msg.pendingAckUpdate;

        return msg;
    };

    window.WAJS.getChatModel = async chat => {

        let res = chat.serialize();
        res.isGroup = chat.isGroup;
        res.formattedTitle = chat.formattedTitle;
        res.isMuted = chat.mute && chat.mute.isMuted;

        if (chat.groupMetadata) {
            const chatWid = window.WPP.whatsapp.WidFactory.createWid((chat.id._serialized));
            await window.WPP.whatsapp.GroupMetadataStore.update(chatWid);
            res.groupMetadata = chat.groupMetadata.serialize();
        }

        res.lastMessage = null;
        if (res.msgs && res.msgs.length) {
            const lastMessage = chat.lastReceivedKey ? window.WPP.whatsapp.MsgStore.get(chat.lastReceivedKey._serialized) : null;
            if (lastMessage) {
                res.lastMessage = window.WAJS.getMessageModel(lastMessage);
            }
        }

        delete res.msgs;
        delete res.msgUnsyncedButtonReplyMsgs;
        delete res.unsyncedButtonReplies;

        return res;
    };

    window.WAJS.getChats = async () => {
        const chats = window.WPP.whatsapp.ChatStore.getModelsArray();

        const chatPromises = chats.map(chat => window.WAJS.getChatModel(chat));
        return await Promise.all(chatPromises);
    };

    window.WAJS.getContactModel = contact => {
        let res = contact.serialize();
        res.isBusiness = contact.isBusiness === undefined ? false : contact.isBusiness;

        if (contact.businessProfile) {
            res.businessProfile = contact.businessProfile.serialize();
        }

        // TODO: remove useOldImplementation and its checks once all clients are updated to >= v2.2327.4
        const useOldImplementation
            = window.WAJS.compareWwebVersions(window.Debug.VERSION, '<', '2.2327.4');

        res.isMe = useOldImplementation
            ? contact.isMe
            : window.Store.ContactMethods.getIsMe(contact);
        res.isUser = useOldImplementation
            ? contact.isUser
            : window.Store.ContactMethods.getIsUser(contact);
        res.isGroup = useOldImplementation
            ? contact.isGroup
            : window.Store.ContactMethods.getIsGroup(contact);
        res.isWAContact = useOldImplementation
            ? contact.isWAContact
            : window.Store.ContactMethods.getIsWAContact(contact);
        res.isMyContact = useOldImplementation
            ? contact.isMyContact
            : window.Store.ContactMethods.getIsMyContact(contact);
        res.isBlocked = contact.isContactBlocked;
        res.userid = useOldImplementation
            ? contact.userid
            : window.Store.ContactMethods.getUserid(contact);
        res.verifiedName = useOldImplementation
            ? contact.verifiedName
            : window.Store.ContactMethods.getVerifiedName(contact);
        res.verifiedLevel = useOldImplementation
            ? contact.verifiedLevel
            : window.Store.ContactMethods.getVerifiedLevel(contact);
        res.statusMute = useOldImplementation
            ? contact.statusMute
            : window.Store.ContactMethods.getStatusMute(contact);
        res.name = useOldImplementation
            ? contact.name
            : window.Store.ContactMethods.getName(contact);
        res.shortName = useOldImplementation
            ? contact.shortName
            : window.Store.ContactMethods.getShortName(contact);
        res.pushname = useOldImplementation
            ? contact.pushname
            : window.Store.ContactMethods.getPushname(contact);

        return res;
    };

    window.WAJS.getContacts = () => {
        const contacts = window.WPP.whatsapp.ContactStore.getModelsArray();
        return contacts.map(contact => window.WAJS.getContactModel(contact));
    };

    window.WAJS.mediaInfoToFile = ({ data, mimetype, filename }) => {
        const binaryData = window.atob(data);

        const buffer = new ArrayBuffer(binaryData.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < binaryData.length; i++) {
            view[i] = binaryData.charCodeAt(i);
        }

        const blob = new Blob([buffer], { type: mimetype });
        return new File([blob], filename, {
            type: mimetype,
            lastModified: Date.now()
        });
    };

    window.WAJS.arrayBufferToBase64 = (arrayBuffer) => {
        let binary = '';
        const bytes = new Uint8Array(arrayBuffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    };

    window.WAJS.arrayBufferToBase64Async = (arrayBuffer) =>
        new Promise((resolve, reject) => {
            const blob = new Blob([arrayBuffer], {
                type: 'application/octet-stream',
            });
            const fileReader = new FileReader();
            fileReader.onload = () => {
                const [, data] = fileReader.result.split(',');
                resolve(data);
            };
            fileReader.onerror = (e) => reject(e);
            fileReader.readAsDataURL(blob);
        });

    window.WAJS.getFileHash = async (data) => {
        let buffer = await data.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
    };

    window.WAJS.generateHash = async (length) => {
        var result = '';
        var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var charactersLength = characters.length;
        for (var i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
    };

    /**
    * Referenced from and modified:
    * @see https://github.com/wppconnect-team/wa-js/commit/290ebfefe6021b3d17f7fdfdda5545bb0473b26f
    */
    window.WAJS.generateWaveform = async (audioFile) => {
        try {
            const audioData = await audioFile.arrayBuffer();
            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(audioData);

            const rawData = audioBuffer.getChannelData(0);
            const samples = 64;
            const blockSize = Math.floor(rawData.length / samples);
            const filteredData = [];
            for (let i = 0; i < samples; i++) {
                const blockStart = blockSize * i;
                let sum = 0;
                for (let j = 0; j < blockSize; j++) {
                    sum = sum + Math.abs(rawData[blockStart + j]);
                }
                filteredData.push(sum / blockSize);
            }

            const multiplier = Math.pow(Math.max(...filteredData), -1);
            const normalizedData = filteredData.map((n) => n * multiplier);

            const waveform = new Uint8Array(
                normalizedData.map((n) => Math.floor(100 * n))
            );

            return waveform;
        } catch (e) {
            return undefined;
        }
    };

    window.WAJS.getLabelModel = label => {
        let res = label.serialize();
        res.hexColor = label.hexColor;

        return res;
    };

    window.WAJS.getLabels = () => {
        const labels = window.WPP.whatsapp.LabelStore.getModelsArray();
        return labels.map(label => window.WPP.whatsapp.LabelStore(label));
    };

    window.WAJS.getLabel = (labelId) => {
        const label = window.WPP.whatsapp.LabelStore.get(labelId);
        return window.WAJS.getLabelModel(label);
    };

    window.WAJS.getChatLabels = async (chatId) => {
        const chat = await window.WAJS.getChat(chatId);
        return (chat.labels || []).map(id => window.WAJS.getLabel(id));
    };

    window.WAJS.getOrderDetail = async (orderId, token, chatId) => {
        const chatWid = window.WPP.whatsapp.WidFactory.createWid(chatId);
        return window.Store.QueryOrder.queryOrder(chatWid, orderId, 80, 80, token);
    };

    window.WAJS.getProductMetadata = async (productId) => {
        let sellerId = window.WPP.whatsapp.Conn.wid;
        let product = await window.Store.QueryProduct.queryProduct(sellerId, productId);
        if (product && product.data) {
            return product.data;
        }

        return undefined;
    };

    window.WAJS.cropAndResizeImage = async (media, options = {}) => {
        if (!media.mimetype.includes('image'))
            throw new Error('Media is not an image');

        if (options.mimetype && !options.mimetype.includes('image'))
            delete options.mimetype;

        options = Object.assign({ size: 640, mimetype: media.mimetype, quality: .75, asDataUrl: false }, options);

        const img = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = `data:${media.mimetype};base64,${media.data}`;
        });

        const sl = Math.min(img.width, img.height);
        const sx = Math.floor((img.width - sl) / 2);
        const sy = Math.floor((img.height - sl) / 2);

        const canvas = document.createElement('canvas');
        canvas.width = options.size;
        canvas.height = options.size;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sl, sl, 0, 0, options.size, options.size);

        const dataUrl = canvas.toDataURL(options.mimetype, options.quality);

        if (options.asDataUrl)
            return dataUrl;

        return Object.assign(media, {
            mimetype: options.mimeType,
            data: dataUrl.replace(`data:${options.mimeType};base64,`, '')
        });
    };

    window.WAJS.getProfilePicThumbToBase64 = async (chatWid) => {
        const profilePicCollection = await window.WPP.contact.getProfilePictureUrl(chatWid);

        const _readImageAsBase64 = (imageBlob) => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = function () {
                    const base64Image = reader.result;
                    if (base64Image == null) {
                        resolve(undefined);
                    } else {
                        const base64Data = base64Image.toString().split(',')[1];
                        resolve(base64Data);
                    }
                };
                reader.readAsDataURL(imageBlob);
            });
        };

        if (profilePicCollection) {
            try {
                const response = await fetch(profilePicCollection);
                if (response.ok) {
                    const imageBlob = await response.blob();
                    if (imageBlob) {
                        const base64Image = await _readImageAsBase64(imageBlob);
                        return base64Image;
                    }
                }
            } catch (error) { /* empty */ }
        }
        return undefined;
    };

    window.WAJS.setPicture = async (chatid, media) => {
        const thumbnail = await window.WAJS.cropAndResizeImage(media, { asDataUrl: true, mimetype: 'image/jpeg', size: 96 });
        const profilePic = await window.WAJS.cropAndResizeImage(media, { asDataUrl: true, mimetype: 'image/jpeg', size: 640 });

        const chatWid = window.WPP.whatsapp.WidFactory.createWid(chatid);
        try {
            return window.WPP.whatsapp.functions.sendSetPicture(chatWid, thumbnail, profilePic);
        } catch (err) {
            if (err.name === 'ServerStatusCodeError') return false;
            throw err;
        }
    };

    window.WAJS.sendChatstate = async (state, chatId, duration = 5000) => {
        switch (state) {
        case 'typing':
            await window.WPP.chat.markIsComposing(chatId, duration);
            break;
        case 'recording':
            await window.WPP.chat.markIsRecording(chatId, duration);
            break;
        case 'stop':
            await window.WPP.chat.markIsPaused(chatId);
            break;
        default:
            throw 'Invalid chatstate';
        }

        return true;
    };
};