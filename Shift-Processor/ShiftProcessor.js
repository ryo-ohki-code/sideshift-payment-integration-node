const fs = require('fs');
const Helpers = require('./helpers.js')

class ShiftProcessor {
    constructor({ wallets = {}, sideshiftConfig, currencySetting = { currency: "USD", USD_REFERENCE_COIN: "USDT-bsc", SHIF_LIMIT_USD: 20000 } }) {
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

        try {
            this.helper = new Helpers();
        } catch (error) {
            console.error('Error initializing Helpers:', error);
            const err = 'Error initializing Helpers:' + error;
            throw err;
        }

        // set variables, shop locale data, coins list and wallets
        this.availableCoins = null;
        this.rawCoinList = null;
        this.lastCoinList = [];
        this.stableCoinList = null;
        this.networkLinks = {};

        this.WALLETS = wallets;

        this.MAIN_COIN = Object.keys(this.WALLETS)[0] || "no_wallet";
        this.SECONDARY_COIN = Object.keys(this.WALLETS)[1] || "no_wallet";
        this.CURRENCY_SETTING = currencySetting;
        this.DECIMAL = 6;

        this.ALTERNATIVE = {};
        this.ALTERNATIVE.COIN = "BNB";
        this.ALTERNATIVE.NETWORK = "bsc";
        this.ALTERNATIVE.COIN_NETWORK = "BNB-bsc";
        
        // Use same verbose config as SideShift API
        this.verbose = sideshiftConfig.verbose;
    }

    _lockNoWallet(functionName) {
        // if (this.MAIN_COIN === "no_wallet" || this.SECONDARY_COIN === "no_wallet") {
        if (this.MAIN_COIN === "no_wallet") {
            throw new Error(`No wallet set, function ${functionName} unavailable. Set WALLET to use.`)
        }
    }

    _safeMultiply(a, b, decimals = this.DECIMAL) {
        return parseFloat((a * b).toFixed(decimals));
    }

    isSettleCoinOnline() {
        this._lockNoWallet("isSettleCoinOnline");

        let is_MAIN_COIN_available = false;
        let is_SECONDARY_COIN_available = false;

        this.rawCoinList.forEach(element => {
            const networks = element.networks.length ? element.networks : [element.mainnet];
            // const hasNetworksWithMemo = element.networksWithMemo && element.networksWithMemo.length > 0;
            // const isCoinAvailable = element.depositOffline === false;

            networks.forEach(net => {
                if (`${element.coin}-${net}` === this.MAIN_COIN) {
                    is_MAIN_COIN_available = element.settleOffline === false;
                }
                if (`${element.coin}-${net}` === this.SECONDARY_COIN) {
                    is_SECONDARY_COIN_available = element.settleOffline === false;
                }
            });
        });

        return [is_MAIN_COIN_available, is_SECONDARY_COIN_available];
    }

    // Test witch wallet should be used
    getSettleWallet(inputCoin) {
        this._lockNoWallet("getSettleWallet");

        // Test if WALLETS are available, settleOffline = false
        const areWalletsOnline = this.isSettleCoinOnline();
        if (inputCoin === this.MAIN_COIN) {
            if (areWalletsOnline[1] !== true) throw new Error('Cannot set Settle Wallet, try again later');
            return this.WALLETS[this.SECONDARY_COIN];
        }
        if (areWalletsOnline[0] !== true) throw new Error('Cannot set Settle Wallet for the moment, try again later');

        return this.WALLETS[this.MAIN_COIN];
    }

    // Get exchange ratio betwwen 2 coins in different condition
    async _getRatio(referenceCoin, depositCoin, settleCoin) {
        if (!referenceCoin || !depositCoin || !settleCoin) {
            throw new Error('Missing required parameters for _getRatio');
        }

        const isDepositUsd = this.helper.isUsdStableCoin(depositCoin);

        if (isDepositUsd && depositCoin !== settleCoin) {
            return await this.sideshift.getPair(depositCoin, settleCoin);
        } else if (depositCoin === settleCoin && referenceCoin === settleCoin) {
            const alternativeCoin = this.helper.getAlternativeUSDCoin(settleCoin);
            return await this.sideshift.getPair(alternativeCoin, settleCoin);

        } else {
            return await this.sideshift.getPair(referenceCoin, settleCoin);

        }
        
    }

