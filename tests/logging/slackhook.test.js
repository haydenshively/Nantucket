const assert = require("assert");

const winston = require("winston");

describe("logging || Winston Test", () => {
  it("should send Slack message", () => {
    winston.log("info", "🚨 *This* is a _test_");
  });
});
