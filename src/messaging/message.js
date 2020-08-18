const Channel = require("./channel");

class Message {
  constructor(data = {}) {
    this.__data = data;
    this.__channel = Channel(Object.getPrototypeOf(this).constructor);
  }

  msg() {
    return this;
  }

  broadcast(withAction, target = null) {
    this.__channel.broadcast(withAction, this, target);
  }
}

module.exports = Message;
