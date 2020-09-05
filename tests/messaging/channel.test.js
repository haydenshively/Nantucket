const assert = require("assert");

const Channel = require("../../src/messaging/channel");

describe("messaging || Channel Test", () => {
  // process.send only exists in child processes
  process.send = msg => process.emit("message", msg);

  it("should base itself on message class", () => {
    class Foo {
      constructor() {
        this.baz = 42;
      }
    }

    const channel = Channel(Foo);
    assert(channel.name === "Foos");
    assert(new channel.Message() instanceof Foo);
  });
});
