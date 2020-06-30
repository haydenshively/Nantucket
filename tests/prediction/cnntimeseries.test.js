const assert = require("assert");

const tf = require("@tensorflow/tfjs-node-gpu");

const CNNTimeSeries = require("../../src/prediction/cnntimeseries.js");
const { doesNotMatch } = require("assert");

describe("CNN Time Series Test", () => {
  it("should match saved architecture", async function() {
    const cnn = new CNNTimeSeries([40, 40, 1], 5, 16);
    cnn.build();
    cnn.compile();

    const handler = tf.io.fileSystem(
      "./src/prediction/tfjs_artifacts/model.json"
    );
    const cnn_saved = await tf.loadLayersModel(handler);

    let a;
    let b;
    cnn.model.summary(res => (a = res));
    cnn_saved.summary(res => (b = res));
    assert(a === b);
  });

  it("should learn sloped cosine in 600 steps", async function() {
    const cnn = new CNNTimeSeries([40, 40, 1], 5, 16);
    cnn.build();
    cnn.compile();

    let i;

    let sequence = Array(40);
    for (i = 0; i < sequence.length; i++) sequence[i] = 0.0;

    for (i = 0; i < 1000; i++) {
      cnn.record(sequence);

      const loss = await cnn.train();
      const pred = cnn.predictFromRecord();

      sequence.push(i + 20*Math.cos(i / 100.0));
      sequence.shift();

      if (loss < 1.5) break;
    }

    assert(i <= 600);
  }).timeout(60000);
});
