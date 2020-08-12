class Message {
  constructor(channel) {
    this.__channel = channel;
    this.__data = {};
  }

  msg() {
    return this;
  }

  broadcast(withAction = null) {
    process.send({
      channel: this.__channel,
      action: withAction,
      data: this.__data
    });
  }

  static whenReceivedOn(channel, callback) {
    process.on("message", msg => {
      if (msg.channel === channel) callback(msg);
    });
  }

  static whenReceivedOn(channel, action, callback) {
    process.on("message", msg => {
      if (msg.channel === channel && msg.action === action) callback(msg);
    });
  }
}

module.exports = Message;
