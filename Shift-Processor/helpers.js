
class Helpers {
    constructor(options = {}) {
        const {
            availableCoins = null,
            lastCoinList = null,
            stableCoinList = null,
            rawCoinList = null,
            networkExplorerLinks = null
        } = options;

        // Coins list variables
        this.availableCoins = availableCoins;
        this.lastCoinList = lastCoinList;
        this.stableCoinList = stableCoinList
        this.rawCoinList = rawCoinList;
        this.networkLinks = networkExplorerLinks;

        // IP regex
        this.ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        this.ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

        console.log('Helpers function loaded')
    }


    updateHelpersOptions(options) {
        const {
            availableCoins = this.availableCoins,
            lastCoinList = this.lastCoinList,
            stableCoinList = this.stableCoinList,
            rawCoinList = this.rawCoinList,
            networkExplorerLinks = this.networkLinks
        } = options;

        this.availableCoins = availableCoins;
        this.lastCoinList = lastCoinList;
        this.stableCoinList = stableCoinList
        this.rawCoinList = rawCoinList;
        this.networkLinks = networkExplorerLinks;
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
    sanitizeString(input) {
        if (!input || typeof input !== 'string' || !input.trim()) {
            return null;
        }

        let sanitized = input.replace(/[^a-zA-Z0-9\-\.]/g, '');
        if (sanitized.length === 0) {
            return null;
        }

        return sanitized.trim();
    }

    sanitizeNumber(input) {
        if (!input) {
            return null;
        }
        
        if (typeof input !== 'number') {
            input = Number(input);
        }

    if (isNaN(input) || !isFinite(input)) { 
            return null;
        }
        return input;
    }

    _errorMsg(fieldName, source) {
        const error = `Error from ${source}: Missing or invalid ${fieldName} parameter`;
        return error;
    }



    // Validate input
    validateString(value, fieldName, source) {
        const sanitizedValue = this.sanitizeString(value);
        if (!sanitizedValue) {
            const error = this._errorMsg(fieldName, source);
            throw new Error(`${error}`);
        }
        return sanitizedValue;
    }

    validateNumber(value, fieldName, source) {
        const sanitizedValue = this.sanitizeNumber(value);

        if(!sanitizedValue){
            const error = this._errorMsg(fieldName, source);
            throw new Error(`${error}`);
        }

        if (sanitizedValue && value < 0) {
            throw new Error(`Error from ${source}: ${fieldName} parameter must be > 0`);
        }

        return sanitizedValue;
    }




    // Get the Usd conversion rate from other fiat currency
    async getCurrencyConvertionRate(currency) {
        try {
            const getRates = await fetch(`https://api.exchangerate-api.com/v4/latest/${currency}`, {
                headers: { "Content-Type": "application/json" },
                method: "GET"
            });

            if (!getRates.ok) {
                throw new Error(`HTTP error! status: ${getRates.status}`);
            }

            const ratesObj = await getRates.json();
            return Number(ratesObj.rates.USD);
        } catch (error) {
            if (this.verbose) console.error('Error in getCurrencyConvertionRate:', error);
            throw error;
        }
    }


    // Used for ratio estimation - Select alternative network for same coin if both deposit and settle are equal
    getAlternativeUSDCoin(inputCoin) {
        const network = inputCoin.split('-')[1];
        // Find coins with the same network
        const sameNetworkCoins = this.stableCoinList.filter(coin => {
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
        const preferredCoin = this.stableCoinList.filter(coin => preferredNetworks.includes(coin.split('-')[1]) && network != coin.split('-')[1]);

        return preferredCoin[0] || null;
    }

    // Test is coin is USD stable coin
    isUsdStableCoin(coin) {
        const coinStr = String(coin).toUpperCase();
        return coin && (coinStr.includes('USD') || coinStr.includes('DAI'));
    }

    // Return 'coin-network' formated string
    getCoinNetwork(coin, network) {
        return `${coin}-${network}`;
    }




    // Test if a coin-network if available on sideshift API need coins list from updateCoinsList availableCoins
    isCoinValid(coinNetwork) {
        if (!this.availableCoins) throw new Error('Coins list not available, use updateCoinsList() to load the list')
        const isValid = this.availableCoins.some(c => c[0].toLowerCase() === coinNetwork.toLowerCase())
        return isValid;
    }

    // TODO Test if a coin-network use memo
    isCoinMemo(coinNetwork) {
        // if (!this.availableCoins) throw new Error('Coins list not available, use updateCoinsList() to load the list')
        // const isValid = this.availableCoins.some(c => c[0].toLowerCase() === coinNetwork.toLowerCase())
        // return isValid;
    }

    // test if a coin or token
    _isToken(element) {
        const hasNetworks = element.networks && element.networks.length > 0;
        const hasTokenDetails = element.tokenDetails && Object.keys(element.tokenDetails).length > 0;

        if (!hasTokenDetails || !hasNetworks) return false;

        return hasTokenDetails && hasNetworks;
    }

    // Get the token contract address
    getTokenAddress(coin, network) {
        const element = this._findSpecificCoin(coin, network);

        if (!this._isToken) return false;

        if (!element.networks.includes(network)) return false;

        // Return contract address for the given network
        const details = element.tokenDetails[network];
        return details ? details.contractAddress : false;
    }

    // To get the contract address of a token
    // getContractAddress(coin, network) {
    //     const tokenContract = this._findSpecificCoin(coin, network);
    //     if (tokenContract && tokenContract.tokenDetails && tokenContract.tokenDetails[network]) {
    //         return tokenContract.tokenDetails[network].contractAddress;
    //     }
    //     return null;
    // }

    isThisCoinOrToken(coin, network) {
        return this._isToken(this._findSpecificCoin(coin, network));

        // return this.rawCoinList.map(coin => {
        //     const hasNetworks = coin.networks && coin.networks.length > 0;
        //     const hasTokenDetails = coin.tokenDetails && Object.keys(coin.tokenDetails).length > 0;

        //     // If it has networks but no tokenDetails, it's likely a mainnet coin
        //     // If it has tokenDetails but no networks, it's likely a token

        //     const isMain = hasNetworks && !hasTokenDetails;
        //     const isToken = hasTokenDetails && !hasNetworks;

        //     return {
        //         coin: coin.coin,
        //         name: coin.name,
        //         isMain,
        //         isToken,
        //         // Additional metadata for clarity
        //         networks: coin.networks || [],
        //         tokenDetails: coin.tokenDetails ? Object.keys(coin.tokenDetails) : []
        //     };
        // });
    }

    _findSpecificCoin(coinSymbol, network) {
        return this.rawCoinList.find(coin => {

            if (coin.coin !== coinSymbol) return null;
            if ((coin.coin === coinSymbol) && (coin.networks && coin.networks.includes(network))) return coin;

            // Check tokenDetails for the specific network
            // if (coin.tokenDetails && coin.tokenDetails[network]) {
            //     return true;
            // }

            return null;
        });
    }

    // return if deposit, settle and shift are available,
    isSettleOnline(depositCoin, depositNetwork, settleCoin, settleNetwork) {
        // Get the deposit and settle coin data
        const depositCoinData = this._findSpecificCoin(depositCoin, depositNetwork);
        const settleCoinData = this._findSpecificCoin(settleCoin, settleNetwork);

        if (!depositCoinData || !settleCoinData) {
            return false; // Coin not found
        }

        let isDepositOffline = false;
        let isSettleOffline = false;
        if (depositCoinData.depositOffline) {
            // Check if deposit network is online for the deposit coin
            isDepositOffline = depositCoinData.depositOffline?.includes(depositNetwork);

        }
        if (settleCoinData.settleOffline) {
            // Check if settle network is online for the settle coin
            isSettleOffline = settleCoinData.settleOffline?.includes(settleNetwork);
        }
        const isShiftOnline = depositCoinData.depositOffline === false && settleCoinData.settleOffline === false; // Shop integration need fixed shift only

        // Both must be online to proceed
        return { isDepositOffline, isSettleOffline, isShiftOnline };
    }




    // Get decimal for a Token
    getDecimals(coin, network) {
        // Find the coin data by coin name
        const coinData = this._findSpecificCoin(coin, network);

        if (!coinData || !coinData.tokenDetails) {
            return null;
        }

        // Check if the specific network exists in tokenDetails
        if (coinData?.tokenDetails[network]) {
            return coinData.tokenDetails[network].decimals;
        }

        return null;
    }

    // Return an object with supportedNetworks, mainnetCoins and tokenByChain
    sortCoinsAndTokens() {
        const rawCoinList = this.rawCoinList;

        // Extract all unique supported networks from the rawCoinList
        const supportedNetworks = new Set();
        rawCoinList.forEach(item => {
            if (item.networks) {
                item.networks.forEach(network => supportedNetworks.add(network));
            }
        });

        // Convert Set to Array for easier use
        const supportedNetworksArray = Array.from(supportedNetworks);

        // Separate mainnet coins and tokens
        const mainnetCoins = [];
        const tokenGroups = {}; // Group tokens by chain

        rawCoinList.forEach(item => {
            if (item.mainnet && supportedNetworks.has(item.mainnet)) {
                // This is a mainnet coin
                mainnetCoins.push(item);
            } else if (item.tokenDetails) {
                // This is a token, group by chain
                Object.keys(item.tokenDetails).forEach(chain => {
                    if (!tokenGroups[chain]) {
                        tokenGroups[chain] = [];
                    }
                    tokenGroups[chain].push({
                        ...item,
                        chain: chain // Add chain info to token
                    });
                });
            }
        });

        // Convert token groups to a more readable format (optional)
        const tokenGroupsArray = Object.keys(tokenGroups).map(chain => ({
            chain: chain,
            tokens: tokenGroups[chain]
        }));

        // console.log("Supported Networks:", supportedNetworksArray);
        // console.log("Mainnet Coins:", mainnetCoins);
        // console.log("Token Groups by Chain:", tokenGroupsArray);

        return { supportedNetworks: supportedNetworksArray, mainnetCoins: mainnetCoins, tokenByChain: tokenGroupsArray };

        // If you want a combined list with both mainnets and tokens
        // const allCoinsAndTokens = [...mainnetCoins, ...rawCoinList.filter(item => 
        //     item.tokenDetails && !item.mainnet
        // )];
        // console.log("All Coins and Tokens:", allCoinsAndTokens);

    }






    // Block explorer helpers

    // missing exlorer
    // cosmos
    // sui
    // algorand
    // hyperevm
    // sonic
    // bittensor
    // ronin
    // internal
    // sonic
    // cronos
    // sui
    // berachain
    // core
    // doge
    // fetch
    // hedera
    // near
    // algorand
    // celestia
    // icp
    // hyperevm


    getNetworkExplorer(network) {
        network = this.adaptToExplorer(network);
        return this.networkLinks && this.networkLinks[network];
    }

    adaptToExplorer(input) {
        const xplSupportedBlockchains = new Set([
            "aptos", "arbitrum-one", "avalanche", "base", "beacon-chain", "bitcoin",
            "bitcoin-cash", "blast", "bnb", "bob", "botanix", "cardano", "dash",
            "digibyte", "dogecoin", "ecash", "ethereum", "ethereum-classic", "fantom",
            "galactica-evm", "gnosis-chain", "groestlcoin", "handshake", "kusama",
            "linea", "liquid-network", "litecoin", "mantle", "merlin", "monero",
            "moonbeam", "opbnb", "optimism", "peercoin", "polkadot", "polygon",
            "polygon-zkevm", "rootstock", "scroll", "sei-evm", "solana", "stacks",
            "stellar", "ton", "tron", "xrp-ledger", "zcash", "zksync-era"
        ]);

        const blockchainAliases = {
            "arbitrum": "arbitrum-one",
            "avax": "avalanche",
            "bitcoincash": "bitcoin-cash",
            "bsc": "bnb",
            "dogecoin": "doge",
            "seievm": "sei-evm",
            "liquid": "liquid-network",
            "xec": "zcash",
            "zksyncera": "zksync-era",
            "ripple": "xrp-ledger"
        };

        const normalizedInput = input.toLowerCase();

        // Return null if not supported
        if (!xplSupportedBlockchains.has(normalizedInput) && !blockchainAliases[normalizedInput]) {
            return null;
        }

        // Apply alias mapping if needed
        return blockchainAliases[normalizedInput] || normalizedInput;
    }

    sortedObj(originalObject) {
        const sortedObj = {};
        const sortedKeys = Object.keys(originalObject).sort();
        sortedKeys.forEach(key => {
            sortedObj[key] = originalObject[key];
        });
        return sortedObj;
    };

    // generateNetworkExplorerLinks(data) {
    //     let networkLinks = {};

    //     data.forEach(coin => {
    //         coin.networks.forEach(network => {
    //             network = this.adaptToExplorer(network);
    //             const baseUrl = `https://3xpl.com/${network}/address/`;
    //             if (network && !this.networkLinks[network]) networkLinks[network] = baseUrl;
    //         });
    //     });
    //     // Return object with supported explorer
    //     return this.sortedObj(networkLinks);
    // }

}


module.exports = Helpers;









// let ratio;
// if (referenceCoin === settleCoin) {
//     // if setting USD_REFERENCE_COIN is equal to settleCoin then is an alternative coin to get ratio
//     const alternativeCoin = this._getAlternativeUSDCoin(settleCoin);
//     if(!alternativeCoin){
//         throw new Error('Cannot shift between the same coin network pair')
//     }
//     ratio = await this.sideshift.getPair(alternativeCoin, settleCoin);
// } else if (this._isUsdBased(depositCoin) && this._isUsdBased(settleCoin)){
//     //if depositCoin and settleCoin === USD coin then ratio should be 1, using API gives 0.9845
//     ratio = {rate: 1};
// } else {
//     //if depositCoin is USD then use it, else use reference coin.
//     if (this._isUsdBased(depositCoin) && depositCoin !== referenceCoin) {
//         ratio = await this.sideshift.getPair(depositCoin, settleCoin);
//     } else {
//         ratio = await this.sideshift.getPair(referenceCoin, settleCoin);
//     }
// }