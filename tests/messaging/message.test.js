const assert = require("assert");

const Message = require("../../src/messaging/message");

describe("messaging || Message Test", () => {
  // process.send only exists in child processes
  process.send = msg => process.emit("message", msg);

  it("should send and receive an empty message", () => {
    const message = new Message();
    assert(message === message.msg());

    const handler = process.once("message", msg => {
      assert(msg.channel === "Messages");
      assert(msg.action === "Test");
      assert(msg.data === message.__data);
    });
    message.broadcast("Test");
    return handler;
  });

  it("should send and receive a full message", () => {
    const message = new Message({ foo: "bar" });
    assert(message === message.msg());

    const handler = process.once("message", msg => {
      assert(msg.channel === "Messages");
      assert(msg.action === "Test");
      assert(msg.data === message.__data);
    });
    message.broadcast("Test");
    return handler;
  });
});