    // Convert FIAT amount into Cryptocurrency amout
    async calculateCryptoFromFiat(amountToShift, depositCoinNetwork, settleCoinNetwork) {
        if (!amountToShift || isNaN(amountToShift)) {
            throw new Error(`Invalid amount to shift: ${amountToShift}`);
        }
        const parsedAmount = parseFloat(amountToShift);
        if (isNaN(parsedAmount)) {
            throw new Error(`Invalid amount to shift: ${parsedAmount}`);
        }
        if (parsedAmount <= 0) {
            throw new Error('Amount to shift must be greater than zero');
        }

        if (parsedAmount > this.CURRENCY_SETTING.SHIF_LIMIT_USD) {
            throw new Error('Amount to shift must be lower than 20000 USD');
        }

        const referenceCoin = this.CURRENCY_SETTING.USD_REFERENCE_COIN;
        if (!referenceCoin || !depositCoinNetwork || !settleCoinNetwork) {
            throw new Error('Missing required parameters for calculateCryptoFromFiat');
        }

        let amount;

        // Convert FIAT to USD
        const fiatExchangeRate = await this.helper.getCurrencyConvertionRate(this.CURRENCY_SETTING.currency);
        // let amountFiat = Number(amountToShift) * fiatExchangeRate;
        // amountFiat = amountFiat * 1.0002;

        let amountFiat = parsedAmount * fiatExchangeRate;
        amountFiat = this._safeMultiply(amountFiat, 1.0002, this.DECIMAL); // total + 0.02% to compensate shift and network cost.

        // Test is settleCoin is a stable coin
        if (this.helper.isUsdStableCoin(settleCoinNetwork)) {
            amount = amountFiat;
        } else {
            // If not stable coin then calculate appropriate ratio for the shift
            const ratio = await this._getRatio(referenceCoin, depositCoinNetwork, settleCoinNetwork);

            if (!ratio || !ratio.rate) {
                throw new Error('Failed to get exchange rate');
            }

            amount = this._safeMultiply(amountFiat, ratio.rate, 6);
            // console.log('Debug:', { amountFiat, rate: ratio.rate, result: amount });
        }

        return parseFloat(amount.toFixed(this.DECIMAL));
    }

    // Convert an USD amount to a settle coin-network cryptocurrency amount
    async usdToSettleAmount(amountFiat, settleCoin, settleNetwork) {
        if (!amountFiat || isNaN(Number(amountFiat))) {
            throw new Error(`Invalid fiat amount: ${amountFiat}`);
        }

        const settleCoinNetwork = this.helper.getCoinNetwork(settleCoin, settleNetwork);
        const settleAmount = this.calculateCryptoFromFiat(amountFiat, this.CURRENCY_SETTING.USD_REFERENCE_COIN, settleCoinNetwork);

        return settleAmount;
    }

    // Call with fiat amount and deposit coin-network it return all data needed to create a shift (with converted fiat to crypto amount)
    async getSettlementData(amountFiat, depositCoinNetwork) {
        const isValidCoin = this.helper.isCoinValid(depositCoinNetwork);
        if (!isValidCoin) throw new Error('Invalid deposit Coin or Network')

        const [depositCoin, depositNetwork] = depositCoinNetwork.split('-');

        const settleData = this.getSettleWallet(depositCoinNetwork);
        const settleCoinNetwork = this.helper.getCoinNetwork(settleData.coin, settleData.network);

        let settleAmount;
        try {
            settleAmount = await this.calculateCryptoFromFiat(amountFiat, depositCoinNetwork, settleCoinNetwork);
        } catch (error) {
            throw new Error(`Failed to calculate amount: ${error.message}`);
        }

        const getPairData = await this.isShiftAvailable(depositCoin, depositNetwork, settleData.coin, settleData.network, settleAmount);

        return { settleData: settleData, settleAmount: settleAmount, pairData: getPairData }
    }


    // Test if amount is min < amount < max and return pair data
    async testMinMaxDeposit(depositCoinNetwork, settleCoinNetwork, settleAmount) {
        const getPairData = await this.sideshift.getPair(depositCoinNetwork, settleCoinNetwork);

        const calculatedDepositAmount = Number(settleAmount / Number(getPairData.rate));

        if (Number(getPairData.min) > calculatedDepositAmount) {
            throw new Error(`Amount ${calculatedDepositAmount} is below the minimum of ${getPairData.min} ${getPairData.depositCoin} required to create a shift`);
        }
        if (Number(getPairData.max) < calculatedDepositAmount) {
            throw new Error(`Amount ${calculatedDepositAmount} is above the maximum of ${getPairData.max} ${getPairData.depositCoin} required to create a shift`);
        }
        return getPairData;
    }

