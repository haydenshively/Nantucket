const tf = require("@tensorflow/tfjs-node-gpu");

class GramianAngularField {
  constructor(series, extremes = [NaN, NaN]) {
    // MARK: - Scaling
    // convert JS array to TF tensor (1D)
    series = tf.tensor1d(series);
    this.length = series.shape[0];
    // compute min and max of series
    extremes[0] = tf.minimum(tf.min(series), extremes[0]);
    extremes[1] = tf.maximum(tf.max(series), extremes[1]);
    this.extremes = extremes;
    // scale series between -1 and 1
    series = series.mul(tf.scalar(2.0));
    series = series.sub(tf.add(this.extremes[1], this.extremes[0]));
    series = series.divNoNan(tf.sub(this.extremes[1], this.extremes[0]));
    // correct for floating point errors
    this.series = tf.maximum(
      tf.minimum(series, tf.scalar(+1.0)),
      tf.scalar(-1.0)
    );

    // MARK: - Polar Encoding
    const phi = tf.acos(this.series);
    const x = tf.tile(phi, [this.length]).reshape([this.length, this.length]);
    this.encoded = tf.cos(tf.add(x, x.transpose()));
  }
}

module.exports = GramianAngularField;
