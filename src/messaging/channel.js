class _Channel {
  constructor(messageClass) {
    this.Message = messageClass.prototype.constructor;
    this.name = this.Message.name + "s";
  }

  on(action, callback, target = null) {
    if (target === null) target = process;
    target.on("message", msg => {
      if (msg.channel === this.name && msg.action === action) {
        const instance = new this.Message(msg.data);
        callback(instance);
      }
    });
  }

  off(action, callback) {
    process.off("message", msg => {
      if (msg.channel === this.name && msg.action === action) {
        const instance = new this.Message(msg.data);
        callback(instance);
      }
    });
  }

  broadcast(withAction, messageInstance, target = null) {
    if (target === null) target = process;
    target.send({
      channel: this.name,
      data: messageInstance.__data,
      action: withAction
    });
  }
}

// Allows _Channel to be used without the "new" keyword
const Channel = new Proxy(_Channel, {
  apply: function(target, thisArg, argumentsList) {
    return new target(...argumentsList);
  }
});

module.exports = Channel;