    // Group all tests to verify shift availability
    async isShiftAvailable(depositCoin, depositNetwork, settleCoin, settleNetwork, settleAmount = null) {
        const depositCoinNetwork = this.helper.getCoinNetwork(depositCoin, depositNetwork);
        const settleCoinNetwork = this.helper.getCoinNetwork(settleCoin, settleNetwork);

        if (this.verbose) console.log(`Testing Shift from ${depositCoinNetwork} to ${settleCoinNetwork}`)

        // Test if input coins are valid sideshift API coin-network
        if (!this.helper.isCoinValid(depositCoinNetwork)) throw new Error('Invalid depositCoin');
        if (!this.helper.isCoinValid(settleCoinNetwork)) throw new Error('Invalid settleCoin');

        // Test if deposit and settle are online
        const isOnline = this.helper.isSettleOnline(depositCoin, depositNetwork, settleCoin, settleNetwork);
        if (!isOnline.isShiftOnline) {
            throw new Error(`isShiftAvailable: Forbiden shift. Deposit Offline: ${isOnline.isDepositOffline}, Settle Offline: ${isOnline.isSettleOffline}`);
        }

        // Test Min/Max deposit amount and get rate
        let getPairData = null;
        if (settleAmount) {
            getPairData = await this.testMinMaxDeposit(depositCoinNetwork, settleCoinNetwork, settleAmount);
        }

        if (this.verbose) console.log(`Shift from ${depositCoinNetwork} to ${settleCoinNetwork} - Online`)
        return getPairData;
    }

    // Validate required input for createCryptocurrencyPayment createFixedShiftFromUsd createVariableShift payWithSameCoin
    validateRequiredInputs(depositCoin, depositNetwork, amountFiat = null) {
        this.helper.validateString(depositCoin);
        this.helper.validateString(depositNetwork);
        if (amountFiat) this.helper.validateNumber(amountFiat);
    }

    // Security check settleAmount, depositCoin, depositNetwork and settleAddress
    _securityValidation({settleCoin, settleNetwork, settleAddress, settleAmount = null, shift}){
        if(settleAmount){
            const epsilon = 1e-6; // tolerance for comparison
            if (Math.abs(Number(settleAmount) - Number(shift.settleAmount)) > epsilon) {
                throw new Error(`Wrong settleAmount: ${settleAmount} != ${shift.settleAmount}`);
            }
            // if (Number(settleAmount) !== Number(shiftData.settleAmount)) throw new Error(`Wrong settleAmount: ${settleAmount} != ${shiftData.settleAmount}`);
        }

        if (settleCoin.toLowerCase() !== shift.settleCoin.toLowerCase()) throw new Error(`Wrong settleCoin: ${settleCoin} != ${shift.settleCoin}`);
        if (settleNetwork.toLowerCase() !== shift.settleNetwork.toLowerCase()) throw new Error(`Wrong settleNetwork: ${settleNetwork} != ${shift.settleNetwork}`);
        if (settleAddress.toLowerCase() !== shift.settleAddress.toLowerCase()) throw new Error(`Wrong settleAddress: ${settleAddress} != ${shift.settleAddress}`);

    }


    // Shift function

    // Chechout function, simpliest way: SideShift will process everyting on https://pay.sideshift.ai/checkout/${checkoutData.id} page
    async requestCheckout({
        settleCoin,
        settleNetwork,
        settleAddress,
        settleAmount,
        successUrl,
        cancelUrl,
        settleMemo = null,
        externalId = null,
        userIp = null,
    }) {
        if (!settleCoin || !settleNetwork || !settleAddress || !settleAmount || !successUrl || !cancelUrl) {
            throw new Error('Missing required parameters for requestCheckout');
        }

        // Request chechout data
        let checkoutData;
        try {
            checkoutData = await this.sideshift.createCheckout({
                settleCoin,
                settleNetwork,
                settleAddress,
                settleAmount: Number(settleAmount),
                successUrl,
                cancelUrl,
                ...(settleMemo && { "settleMemo": String(settleMemo) }),
                ...(externalId && { "externalId": externalId }),
                ...(userIp && { "userIp": userIp })
            });
            checkoutData.link = `https://pay.sideshift.ai/checkout/${checkoutData.id}`;
        } catch (error) {
            if(this.verbose) console.log('Error requestCheckout: ', error)
            throw new Error(`requestCheckout: Error creating Chechout: ${settleAddress} - ${settleAmount} ${settleCoin} (${settleNetwork})\n${successUrl}\n${cancelUrl}\n${error?.message}`, error)
        }

        return checkoutData;
    }

