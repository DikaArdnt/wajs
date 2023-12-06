'use strict';

const Chat = require('./Chat');

/**
 * Group participant information
 * @typedef {Object} GroupParticipant
 * @property {ContactId} id
 * @property {boolean} isAdmin
 * @property {boolean} isSuperAdmin
 */

/**
 * Represents a Group Chat on WhatsApp
 * @extends {Chat}
 */
class GroupChat extends Chat {
    _patch(data) {
        this.groupMetadata = data.groupMetadata;

        return super._patch(data);
    }

    /**
     * Gets the group owner
     * @type {ContactId}
     */
    get owner() {
        return this.groupMetadata.owner;
    }

    /**
     * Gets the date at which the group was created
     * @type {date}
     */
    get createdAt() {
        return new Date(this.groupMetadata.creation * 1000);
    }

    /** 
     * Gets the group description
     * @type {string}
     */
    get description() {
        return this.groupMetadata.desc;
    }

    /**
     * Gets the group participants
     * @type {Array<GroupParticipant>}
     */
    get participants() {
        return this.groupMetadata.participants;
    }

    /**
     * An object that handles the result for {@link addParticipants} method
     * @typedef {Object} AddParticipantsResult
     * @property {number} code The code of the result
     * @property {string} message The result message
     * @property {boolean} isInviteV4Sent Indicates if the inviteV4 was sent to the partitipant
     */

    /**
     * An object that handles options for adding participants
     * @typedef {Object} AddParticipnatsOptions
     * @property {Array<number>|number} [sleep = [250, 500]] The number of milliseconds to wait before adding the next participant. If it is an array, a random sleep time between the sleep[0] and sleep[1] values will be added (the difference must be >=100 ms, otherwise, a random sleep time between sleep[1] and sleep[1] + 100 will be added). If sleep is a number, a sleep time equal to its value will be added. By default, sleep is an array with a value of [250, 500]
     * @property {boolean} [autoSendInviteV4 = true] If true, the inviteV4 will be sent to those participants who have restricted others from being automatically added to groups, otherwise the inviteV4 won't be sent (true by default)
     * @property {string} [comment = ''] The comment to be added to an inviteV4 (empty string by default)
     */

    /**
     * Adds a list of participants by ID to the group
     * @param {string|Array<string>} participantIds 
     * @param {AddParticipnatsOptions} options An object thay handles options for adding participants
     * @returns {Promise<Object.<string, AddParticipantsResult>|string>} Returns an object with the resulting data or an error message as a string
     */
    async addParticipants(participantIds, options = {}) {
        return await this.client.playPage.evaluate(async ({ groupId, participantIds, options }) => {
            const { autoSendInviteV4 = true, comment = '' } = options;
            const groupWid = window.WPP.whatsapp.WidFactory.createWid(groupId);
            const group = await window.WPP.whatsapp.ChatStore.find(groupWid);

            for (let participant of participantIds) {
                const pWid = window.WPP.whatsapp.WidFactory.createWid(participant);
                const result = await window.WPP.group.addParticipants(groupId, [participant]);
                const rpcResult = result[participant];

                if (autoSendInviteV4 && rpcResult.code === 403) {
                    let userChat, isInviteV4Sent = false;
                    window.WPP.whatsapp.ContactStore.gadd(pWid, { silent: true });

                    if (rpcResult.message.includes('ParticipantRequestCodeCanBeSent') &&
                        (userChat = await window.WPP.whatsapp.ChatStore.find(pWid))) {
                        const groupName = group.formattedTitle || group.name;
                        const res = await window.WPP.whatsapp.ChatModel.sendGroupInviteMessage(
                            userChat,
                            group.id._serialized,
                            groupName,
                            rpcResult.invite_code,
                            rpcResult.invite_code_exp,
                            comment,
                            await window.WAJS.getProfilePicThumbToBase64(groupWid)
                        );
                        isInviteV4Sent = window.WAJS.compareWwebVersions(window.Debug.VERSION, '<', '2.2335.6')
                            ? res === 'OK'
                            : res.messageSendResult === 'OK';
                    }

                    result[participant].isInviteV4Sent = isInviteV4Sent;
                }

                return rpcResult;
            }
        }, { groupId: this.id._serialized, participantIds, options });
    }

    /**
     * Removes a list of participants by ID to the group
     * @param {Array<string>} participantIds 
     * @returns {Promise<{ status: number }>}
     */
    async removeParticipants(participantIds) {
        return await this.client.playPage.evaluate(async ({ chatId, participantIds }) => {
            return await window.WPP.group.removeParticipants(chatId, participantIds);
        }, { chatId: this.id._serialized, participantIds });
    }

    /**
     * Promotes participants by IDs to admins
     * @param {Array<string>} participantIds 
     * @returns {Promise<{ status: number }>} Object with status code indicating if the operation was successful
     */
    async promoteParticipants(participantIds) {
        return await this.client.playPage.evaluate(async ({ chatId, participantIds }) => {
            return await window.WPP.group.promoteParticipants(chatId, participantIds);
        }, { chatId: this.id._serialized, participantIds });
    }

    /**
     * Demotes participants by IDs to regular users
     * @param {Array<string>} participantIds 
     * @returns {Promise<{ status: number }>} Object with status code indicating if the operation was successful
     */
    async demoteParticipants(participantIds) {
        return await this.client.playPage.evaluate(async ({ chatId, participantIds }) => {
            return await window.WPP.group.demoteParticipants(chatId, participantIds);
        }, { chatId: this.id._serialized, participantIds });
    }

