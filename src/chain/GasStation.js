const fetch = require('node-fetch');
const url = process.env.GAS_STATION_ENDPOINT;

const rawResponse = async () => {
  let params = {
    method: 'GET',
  };
  // Await JSON
  const res = await fetch(url, params);
  return await res.json();
};

exports.pricesHighToLow_wei = async () => {
  const json = await rawResponse();
  let prices = [];
  if (json) {
    prices = [
      (json.fastest) ? Number(json.fastest) * 1e8 : 10e9,
      (json.fast) ? Number(json.fast) * 1e8 : 5e9,
      (json.average) ? Number(json.average) * 1e8 : 2e9,
      (json.safeLow) ? Number(json.safeLow) * 1e8 : 1e9,
    ];
  }
  // prices.push(75e7);
  return prices;
};
