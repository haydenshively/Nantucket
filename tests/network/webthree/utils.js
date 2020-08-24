exports.forAllProviders = async (instances, methodName, args, test) => {
  for (let chain in web3) {
    const caller = instances[chain][methodName](args);
    test(await caller(web3[chain]));
  }
};

exports.forAllTokens = async (instances, methodName, args, test) => {
  for (let chain in web3) {
    for (let symbol in instances[chain]) {
      if (!symbol.startsWith("c")) continue;

      const caller = instances[chain][symbol][methodName](args);
      test(await caller(web3[chain]));
    }
  }
}
