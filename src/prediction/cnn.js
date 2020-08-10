let tf;
try {
  tf = require("@tensorflow/tfjs-node-gpu");
} catch {
  tf = require("@tensorflow/tfjs");
}

class CNN {
  constructor(inputShape, outputShape) {
    this.inputShape = inputShape;
    this.outputShape = outputShape;

    this.model = tf.sequential();
  }

  build() {
    const layers = [
      ["inputLayer", this.inputShape],

      ["conv2d", 32, 3, "relu"],
      ["maxPooling2d", [2, 2], [2, 2]],
      ["dropout", 0.25],

      ["conv2d", 64, 3, "relu"],
      ["conv2d", 64, 3, "relu"],
      ["maxPooling2d", [2, 2], [2, 2]],
      ["dropout", 0.25],

      ["conv2d", 128, 3, "relu"],
      ["conv2d", 128, 3, "relu"],
      ["maxPooling2d", [2, 2], [2, 2]],

      ["flatten"],
      ["dense", this.outputShape, "linear"]
    ];

    for (let layer of layers) {
      switch (layer[0]) {
        case "inputLayer":
          this.model.add(tf.layers.inputLayer({ inputShape: layer[1] }));
          break;
        case "conv2d":
          this.model.add(
            tf.layers.conv2d({
              filters: layer[1],
              kernelSize: layer[2],
              strides: 1,
              activation: layer[3]
            })
          );
          break;
        case "maxPooling2d":
          this.model.add(
            tf.layers.maxPooling2d({ poolSize: layer[1], strides: layer[2] })
          );
          break;
        case "dropout":
          this.model.add(tf.layers.dropout({ rate: layer[1] }));
          break;
        case "flatten":
          this.model.add(tf.layers.flatten());
          break;
        case "dense":
          this.model.add(
            tf.layers.dense({ units: layer[1], activation: layer[2] })
          );
          break;
      }
    }
  }

  compile(trainingRate = 0.001) {
    this.model.compile({
      optimizer: tf.train.sgd(trainingRate),
      loss: "meanSquaredError"
    });
  }
}

module.exports = CNN;
