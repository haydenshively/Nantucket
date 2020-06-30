const tf = require("@tensorflow/tfjs-node-gpu");
const CNN = require("./cnn");
const GAF = require("./gramianangularfield");

class CNNTimeSeries extends CNN {
  constructor(imageShape, predictionShape, batchSize) {
    super(imageShape, predictionShape);
    this.batchSize = batchSize;
    this.extremes = null;
    this.dataX = [];
    this.dataY = [];
    this.isReadyToTrain = false;
    this.hasAnyRecord = false;
  }

  _preprocess(sequence) {
    const gaf = new GAF(sequence);
    return {
      input: gaf.encoded,
      output: gaf.series.slice(0, this.outputShape),
      extremes: gaf.extremes
    };
  }

  record(sequence) {
    const preprocessed = this._preprocess(sequence);
    if (this.dataX.length > 0) {
      // if any input (GAF image) exists in `dataX`, we assume that its
      // corresponding output (float array) is the beginning of `sequence`
      this.dataY.push(preprocessed.output);
    }
    // append a new GAF image to `dataX`
    const length = this.dataX.push(preprocessed.input);
    if (length > this.batchSize) {
      // if we've stored more than 1 batch's worth of images,
      // remove the oldest one
      this.dataX.shift();
      // if `isReadyToTrain` is already true, this must be the second
      // time we've run through this conditional, meaning `dataY`
      // is ready to be shifted as well
      if (this.isReadyToTrain) this.dataY.shift();
      else this.isReadyToTrain = true;
    }

    this.extremes = preprocessed.extremes;
  }

  async train() {
    if (this.isReadyToTrain) {
      const x = tf.stack(this.dataX).expandDims(-1);
      const y = tf.stack(this.dataY);

      return this.model.trainOnBatch(x, y);
    }
  }

  predictNextValueIn(sequence) {
    const preprocessed = this._preprocess(sequence);
    const gaf = preprocessed.input.expandDims().expandDims(-1);
    const extremes = preprocessed.extremes;

    let prediction = this.model.predict(gaf);
    // invert scaling operations found inside GAF class
    prediction = prediction.mul(tf.sub(extremes[1], extremes[0]));
    prediction = prediction.add(tf.add(extremes[1], extremes[0]));
    prediction = prediction.div(tf.scalar(2.0));
    return prediction
  }

  predictFromRecord() {
    if (this.extremes !== null) {
      const gaf = this.dataX[this.dataX.length - 1].expandDims().expandDims(-1);

      let prediction = this.model.predict(gaf);
      // invert scaling operations found inside GAF class
      prediction = prediction.mul(tf.sub(this.extremes[1], this.extremes[0]));
      prediction = prediction.add(tf.add(this.extremes[1], this.extremes[0]));
      prediction = prediction.div(tf.scalar(2.0));
      return prediction;
    }
  }
}

module.exports = CNNTimeSeries;
