class Fetchable {
  constructor() {
    if (new.target === Fetchable) {
      throw new TypeError(
        "Fetchable is abstract. Please subclass to construct."
      );
    }
  }

  async fetch(withConfig) {}
}

module.exports = Fetchable;
