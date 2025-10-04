const fs = require('fs');

class ShiftProcessor {
    constructor({ wallets = {}, sideshiftConfig, currencySetting = { currency: "USD", USD_REFERENCE_COIN: "USDT-bsc" } }) {
        // Initialize Sideshift API
        try {
            const SideshiftAPI = require(sideshiftConfig.path);
            this.sideshift = new SideshiftAPI({
                secret: sideshiftConfig.secret,
                id: sideshiftConfig.id,
                commissionRate: sideshiftConfig.commissionRate,
                verbose: sideshiftConfig.verbose
            });
        } catch (error) {
            console.error('Error initializing Sideshift API:', error);
            const err = 'Error initializing Sideshift API:' + error;
            throw err;
        }

        // Use same verbose config 
        this.verbose = sideshiftConfig.verbose;

        // set variables, shop locale data, coins list and wallets
        this.availableCoins = null;
        this.lastCoinList = [];
        this.USD_CoinsList = null;

        this.WALLETS = wallets;
        this.MAIN_COIN = Object.keys(this.WALLETS)[0] || "no_wallet";
        this.SECONDARY_COIN = Object.keys(this.WALLETS)[1] || "no_wallet";
        this.SHOP_SETTING = currencySetting;

        // IP regex
        this.ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        this.ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

        // Base URL for USD exhange rate
        this.EXCHANGE_RATE_API_URL = "https://api.exchangerate-api.com/v4/latest/" + this.SHOP_SETTING.currency;
    }

    // IP address validation
    _isValidIPv4(ip) {
        if (!this.ipv4Regex.test(ip)) return false;

        const octets = ip.split('.');
        for (const octet of octets) {
            const num = parseInt(octet, 10);
            if (num < 0 || num > 255) {
                return false;
            }
        }
        return true;
    }

    extractIPInfo(ipAddress) {
        const result = {
            full: ipAddress,
            type: null,
            address: null,
        };
        const errorMessage = 'Error extractIPInfo - invalid IP address:'
        if (ipAddress.startsWith('::ffff:')) {
            const ipv4Part = ipAddress.substring(7);
            if (!this._isValidIPv4(ipv4Part)) {
                result.type = "Local unknow";
                result.address = "1.1.1.1"; // Set a virtual IP for local testing
                if (this.verbose) console.log(errorMessage, new Date(), result);
                return result;
            }
            ipAddress = ipv4Part;
        }

        if (ipAddress === "127.0.0.1" || ipAddress === "::1") {
            result.type = "local";
            result.address = "123.123.123.123"; // Set a virtual IP for local testing
            return result;

        } else if (ipAddress.includes('.')) {
            if (!this._isValidIPv4(ipAddress)) {
                result.type = "Unknow";
                if (this.verbose) console.log(errorMessage, new Date(), result);
                return result;
            }

            result.type = "IPv4";
            result.address = ipAddress;

        } else if (ipAddress.includes(':')) {
            if (!this.ipv6Regex.test(ipAddress)) throw new Error("invalid IP address");
            result.type = "IPv6";
            result.address = ipAddress;

        } else {
            result.type = "Unknow";
            if (this.verbose) console.log(errorMessage, new Date(), result);
            return result;
        }

        return result;
    }

    // Sanitize input
    sanitizeStringInput(input) {
        if (!input || typeof input !== 'string') {
            return '';
        }

        let sanitized = input.replace(/[^a-zA-Z0-9\-\.]/g, '');
        if (sanitized.length === 0) {
            return '';
        }

        sanitized = sanitized.substring(0, 50);
        return sanitized;
    }

    sanitizeNumberInput(input) {
        if (!input) {
            return null;
        }

        const num = Number(input);

        if (isNaN(num)) {
            return null;
        }

        return num;
    }

    // Test witch wallet should be used
    getDestinationWallet(inputCoin) {
        if (inputCoin === this.MAIN_COIN) {
            return this.WALLETS[this.SECONDARY_COIN];
        }
        return this.WALLETS[this.MAIN_COIN];
    }

    // Get the Usd conversion rate
    async getFiatExchangeRate() {
        try {
            const getRates = await fetch(this.EXCHANGE_RATE_API_URL, {
                headers: { "Content-Type": "application/json" },
                method: "GET"
            });

            if (!getRates.ok) {
                throw new Error(`HTTP error! status: ${getRates.status}`);
            }

            const ratesObj = await getRates.json();
            return Number(ratesObj.rates.USD);
        } catch (error) {
            if (this.verbose) console.error('Error in getFiatExchangeRate:', error);
            throw error;
        }
    }

