export default class Channel {
  public Message: any;
  public name: string;
  private constructor(messageClass: any) {
    this.Message = messageClass.prototype.constructor;
    this.name = this.Message.name + "s";
  }

  on(action: any, callback: (arg0: any) => void, target: any = null) {
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

  static for(messageClass: any) {
    return new Channel(messageClass);
  }
}
