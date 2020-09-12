export default class Fetchable {
  constructor() {
    if (new.target === Fetchable) {
      throw new TypeError(
        // TODO: Convert to correct TS abstract class
        "Fetchable is abstract. Please subclass to construct."
      );
    }
  }

  async fetch(withConfig) {}
}