    // Create variable shift
    async createVariableShift({ depositCoin, depositNetwork, refundAddress = null, refundMemo = null, userIp = null, externalId = null }) {
        try {
            this.validateRequiredInputs(depositCoin, depositNetwork)

            if (!depositCoin || !depositNetwork) {
                throw new Error('Missing required parameters for createVariableShift');
            }

            const depositCoinNetwork = this.helper.getCoinNetwork(depositCoin, depositNetwork);;
            const data = await this.getSettlementData("200", depositCoinNetwork); // to get settle wallet

            // Test if the shift is possible before processing
            await this.isShiftAvailable(depositCoin, depositNetwork, settleCoin, settleNetwork);

            // Request variable shift
            const shiftData = await this.sideshift.createVariableShift({
                settleAddress: data.settleData.address,
                settleCoin: data.settleData.coin,
                settleNetwork: data.settleData.network,
                depositCoin: depositCoin,
                depositNetwork: depositNetwork,
                ...(refundAddress && { refundAddress }),
                ...(data.settleData.isMemo[0] && { "settleMemo": String(data.settleData.isMemo[1]) }),
                ...(refundMemo && { refundMemo }),
                ...(userIp && { "userIp": userIp }),
                ...(externalId && { "externalId": externalId })

            });

            // Security check settleAmount, depositCoin, depositNetwork and settleAddress
            this._securityValidation({settleCoin: data.settleData.coin, settleNetwork: data.settleData.network, settleAddress: data.settleData.address, shift: shiftData});
            // if (data.settleData.coin.toLowerCase() !== shiftData.settleCoin.toLowerCase()) throw new Error(`Wrong settleCoin: ${data.settleData.coin} != ${shiftData.settleCoint}`);
            // if (data.settleData.network.toLowerCase() !== shiftData.settleNetwork.toLowerCase()) throw new Error(`Wrong settleNetwork: ${data.settleData.network} != ${shiftData.settleNetwork}`);
            // if (data.settleData.address.toLowerCase() !== shiftData.settleAddress.toLowerCase()) throw new Error(`Wrong settleAddress: ${data.settleData.address} != ${shiftData.settleAddress}`);

            return shiftData;
        } catch (err) {
            const error = new Error(err.message || 'Failed to create variable shift')
            error.original = err;
            if (this.verbose) console.error('createVariableShift failed:', error);
            throw error;
        }
    }

    // Create a fixed shift in 1 step
    async requestQuoteAndShift({
        depositCoin,
        depositNetwork,
        settleCoin,
        settleNetwork,
        settleAddress,
        settleMemo = null,
        depositAmount = null,
        settleAmount = null,
        refundAddress = null,
        refundMemo = null,
        externalId = null,
        userIp = null,
    }) {

        if (!depositCoin || !depositNetwork || !settleCoin || !settleNetwork || !settleAddress || (!depositAmount && !settleAmount)) {
            throw new Error('Missing required parameters for requestQuoteAndShift');
        }

        if (settleAmount && settleAmount <= 0 || depositAmount && depositAmount <= 0) {
            throw new Error('Amount to shift must be greater than zero');
        }

        // Test if the shift is possible before processing
        await this.isShiftAvailable(depositCoin, depositNetwork, settleCoin, settleNetwork, settleAmount);

        // Deposit specific - Check for specific decimal else set at 6
        if (depositAmount) {
            const decimal = this.helper.getDecimals(depositCoin, depositNetwork);
            if (decimal && decimal != 6) {
                if (this.verbose) console.log(`Specific decimal detected for ${depositCoin} (${depositNetwork}): ${decimal}`);
                settleAmount = parseFloat(Number(settleAmount).toFixed(decimal));
            } else {
                settleAmount = parseFloat(Number(settleAmount).toFixed(this.DECIMAL));
            }
        }

        // Request quote data
        let quoteData;
        try {
            quoteData = await this.sideshift.requestQuote({
                depositCoin: depositCoin,
                depositNetwork: depositNetwork,
                settleCoin: settleCoin,
                settleNetwork: settleNetwork,
                depositAmount: depositAmount != null ? Number(depositAmount) : null,
                settleAmount: Number(settleAmount),
                ...(userIp && { "userIp": userIp })
            });
        } catch (error) {
            throw new Error(`requestQuoteAndShift: Error creating Quote: ${depositCoin} (${depositNetwork}) to ${settleAmount} ${settleCoin} (${settleNetwork})\n${error.message}`)
        }

        // Request shift data
        let shiftData;
        try {
            shiftData = await this.sideshift.createFixedShift({
                settleAddress: settleAddress,
                quoteId: quoteData.id,
                ...(settleMemo && { "settleMemo": String(settleMemo) }),
                ...(refundAddress && { refundAddress }),
                ...(refundMemo && { refundMemo }),
                ...(userIp && { "userIp": userIp }),
                ...(externalId && { "externalId": externalId })
            });
        } catch (error) {
            throw new Error(`requestQuoteAndShift: Error creating Shift from quote ${quoteData.id}: ${depositCoin} (${depositNetwork}) to ${settleAmount} ${settleCoin} (${settleNetwork})\n${error.message}`)
        }

        return shiftData;
    }

