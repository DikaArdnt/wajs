'use strict';

const PrivateContact = require('../Structures/PrivateContact');
const BusinessContact = require('../Structures/BusinessContact');

class ContactFactory {
    static create(client, data) {
        if(data.isBusiness) {
            return new BusinessContact(client, data);
        }

        return new PrivateContact(client, data);
    }
}

module.exports = ContactFactory;