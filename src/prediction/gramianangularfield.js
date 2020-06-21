const tf = require('@tensorflow/tfjs-node-gpu');

class GramianAngularField {
    constructor(series) {
        // MARK: - Scaling
        // convert JS array to TF tensor (1D)
        this.series = tf.tensor1d(series);
        this.length = this.series.shape[0];
        // compute min and max of series
        this.min = tf.min(this.series);
        this.max = tf.max(this.series);
        // compute range of series;
        this.ptp = tf.sub(this.max, this.min);
        // scale series between -1 and 1
        this.series.mul(tf.scalar(2.0));
        this.series.sub(this.ptp);
        this.series.div(this.ptp);
        // correct for floating point errors
        this.series.minimum(tf.scalar(+1.0));
        this.series.maximum(tf.scalar(-1.0));

        // MARK: - Polar Encoding
        var phi = tf.acos(this.series);
        // like meshgrid, except x and y are the same
        x = tf.tile(phi, [this.length]).reshape([this.length, this.length]);

        this.encoded = tf.cos(tf.sum(x, x.transpose()));
    }
}

module.exports = GramianAngularField;