    /**
     * Updates the group subject
     * @param {string} subject 
     * @returns {Promise<boolean>} Returns true if the subject was properly updated. This can return false if the user does not have the necessary permissions.
     */
    async setSubject(subject) {
        const success = await this.client.playPage.evaluate(async ({ chatId, subject }) => {
            try {
                await window.WPP.group.setSubject(chatId, subject);
                return true;
            } catch (err) {
                if (err.name === 'ServerStatusCodeError') return false;
                throw err;
            }
        }, { chatId: this.id._serialized, subject });

        if (!success) return false;
        this.name = subject;
        return true;
    }

    /**
     * Updates the group description
     * @param {string} description 
     * @returns {Promise<boolean>} Returns true if the description was properly updated. This can return false if the user does not have the necessary permissions.
     */
    async setDescription(description) {
        const success = await this.client.playPage.evaluate(async ({ chatId, description }) => {
            try {
                await window.WPP.group.setDescription(chatId, description);
                return true;
            } catch (err) {
                if (err.name === 'ServerStatusCodeError') return false;
                throw err;
            }
        }, { chatId: this.id._serialized, description });

        if (!success) return false;
        this.groupMetadata.desc = description;
        return true;
    }

    /**
     * Updates the group settings to only allow admins to send messages.
     * @param {boolean} [adminsOnly=true] Enable or disable this option 
     * @returns {Promise<boolean>} Returns true if the setting was properly updated. This can return false if the user does not have the necessary permissions.
     */
    async setMessagesAdminsOnly(adminsOnly = true) {
        const success = await this.client.playPage.evaluate(async ({ chatId, adminsOnly }) => {
            try {
                await window.WPP.group.setProperty(chatId, 'announcement', adminsOnly ? 1 : 0);
                return true;
            } catch (err) {
                if (err.name === 'ServerStatusCodeError') return false;
                throw err;
            }
        }, { chatId: this.id._serialized, adminsOnly });

        if (!success) return false;

        this.groupMetadata.announce = adminsOnly;
        return true;
    }

    /**
     * Updates the group settings to only allow admins to edit group info (title, description, photo).
     * @param {boolean} [adminsOnly=true] Enable or disable this option 
     * @returns {Promise<boolean>} Returns true if the setting was properly updated. This can return false if the user does not have the necessary permissions.
     */
    async setInfoAdminsOnly(adminsOnly = true) {
        const success = await this.client.playPage.evaluate(async ({ chatId, adminsOnly }) => {
            try {
                await window.WPP.group.setProperty(chatId, 'restrict', adminsOnly ? 1 : 0);
                return true;
            } catch (err) {
                if (err.name === 'ServerStatusCodeError') return false;
                throw err;
            }
        }, { chatId: this.id._serialized, adminsOnly });

        if (!success) return false;

        this.groupMetadata.restrict = adminsOnly;
        return true;
    }

    /**
     * Deletes the group's picture.
     * @returns {Promise<boolean>} Returns true if the picture was properly deleted. This can return false if the user does not have the necessary permissions.
     */
    async deletePicture() {
        const success = await this.client.playPage.evaluate((chatid) => {
            const chat = window.WPP.whatsapp.WidFactory.createWid(chatid);
            return window.WPP.whatsapp.functions.requestDeletePicture(chat);
        }, this.id._serialized);

        return success;
    }

    /**
     * Sets the group's picture.
     * @param {MessageMedia} media
     * @returns {Promise<boolean>} Returns true if the picture was properly updated. This can return false if the user does not have the necessary permissions.
     */
    async setPicture(media) {
        const success = await this.client.playPage.evaluate(({ chatid, media }) => {
            return window.WAJS.setPicture(chatid, media);
        }, { chatId: this.id._serialized, media });

        return success;
    }

    /**
     * Gets the invite code for a specific group
     * @returns {Promise<string>} Group's invite code
     */
    async getInviteCode() {
        const codeRes = await this.client.playPage.evaluate(async chatId => {
            return window.WPP.group.getInviteCode(chatId);
        }, this.id._serialized);

        return codeRes;
    }

    /**
     * Invalidates the current group invite code and generates a new one
     * @returns {Promise<string>} New invite code
     */
    async revokeInvite() {
        const codeRes = await this.client.playPage.evaluate(chatId => {
            return window.WPP.group.revokeInviteCode(chatId);
        }, this.id._serialized);

        return codeRes;
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
     * @returns {Promise<Array<GroupMembershipRequest>>} An array of membership requests
     */
    async getGroupMembershipRequests() {
        return await this.client.getGroupMembershipRequests(this.id._serialized);
    }

    /**
     * An object that handles the result for membership request action
     * @typedef {Object} MembershipRequestActionResult
     * @property {string} requesterId User ID whos membership request was approved/rejected
     * @property {number} error An error code that occurred during the operation for the participant
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
     * @param {MembershipRequestActionOptions} options Options for performing a membership request action
     * @returns {Promise<Array<MembershipRequestActionResult>>} Returns an array of requester IDs whose membership requests were approved and an error for each requester, if any occurred during the operation. If there are no requests, an empty array will be returned
     */
    async approveGroupMembershipRequests(options = {}) {
        return await this.client.approveGroupMembershipRequests(this.id._serialized, options);
    }

    /**
     * Rejects membership requests if any
     * @param {MembershipRequestActionOptions} options Options for performing a membership request action
     * @returns {Promise<Array<MembershipRequestActionResult>>} Returns an array of requester IDs whose membership requests were rejected and an error for each requester, if any occurred during the operation. If there are no requests, an empty array will be returned
     */
    async rejectGroupMembershipRequests(options = {}) {
        return await this.client.rejectGroupMembershipRequests(this.id._serialized, options);
    }

    /**
     * Makes the bot leave the group
     * @returns {Promise}
     */
    async leave() {
        await this.client.playPage.evaluate(async chatId => {
            return await window.WPP.group.leave(chatId);
        }, this.id._serialized);
    }
}

module.exports = GroupChat;
