onNewLiquidation(event, logNonCandidates = false) {
    if (event.liquidator == FlashLiquidator.mainnet.address) return;
    const addr = event.borrower;
    delete this._prepared_tx_data[addr.toLowerCase()];

    if (!this._candidates.map(c => c.address).includes(addr.toLowerCase())) {
      if (logNonCandidates) {
        winston.log(
          "info",
          `⤼ *Liquidate Event* | Didn't liquidate ${addr.slice(
            0,
            6
          )} because they weren't a candidate.`
        );
      }
    } else {
      winston.log(
        "warn",
        `🚨 *Liquidate Event* | Didn't liquidate ${addr.slice(
          0,
          6
        )} due to bad logic (or gas war).`
      );
    }
  }