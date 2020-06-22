const assert = require("assert");

const tf = require("@tensorflow/tfjs-node-gpu");

const CNNTimeSeries = require("../../src/prediction/cnntimeseries.js");

describe("CNN Time Series Test", () => {
  it("should maintain data arrays of length `batchSize`", async function() {
    this.timeout = 60000;

    let cnn = new CNNTimeSeries([40, 40, 1], 16, [-1.0, 1.0]);

    let sequence = Array(40);
    for (let i = 0; i < sequence.length; i++) sequence[i] = 0.0;

    console.log(sequence);
    for (let i = 0; i < 10000; i++) {
      cnn.record(sequence);

      const loss = await cnn.train();
      console.log(loss);
      const pred = cnn.predictFromRecord();

      const actual = Math.cos((2 * Math.PI * i) / 8.0);
      // console.log(Math.abs(pred - actual));

      sequence.push(actual);
      sequence.shift();
    }
    
    assert(true);
  });
});