    // Create a fixed rate shift using an USD/fiat amount - Using config wallet setting
    async createCryptocurrencyPayment({ depositCoin, depositNetwork, amountFiat, refundAddress = null, refundMemo = null, userIp = null, externalId = null }) {
        try {
            this.validateRequiredInputs(depositCoin, depositNetwork, amountFiat)

            if (!depositCoin || !depositNetwork || !amountFiat) {
                throw new Error('Missing required parameters for createCryptocurrencyPayment');
            }
            
            const depositCoinNetwork = this.helper.getCoinNetwork(depositCoin, depositNetwork);
            const data = await this.getSettlementData(amountFiat, depositCoinNetwork);

            const shiftData = await this.createFixedShiftFromUsd({
                depositCoin,
                depositNetwork,
                settleCoin: data.settleData.coin,
                settleNetwork: data.settleData.network,
                settleAddress: data.settleData.address,
                amountFiat,
                ...(data.settleData.isMemo[0] && { "settleMemo": String(data.settleData.isMemo[1]) }),
                ...(refundAddress && { refundAddress }),
                ...(refundMemo && { refundMemo }),
                ...(externalId && { "externalId": externalId }),
                ...(userIp && { "userIp": userIp })
            });


            return shiftData;
        } catch (err) {
            const error = new Error(err.message || 'Failed to create fixed shift')
            error.original = err;
            if (this.verbose) console.error('createCryptocurrencyPayment failed:', error);
            throw error;
        }
    }

    // Create a fixed rate shift using an USD/fiat amount - Manual wallet setting
    async createFixedShiftFromUsd({
        depositCoin,
        depositNetwork,
        refundAddress = null,
        refundMemo = null,
        amountFiat,
        settleAddress,
        settleCoin,
        settleNetwork,
        settleMemo = null,
        externalId = null,
        userIp = null
    }) {
        try {
            this.validateRequiredInputs(depositCoin, depositNetwork, amountFiat)

            if (!depositCoin || !depositNetwork || !amountFiat) {
                throw new Error('Missing required parameters for createFixedShiftFromUsd');
            }

            const depositCoinNetwork = this.helper.getCoinNetwork(depositCoin, depositNetwork);
            const settleCoinNetwork = this.helper.getCoinNetwork(settleCoin, settleNetwork);

            // convert USD/fiat to cryptocurrency amount
            let settleAmount;
            try {
                settleAmount = await this.calculateCryptoFromFiat(amountFiat, depositCoinNetwork, settleCoinNetwork);
            } catch (error) {
                throw new Error(`Failed to calculate amount: ${error.message}`);
            }

            const shiftData = await this.requestQuoteAndShift({
                depositCoin,
                depositNetwork,
                settleCoin,
                settleNetwork,
                settleAddress,
                settleAmount: Number(settleAmount),
                ...(settleMemo && { "settleMemo": String(settleMemo) }),
                ...(refundAddress && { refundAddress }),
                ...(refundMemo && { refundMemo }),
                ...(userIp && { "userIp": userIp }),
                ...(externalId && { "externalId": externalId })
            })



            // Security check settleAmount, depositCoin, depositNetwork and settleAddress
            this._securityValidation({settleCoin, settleNetwork, settleAddress, settleAmount, shift: shiftData});

            return shiftData;
        } catch (err) {
            const error = new Error(err.message || 'Failed to create fixed shift')
            error.original = err;
            if (this.verbose) console.error('createFixedShiftFromUsd failed:', error);
            throw error;
        }
    }


