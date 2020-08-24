exports.forAllProviders = async (instances, methodName, args, test) => {
  for (let net in web3s) {
    const caller = instances[net][methodName](args);
    for (let provider of web3s[net]) {
      const res = await caller(provider);
      test(res);
    }
  }
};

exports.forAllTokens = async (instances, methodName, args, test) => {
  for (let net in web3s) {
    for (let symbol in instances[net]) {
      if (!symbol.startsWith("c")) continue;

      const caller = instances[net][symbol][methodName](args);
      for (let provider of web3s[net]) test(await caller(provider));
    }
  }
}
