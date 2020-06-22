const tf = require('@tensorflow/tfjs-node');


class LSTM {
    constructor(sequenceLength, sampleDims) {
        this.sequenceLength = sequenceLength;
        this.sampleDims = sampleDims;

        this.model = tf.sequential();
    }

    preprocess(sequence) {
        throw new TypeError('Method not implemented.');
    }

    predict_using(sequence) {
        throw new TypeError('Method not implemented.');
    }
}