    // Update coins list and svg icons
    // Generate a simplified coin list for website, keep track of previous coins list, 
    // original (raw) coins list + stableCoinList and network explorer

    // Get the available coin list
    getAvailablecoins() {
        return { availableCoins: this.availableCoins, lastCoinList: this.lastCoinList, stableCoinList: this.stableCoinList, rawCoinList: this.rawCoinList, networkExplorerLinks: this.networkLinks };
    }


    // return array of available USD coins
    _filterUsdCoinsAndNetworks(availableCoins) {
        const usdCoins = availableCoins.filter(coinNetwork =>
            coinNetwork.toUpperCase().includes('USD') || coinNetwork.toUpperCase().includes('DAI')
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

    generateNetworkExplorerLinks(data) {
        let networkLinks = {};

        data.forEach(coin => {
            coin.networks.forEach(network => {
                network = this.helper.adaptToExplorer(network);
                const baseUrl = `https://3xpl.com/${network}/address/`;
                if (network && !this.networkLinks[network]) networkLinks[network] = baseUrl;
            });
        });
        // Return object with supported explorer
        return this.helper.sortedObj(networkLinks);
    }

    // Update Coins list with or without Icons
    async updateCoinsList(destination = null) {
        try {
            if (this.verbose) console.log('updateCoinsList function executed at:', new Date());

            const coinList = await this.sideshift.getCoins();
            this.rawCoinList = coinList;

            const allCoins = coinList.flatMap(element => {
                const networks = element.networks.length ? element.networks : [element.mainnet];
                const hasNetworksWithMemo = element.networksWithMemo && element.networksWithMemo.length > 0;
                const isCoinAvailable = element.depositOffline === false && element.variableOnly === false; // Shop integration need fixed shift only

                return networks.map(net => [
                    `${element.coin}-${net}`,
                    hasNetworksWithMemo && element.networksWithMemo.includes(net),
                    isCoinAvailable
                ]);
            }); // return array of ['coin-network', isMemo of Memo string, isCoinAvailable]

            if (this._hasNewCoins(allCoins, this.lastCoinList) && destination !== null) {
                if (this.verbose) console.log('New coins detected. Downloading icons...');
                await this._downloadCoinIcons(allCoins, destination);
            }

            this.lastCoinList = allCoins;
            this.availableCoins = allCoins;
            this.stableCoinList = this._filterUsdCoinsAndNetworks(allCoins.map(item => item[0]));

            // Generate network explorer link object
            this.networkLinks = this.generateNetworkExplorerLinks(coinList);
            if (this.verbose) console.log('Coins list updated successfully. Total coins:', allCoins.length);

            // Update helper coins list
            this.helper.updateHelpersOptions({ availableCoins: allCoins, lastCoinList: allCoins, stableCoinList: this.stableCoinList, rawCoinList: coinList, networkExplorerLinks: this.networkLinks })

            return { availableCoins: allCoins, lastCoinList: allCoins, stableCoinList: this.stableCoinList, rawCoinList: coinList, networkExplorerLinks: this.networkLinks };
        } catch (err) {
            throw err;
        }
    }

    // Download the missing icons and remove deprecated ones
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

            // Determine which icons are no longer needed
            const currentCoins = new Set(coinNetworks.map(name => this.helper.sanitizeString(name)));
            const toDelete = [...existingFiles].filter(name => !currentCoins.has(name));

            if (this.verbose && toDelete.length > 0) {
                console.log(`Deleting ${toDelete.length} deprecated icon(s):`, toDelete);
            }

            // Delete deprecated icons
            for (const coinNetwork of toDelete) {
                const filePath = `${downloadDir}/${coinNetwork}.svg`;
                try {
                    fs.unlinkSync(filePath);
                    if (this.verbose) console.log(`✓ Deleted deprecated: ${coinNetwork}.svg`);
                } catch (err) {
                    console.error(`✗ Failed to delete ${coinNetwork}.svg:`, err.message);
                }
            }

            let count = 0;
            const totalCoins = coinNetworks.length;

            for (let i = 0; i < totalCoins; i++) {
                const coinNetwork = this.helper.sanitizeString(coinNetworks[i]);
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