    // Used for ratio estimation - Select alternative network for same coin if both deposit and settle are equal
    _getAlternativeUSDCoin(inputCoin) {
        const network = inputCoin.split('-')[1];
        // Find coins with the same network
        const sameNetworkCoins = this.USD_CoinsList.filter(coin => {
            const [, coinNetwork] = coin.split('-');
            return coinNetwork === network;
        });

        // If we found coins with the same network, return the first one that's different from reference
        if (sameNetworkCoins.length > 0) {
            const alternativeCoin = sameNetworkCoins.filter(coin => coin !== inputCoin);
            if (alternativeCoin.length > 0) {
                return alternativeCoin[0];
            }
        }

        // If no alternative found in same network, check for other networks
        const preferredNetworks = ['avax', 'bsc', 'polygon', 'tron', 'solana'];
        const preferredCoin = this.USD_CoinsList.filter(coin => preferredNetworks.includes(coin.split('-')[1]) && network != coin.split('-')[1]);

        return preferredCoin[0] || null;
    }

    // Test is coin is USD stable coin
    _isUsdBased(coin) {
        return coin && String(coin).toUpperCase().includes('USD');
    }

    // Get exchange ratio betwwen 2 coins
    async _getRatio(referenceCoin, depositCoin, settleCoin) {
        if (!referenceCoin || !depositCoin || !settleCoin) {
            throw new Error('Missing required parameters for _getRatio');
        }

        const isDepositUsd = this._isUsdBased(depositCoin);
        const isSettleUsd = this._isUsdBased(settleCoin);

        // if referenceCoin is equal to settleCoin then is an alternative coin to get ratio
        if (referenceCoin === settleCoin) {
            const alternativeCoin = this._getAlternativeUSDCoin(settleCoin);
            if (!alternativeCoin) {
                throw new Error(`Cannot shift between the same coin network pair: ${depositCoin} ${settleCoin}`);
            }
            return await this.sideshift.getPair(alternativeCoin, settleCoin);

            //if depositCoin and settleCoin === USD coin then ratio should be 1, using API gives 0.9845
        } else if (isDepositUsd && isSettleUsd) {
            return { rate: 1 };

            //if depositCoin is USD then use it, else use reference coin.
        } else if (isDepositUsd && depositCoin !== referenceCoin) {
            return await this.sideshift.getPair(depositCoin, settleCoin);

        } else {
            return await this.sideshift.getPair(referenceCoin, settleCoin);
        }
    }

    // Convert FIAT amount into Cryptocurrency amout
    async getAmountToShift(amountToShift, depositCoin, settleCoin) {
        if (!amountToShift || isNaN(amountToShift)) {
            throw new Error('Invalid amount to shift');
        }

        const referenceCoin = this.SHOP_SETTING.USD_REFERENCE_COIN;
        if (!referenceCoin || !depositCoin || !settleCoin) {
            throw new Error('Missing required parameters for getAmountToShift');
        }

        let amount;

        // Convert FIAT to USD
        const fiatExchangeRate = await this.getFiatExchangeRate();
        let amountFiat = Number(amountToShift) * fiatExchangeRate;
        amountFiat = amountFiat * 1.0002; // total + 0.02% to compensate shift and network cost.

        // Test is settleCoin is a stable coin
        if (this._isUsdBased(settleCoin)) {
            amount = amountFiat;
        } else {
            // If not stable coin then calculate appropriate ratio for the shift
            const ratio = await this._getRatio(referenceCoin, depositCoin, settleCoin);

            if (!ratio || !ratio.rate) {
                throw new Error('Failed to get exchange rate');
            }

            amount = Number(amountFiat) * Number(ratio.rate);
            // console.log('Debug:', { amountFiat, rate: ratio.rate, result: amount });
        }

        return Number(amount).toFixed(8);
    }


