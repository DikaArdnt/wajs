'use strict';

const Constants = require('./src/Util/Constant');

module.exports = {
    Client: require('./src/Client'),
    
    version: require('./package.json').version,

    // Structures
    Chat: require('./src/Structures/Chat'),
    PrivateChat: require('./src/Structures/PrivateChat'),
    GroupChat: require('./src/Structures/GroupChat'),
    Message: require('./src/Structures/Message'),
    MessageMedia: require('./src/Structures/MessageMedia'),
    Contact: require('./src/Structures/Contact'),
    PrivateContact: require('./src/Structures/PrivateContact'),
    BusinessContact: require('./src/Structures/BusinessContact'),
    ClientInfo: require('./src/Structures/ClientInfo'),
    Location: require('./src/Structures/Location'),
    Poll: require('./src/Structures/Poll'),
    ProductMetadata: require('./src/Structures/ProductMetadata'),
    
    ...Constants
};