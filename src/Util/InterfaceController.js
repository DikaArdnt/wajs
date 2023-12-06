'use strict';

/**
 * Interface Controller
 */
class InterfaceController {

    constructor(props) {
        this.playPage = props.playPage;
    }

    /**
     * Opens the Chat Window
     * @param {string} chatId ID of the chat window that will be opened
     */
    async openChatWindow(chatId) {
        await this.playPage.evaluate(async chatId => {
            let chatWid = window.WPP.whatsapp.WidFactory.createWid(chatId);
            let chat = await window.WPP.whatsapp.ChatStore.find(chatWid);
            await window.WPP.whatsapp.Cmd.openChatAt(chat);
        }, chatId);
    }

    /**
     * Opens the Chat Drawer
     * @param {string} chatId ID of the chat drawer that will be opened
     */
    async openChatDrawer(chatId) {
        await this.playPage.evaluate(async chatId => {
            let chat = await window.WPP.whatsapp.ChatStore.get(chatId);
            await window.WPP.whatsapp.Cmd.openDrawerMid(chat);
        }, chatId);
    }

    /**
     * Opens the Chat Search
     * @param {string} chatId ID of the chat search that will be opened
     */
    async openChatSearch(chatId) {
        await this.playPage.evaluate(async chatId => {
            let chat = await window.WPP.whatsapp.ChatStore.get(chatId);
            await window.WPP.whatsapp.Cmd.chatSearch(chat);
        }, chatId);
    }

    /**
     * Opens or Scrolls the Chat Window to the position of the message
     * @param {string} msgId ID of the message that will be scrolled to
     */
    async openChatWindowAt(msgId) {
        await this.playPage.evaluate(async msgId => {
            let msg = await window.WPP.whatsapp.MsgStore.get(msgId);
            await await window.WPP.chat.openChatAt(msg.id.remote, msgId);
        }, msgId);
    }

    /**
     * Opens the Message Drawer
     * @param {string} msgId ID of the message drawer that will be opened
     */
    async openMessageDrawer(msgId) {
        await this.playPage.evaluate(async msgId => {
            let msg = await window.WPP.whatsapp.MsgStore.get(msgId);
            await window.WPP.whatsapp.Cmd.msgInfoDrawer(msg);
        }, msgId);
    }
}

module.exports = InterfaceController;
