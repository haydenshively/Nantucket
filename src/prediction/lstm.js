class LSTM {
    constructor(sequenceLength, sampleDims) {
        this.sequenceLength = sequenceLength;
        this.sampleDims = sampleDims;
    }

    preprocess(sequence) {
        throw new TypeError('Method not implemented.');
    }

    predict_using(sequence) {
        throw new TypeError('Method not implemented.');
    }
}
