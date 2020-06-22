const assert = require('assert');

const tf = require('@tensorflow/tfjs-node-gpu');

const GramianAngularField = require('../../src/prediction/gramianangularfield.js');

describe('Gramian Angular Field Test', () => {
    it('should match pre-computed', () => {
        let series = [0., 1., 2., 3., 4.];
        let expected = tf.tensor2d([
            [1.0, 0.5, -1.83697020e-16, -0.5, -1.],
            [0.5, -0.5, -0.866025404, -1.0, -0.5],
            [-1.83697020e-16, -0.866025404, -1., -0.866025404, 6.12323400e-17],
            [-0.5, -1.0, -0.866025404, -0.5, 0.5],
            [-1.0, -0.5, 6.12323400e-17, 0.5, 1.0]
        ]);
        assert(GramianAngularField(series).encoded.equal(expected));
    });
});
