const Contract = require('../Contract.js');
import PRICEORACLEABI from './abis/priceoracle.json';

class PriceOracle extends Contract {
}

exports.PriceOracle = PriceOracle;
exports.mainnet = new PriceOracle(
  '0x1d8aedc9e924730dd3f9641cdb4d1b92b848b4bd',
  JSON.parse(PRICEORACLEABI.result),
);