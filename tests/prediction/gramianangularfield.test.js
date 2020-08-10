const assert = require("assert");

let tf;
try {
  tf = require("@tensorflow/tfjs-node-gpu");
} catch {
  tf = require("@tensorflow/tfjs");
}

const GramianAngularField = require("../../src/prediction/gramianangularfield.js");

describe("prediction || Gramian Angular Field Test", () => {
  it("should match pre-computed", () => {
    const series = [0, 1, 2, 3, 4];
    const expected = tf.tensor2d([
      [1.0, 0.5, 0.0, -0.5, -1],
      [0.5, -0.5, -0.866025, -1.0, -0.5],
      [0.0, -0.866025, -1, -0.866025, 0.0],
      [-0.5, -1.0, -0.866025, -0.5, 0.5],
      [-1.0, -0.5, 0.0, 0.5, 1.0]
    ]);
    const mse = new GramianAngularField(series).encoded
      .squaredDifference(expected)
      .mean();
    assert(mse.lessEqual(0.00001).arraySync());
  });
});