    // Call Sideshift module to get quote and create a fixed rate shift
    async createFixedShift(depositCoin, depositNetwork, amountFiat, userIp = null) {
        try {
            if (!depositCoin || !depositNetwork || !amountFiat) {
                throw new Error('Missing required parameters for createFixedShift');
            }

            const depositCoinNetwork = `${depositCoin}-${depositNetwork}`;
            const settleData = this.getDestinationWallet(depositCoinNetwork);
            const settleCoinNetwork = settleData.coin + "-" + settleData.network;

            let settleAmount;

            try {
                settleAmount = await this.getAmountToShift(amountFiat, depositCoinNetwork, settleCoinNetwork);
            } catch (error) {
                throw new Error(`Failed to calculate amount: ${error.message}`);
            }

            // Request quote data
            let quoteData = await this.sideshift.requestQuote({
                depositCoin: depositCoin,
                depositNetwork: depositNetwork,
                settleCoin: settleData.coin,
                settleNetwork: settleData.network,
                depositAmount: null,
                settleAmount: Number(settleAmount),
                ...(userIp && { "userIp": userIp })

            });

            // Request shift data
            let shiftData;
            if (!quoteData.error) {
                let settleMemo = null;
                if (settleData.isMemo[0]) settleMemo = String(settleData.isMemo[1]);
                shiftData = await this.sideshift.createFixedShift({
                    settleAddress: settleData.address,
                    quoteId: quoteData.id,
                    ...(settleData.isMemo[0] && { "settleMemo": String(settleData.isMemo[1]) }),
                    // ...(refundAddress && { refundAddress }),
                    // ...(refundMemo && { refundMemo }),
                    ...(userIp && { "userIp": userIp })
                });
            }

            // Security check settleAmount, depositCoin, depositNetwork and settleAddress
            if (Number(settleAmount) !== Number(shiftData.settleAmount)) throw new Error(`Wrong settleAmount: ${settleAmount} != ${shiftData.settleAmount}`);
            if (settleData.coin !== shiftData.settleCoin) throw new Error(`Wrong settleCoin: ${settleData.coin} != ${shiftData.settleCoint}`);
            if (settleData.network !== shiftData.settleNetwork) throw new Error(`Wrong settleNetwork: ${settleData.network} != ${shiftData.settleNetwork}`);
            if (settleData.address !== shiftData.settleAddress) throw new Error(`Wrong settleAddress: ${settleData.address} != ${shiftData.settleAddress}`);

            return shiftData;
        } catch (err) {
            const error = new Error(err.message || 'Failed to create fixed shift')
            error.original = err;
            if (this.verbose) console.error('createFixedShift failed:', error);
            throw error;
        }
    }



    // Call Sideshift module to get quote and create a fixed rate shift
    async createFixedShiftManual({depositCoin, depositNetwork, amountFiat, settleAddress, settleCoin, settleNetwork, settleMemo, userIp = null}) {
        try {
            if (!depositCoin || !depositNetwork || !amountFiat) {
                throw new Error('Missing required parameters for createFixedShift');
            }

            const depositCoinNetwork = `${depositCoin}-${depositNetwork}`;
            const settleCoinNetwork = `${settleCoin}-${settleNetwork}`;

            let settleAmount;

            try {
                settleAmount = await this.getAmountToShift(amountFiat, depositCoinNetwork, settleCoinNetwork);
            } catch (error) {
                throw new Error(`Failed to calculate amount: ${error.message}`);
            }


            // Request quote data
            let quoteData = await this.sideshift.requestQuote({
                depositCoin: depositCoin,
                depositNetwork: depositNetwork,
                settleCoin: settleCoin,
                settleNetwork: settleNetwork,
                depositAmount: null,
                settleAmount: Number(settleAmount),
                ...(userIp && { "userIp": userIp })

            });

            // Request shift data
            let shiftData;
            if (!quoteData.error) {

                shiftData = await this.sideshift.createFixedShift({
                    settleAddress: settleAddress,
                    quoteId: quoteData.id,
                    ...(settleMemo && { "settleMemo": String(settleMemo) }),
                    // ...(refundAddress && { refundAddress }),
                    // ...(refundMemo && { refundMemo }),
                    ...(userIp && { "userIp": userIp })
                });
            }

            // Security check settleAmount, depositCoin, depositNetwork and settleAddress
            if (Number(settleAmount) !== Number(shiftData.settleAmount)) throw new Error(`Wrong settleAmount: ${settleAmount} != ${shiftData.settleAmount}`);
            if (settleCoin !== shiftData.settleCoin) throw new Error(`Wrong settleCoin: ${settleCoin} != ${shiftData.settleCoint}`);
            if (settleNetwork !== shiftData.settleNetwork) throw new Error(`Wrong settleNetwork: ${settleNetwork} != ${shiftData.settleNetwork}`);
            if (settleAddress !== shiftData.settleAddress) throw new Error(`Wrong settleAddress: ${settleAddress} != ${shiftData.settleAddress}`);

            return shiftData;
        } catch (err) {
            const error = new Error(err.message || 'Failed to create fixed shift')
            error.original = err;
            if (this.verbose) console.error('createFixedShift failed:', error);
            throw error;
        }
    }




