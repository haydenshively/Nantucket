const Fetchable = require("./fetchable");

class Oracle extends Fetchable {
  constructor() {
    super();
    if (new.target === Oracle) {
      throw new TypeError("Oracle is abstract. Please subclass to construct.");
    }
  }

  getPrice(tokenAddress) {}
}

module.exports = Oracle;
