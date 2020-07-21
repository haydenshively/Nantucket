const nfetch = require("node-fetch");
const Transport = require("winston-transport");

class SlackHook extends Transport {
  constructor(opts) {
    super(opts);

    opts = opts || {};

    this.webhookUrl = opts.webhookUrl;
    this.formatter = opts.formatter || undefined;
    this.mrkdwn = opts.mrkdwn || false;
  }

  log(info, callback) {
    let payload = {
      mrkdwn: this.mrkdwn
    };

    if (this.formatter && typeof this.formatter === "function") {
      let layout = this.formatter(info);

      // Note: Supplying `text` when `blocks` is also supplied will cause `text`
      // to be used as a fallback for clients/surfaces that don't support blocks
      payload.text = layout.text || undefined;
      payload.blocks = layout.blocks || undefined;
      payload.attachments = layout.attachments || undefined;
    } else {
      payload.text = `${info.message}`;
    }

    const params = {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    };
    nfetch(this.webhookUrl, params).then(callback());
  }
}

module.exports = SlackHook;
