export async function forAllProviders (instances, methodName, args, test) {
  // @ts-ignore
  for (let chain in global.web3) {
    const caller = instances[chain][methodName](args);
    // @ts-ignore
    test(await caller(global.web3[chain]));
  }
}

export async function forAllTokens(instances, methodName, args, test) {
  // @ts-ignore
  for (let chain in global.web3) {
    for (let symbol in instances[chain]) {
      if (!symbol.startsWith("c")) continue;

      const caller = instances[chain][symbol][methodName](args);
      // @ts-ignore
      test(await caller(global.web3[chain]));
    }
  }
};
