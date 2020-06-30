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

    let loss;

    let sequence = Array(40);
    for (let i = 0; i < sequence.length; i++) sequence[i] = 0.0;
    for (let i = 0; i < 600; i++) {
      cnn.record(sequence);
      loss = await cnn.train();

      sequence.push(i + 20 * Math.cos(i / 100.0));
      sequence.shift();
    }

    assert(loss < 0.1);
  }).timeout(60000);

  it("should learn square wave in 700 steps", async function() {
    const cnn = new CNNTimeSeries([40, 40, 1], 5, 16);
    cnn.build();
    cnn.compile(0.01);

    let pred;

    let sequence = Array(40);
    for (i = 0; i < sequence.length; i++) sequence[i] = 0.0;
    for (i = 0; i < 700; i++) {
      cnn.record(sequence);
      const loss = await cnn.train();
      pred = cnn.predictFromRecord();

      sequence.push(i % 10 > 5 ? 20.0 : -20.0);
      sequence.shift();
    }

    assert(
      tf
        .min(pred)
        .less(-18.0)
        .toBool()
        .arraySync() &&
        tf
          .max(pred)
          .greater(18.0)
          .toBool()
          .arraySync()
    );
  }).timeout(60000);

  it("should transfer learn abs(cos) in 200 steps", async function() {
    const cnn = new CNNTimeSeries([40, 40, 1], 5, 16);
    const handler = tf.io.fileSystem(
      "./src/prediction/tfjs_artifacts/model.json"
    );
    cnn.model = await tf.loadLayersModel(handler);
    cnn.compile(0.01);

    let loss;

    let sequence = Array(40);
    for (i = 0; i < sequence.length; i++) sequence[i] = 0.0;
    for (i = 0; i < 200; i++) {
      cnn.record(sequence);
      loss = await cnn.train();

      sequence.push(Math.abs(Math.cos(i / 10.0)));
      sequence.shift();
    }

    assert(loss < 0.02);
  }).timeout(60000);
});