      // return array of available USD coins
    _filterUsdCoinsAndNetworks(availableCoins) {
        const usdCoins = availableCoins.filter(coinNetwork =>
            coinNetwork.toUpperCase().includes('USD')
        );
        return usdCoins;
    }

    // Check if new coins is registered on sideshift API
    _hasNewCoins(current, previous) {
        const currentSet = new Set(current.map(item => item[0]));
        const previousSet = new Set(previous.map(item => item[0]));

        for (const coin of currentSet) {
            if (!previousSet.has(coin)) {
                return true;
            }
        }
        return false;
    }

    // Update Coins list and Icons
    async updateCoinsList(destination) {
        try {
            if (this.verbose) console.log('updateCoinsList function executed at:', new Date());

            const coinList = await this.sideshift.getCoins();
            const allCoins = coinList.flatMap(element => {
                const networks = element.networks.length ? element.networks : [element.mainnet];
                const hasNetworksWithMemo = element.networksWithMemo && element.networksWithMemo.length > 0;

                return networks.map(net => [
                    `${element.coin}-${net}`,
                    hasNetworksWithMemo && element.networksWithMemo.includes(net),
                ]);
            }); // return array of ['coin-network', isMemo of Memo string]

            if (this._hasNewCoins(allCoins, this.lastCoinList)) {
                if (this.verbose) console.log('New coins detected. Downloading icons...');
                await this._downloadCoinIcons(allCoins, destination);
            }

            this.lastCoinList = allCoins;
            this.availableCoins = allCoins;
            this.USD_CoinsList = this._filterUsdCoinsAndNetworks(allCoins.map(item => item[0]));

            // Generate network explorer link object

            if (this.verbose) console.log('Coins list updated successfully. Total coins:', allCoins.length);
            return { availableCoins: allCoins, lastCoinList: allCoins };
        } catch (err) {
            throw err;
        }
    }

    // Download the missing icons
    async _downloadCoinIcons(coinsList, dest) {
        try {
            const downloadDir = dest;

            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, { recursive: true });
            }

            if (this.verbose) console.log(`Starting image downloads, checking ${coinsList.length} coins...`);

            const existingFiles = new Set();
            const coinNetworks = coinsList.map(item => item[0]);

            if (fs.existsSync(downloadDir)) {
                const files = fs.readdirSync(downloadDir);
                for (const file of files) {
                    if (file.endsWith('.svg')) {
                        existingFiles.add(file.replace('.svg', ''));
                    }
                }
            }

            let count = 0;
            const totalCoins = coinNetworks.length;

            for (let i = 0; i < totalCoins; i++) {
                const coinNetwork = this.sanitizeStringInput(coinNetworks[i]);
                if (!coinNetwork) throw new Error('Invalid coin-network name');

                const filePath = `${downloadDir}/${coinNetwork}.svg`;

                if (existingFiles.has(coinNetwork)) {
                    // if (this.verbose) console.log(`✓ Already exists: ${coinNetwork}.svg`);
                    continue;
                }

                try {
                    if (this.verbose) console.log(`Downloading ${i + 1}/${totalCoins}: ${coinNetwork}`);

                    const blob = await this.sideshift.getCoinIcon(coinNetwork);
                    const buffer = Buffer.from(await blob.arrayBuffer());
                    fs.writeFileSync(filePath, buffer);

                    if (this.verbose) console.log(`✓ Saved: ${coinNetwork}.svg`);
                    count++;
                } catch (error) {
                    console.error(`✗ Failed to download ${coinNetwork}:`, error.message);
                }

                if (i < totalCoins - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            if (this.verbose) console.log('Download of ' + count + ' missing icon(s) completed!');
        } catch (error) {
            console.error('Error in _downloadCoinIcons:', error.message);
        }
    }

}


module.exports = ShiftProcessor;
