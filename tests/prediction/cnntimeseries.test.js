const assert = require("assert");

let tf;
try {
  tf = require("@tensorflow/tfjs-node-gpu");
} catch {
  tf = require("@tensorflow/tfjs");
}

const CNNTimeSeries = require("../../src/prediction/cnntimeseries.js");

describe("prediction || CNN Time Series Test", () => {
  (inCI ? xit : it)("should match saved architecture", async function() {
    const cnn = new CNNTimeSeries([40, 40, 1], 5, 16);
    cnn.build();
    cnn.compile();

    const handler = tf.io.fileSystem(
      "./src/prediction/tfjs_artifacts/model.json"
    );
    const cnn_saved = await tf.loadLayersModel(handler);

    let a = "";
    let b = "";

    await new Promise((resolve, reject) => {
      cnn.model.summary(undefined, undefined, res => {
        a = a.concat(res.includes("[") ? res.split("[")[1] : "");
        if (res.includes("Non-trainable params")) resolve();
      });
    });

    await new Promise((resolve, reject) => {
      cnn_saved.summary(undefined, undefined, res => {
        b = b.concat(res.includes("[") ? res.split("[")[1] : "");
        if (res.includes("Non-trainable params")) resolve();
      });
    });

    assert(a === b);
  });

  (inCI ? xit : it)("should learn sloped cos in 600 steps", async function() {
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

  (inCI ? xit : it)("should learn square wave in 700 steps", async function() {
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

  (inCI ? xit : it)("should trnsfr learn |cos| in 200 steps", async function() {
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
