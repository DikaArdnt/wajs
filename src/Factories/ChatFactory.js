'use strict';

const PrivateChat = require('../Structures/PrivateChat');
const GroupChat = require('../Structures/GroupChat');

class ChatFactory {
    static create(client, data) {
        if(data.isGroup) {
            return new GroupChat(client, data);
        }

        return new PrivateChat(client, data);
    }
}

module.exports = ChatFactory;