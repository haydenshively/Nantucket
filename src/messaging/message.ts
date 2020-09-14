import Channel from "./channel";

export default class Message {

  protected data: any;

  private channel: any;

  constructor(data = {}) {
    this.data = data;
    this.channel = Channel.for(Object.getPrototypeOf(this).constructor);
  }

  msg() {
    return this;
  }

  broadcast(withAction, target = null) {
    this.channel.broadcast(withAction, this, target);
  }
}
