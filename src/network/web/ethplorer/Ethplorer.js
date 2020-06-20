const fetch = require('node-fetch');
const url = process.env.ETHPLORER_ENDPOINT;

exports.balancesFor = async(wallet) => {
  // Set HTTP request parameters
  let params = {
    method: 'GET',
  };
  // Await JSON
  const res = await fetch(url + '/getAddressInfo/' + wallet + '?apiKey=freekey', params);
  const json = await res.json();

  let balances = {};
  balances['ETH'] = json.ETH ? json.ETH.balance : 0.0;

  const tokens = json.tokens;
  tokens.forEach((token) => {
    if (token) {
      const decimals = token.tokenInfo.decimals.toString();
      balances[token.tokenInfo.symbol] = token.balance / Number('1e' + decimals);
    }
  });

  return balances;
};
