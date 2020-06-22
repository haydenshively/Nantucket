const tf = require("@tensorflow/tfjs-node-gpu");
const CNN = require("./cnn");
const GAF = require("./gramianangularfield");

class CNNTimeSeries extends CNN {
  constructor(imageShape, batchSize, extremes = [null, null]) {
    super(imageShape);
    this.batchSize = batchSize;
    this.extremes = extremes;
    this.dataX = [];
    this.dataY = [];
    this.isReadyToTrain = false;
  }

  _preprocess(sequence) {
    const gaf = new GAF(sequence, this.extremes[0], this.extremes[1]);
    this.extremes[0] = gaf.min;
    this.extremes[1] = gaf.max;
    return [gaf.encoded, gaf.series.slice(0, 1).dataSync()[0]];
  }

  record(sequence) {
    const preprocessed = this._preprocess(sequence);
    if (this.dataX.length > 0) {
      // if any input (GAF image) exists in `dataX`, we assume that its
      // corresponding output (float) is the first value in `sequence`
      this.dataY.push(preprocessed[1]);
    }
    // append a new GAF image to `dataX`
    const length = this.dataX.push(preprocessed[0]);
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
  }

  async train() {
    if (this.isReadyToTrain) {
      const x = tf.stack(this.dataX).expandDims(-1);
      const y = tf.tensor1d(this.dataY);

      return this.model.trainOnBatch(x, y);
    }
  }

  predictNextValueIn(sequence) {
    let prediction = this.model.predict(
      this._preprocess(sequence)
        .expandDims()
        .expandDims(-1)
    );
    prediction = prediction.asScalar().dataSync()[0];
    prediction *= this.extremes[1];
    prediction += this.extremes[0];
    return prediction;
  }

  predictFromRecord() {
    let prediction = this.model.predict(
      this.dataX[this.dataX.length - 1].expandDims().expandDims(-1)
    );
    prediction = prediction.mul(this.extremes[1]);
    prediction = prediction.add(this.extremes[0]);
    prediction = prediction.asScalar().dataSync()[0];
    return prediction;
  }
}

module.exports = CNNTimeSeries;
