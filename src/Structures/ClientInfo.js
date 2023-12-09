'use strict';

const Base = require('./Base');

/**
 * Current connection information
 * @extends {Base}
 */
class ClientInfo extends Base {
    constructor(client, data) {
        super(client);

        if (data) this._patch(data);
    }

    _patch(data) {
        /**
         * Name configured to be shown in push notifications
         * @type {string}
         */
        this.pushname = data.pushname;

        /**
         * Current user ID
         * @type {object}
         */
        this.wid = data.wid;

        /**
         * @type {object}
         * @deprecated Use .wid instead
         */
        this.me = data.wid;

        /**
         * Platform WhatsApp is running on
         * @type {string}
         */
        this.platform = data.platform;

        return super._patch(data);
    }

    /**
     * Get current battery percentage and charging status for the attached device
     * @returns {object} batteryStatus
     * @returns {number} batteryStatus.battery - The current battery percentage
     * @returns {boolean} batteryStatus.plugged - Indicates if the phone is plugged in (true) or not (false)
     * @deprecated
     */
    async getBatteryStatus() {
        return await this.client.playPage.evaluate(() => {
            const { battery, plugged } = window.WPP.whatsapp.Conn;
            return { battery, plugged };
        });
    }
}

module.exports = ClientInfo;