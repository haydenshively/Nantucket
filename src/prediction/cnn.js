const tf = require("@tensorflow/tfjs-node-gpu");

class CNN {
  constructor(inputShape) {
    this.inputShape = inputShape;

    this.model = tf.sequential();

    // block 1
    this.model.add(
      tf.layers.conv2d({
        inputShape: inputShape,
        kernelSize: 3,
        filters: 32,
        strides: 1,
        activation: "relu",
        kernelInitializer: "varianceScaling"
      })
    );
    this.model.add(
      tf.layers.maxPooling2d({ poolSize: [2, 2], strides: [2, 2] })
    );
    this.model.add(tf.layers.dropout({ rate: 0.25 }));

    // block 2
    for (let i; i < 2; i++) {
      this.model.add(
        tf.layers.conv2d({
          kernelSize: 3,
          filters: 64,
          strides: 1,
          activation: "relu",
          kernelInitializer: "varianceScaling"
        })
      );
    }
    this.model.add(
      tf.layers.maxPooling2d({ poolSize: [2, 2], strides: [2, 2] })
    );
    this.model.add(tf.layers.dropout({ rate: 0.25 }));

    // block 3
    for (let i; i < 2; i++) {
      this.model.add(
        tf.layers.conv2d({
          kernelSize: 3,
          filters: 128,
          strides: 1,
          activation: "relu",
          kernelInitializer: "varianceScaling"
        })
      );
    }
    this.model.add(
      tf.layers.maxPooling2d({ poolSize: [2, 2], strides: [2, 2] })
    );
    this.model.add(tf.layers.flatten());
    this.model.add(tf.layers.dense({ units: 1, activation: "sigmoid" }));

    // compile model
    this.model.compile({
      optimizer: tf.train.sgd(0.01),
      loss: "meanSquaredError"
    });
  }
}

module.exports = CNN;
