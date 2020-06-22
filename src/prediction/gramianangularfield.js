const tf = require("@tensorflow/tfjs-node-gpu");

class GramianAngularField {
  constructor(series, min = null, max = null) {
    // MARK: - Scaling
    // convert JS array to TF tensor (1D)
    this.series = tf.tensor1d(series);
    this.length = this.series.shape[0];
    // compute min and max of series
    this.min = (min === null) ? tf.min(this.series) : tf.minimum(min, tf.min(this.series));
    this.max = (max === null) ? tf.max(this.series) : tf.maximum(max, tf.max(this.series));
    // scale series between 0 and 1
    this.series = this.series.sub(this.min);
    this.series = this.series.divNoNan(this.max);
    this.series = tf.minimum(this.series, tf.scalar(1.0));
    this.series = tf.maximum(this.series, tf.scalar(0.0));
    // scale encoded between -1 and 1
    this.encoded = this.series.mul(tf.scalar(2.0));
    this.encoded = this.encoded.sub(tf.scalar(1.0));
    // correct for floating point errors
    this.encoded = tf.minimum(this.encoded, tf.scalar(+1.0));
    this.encoded = tf.maximum(this.encoded, tf.scalar(-1.0));

    // MARK: - Polar Encoding
    const phi = tf.acos(this.encoded);
    // like meshgrid, except x and y are the same
    const x = tf.tile(phi, [this.length]).reshape([this.length, this.length]);

    this.encoded = tf.cos(tf.add(x, x.transpose())).add(1.0).div(tf.scalar(2.0));
  }
}

module.exports = GramianAngularField;
