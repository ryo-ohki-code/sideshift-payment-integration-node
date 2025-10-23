# sideshift-API-payment-wrapper package

This Node.js package enables cryptocurrency payments in your Node.js project by integrating with the [SideShift API](https://sideshift.ai/) using the [sideshift-api-node](https://github.com/ryo-ohki-code/sideshift-api-node) module, allowing you to integrate cryptocurrency payment processing in any Node.js project with just a few tweaks. It supports real-time payment processing, polling for transaction confirmations, 250+ cryptocurrencies and multi-currency support including USD, EUR, JPY, etc.

This package handle both integration method 'custom integration' and SideShift Checkout integration.

By nature we recommends to us the Checkout integration as it's permit payment from the same coin without needs to set a secondary wallet. 


## Components
- `ShiftProcessor`: Handles the creation and management of crypto payments via SideShift API.
- `PaymentPoller`: Polls the SideShift API for payment confirmation and triggers success/failure callbacks.
- `Helpers`: functions to ease shift processing

## Prerequisites
SideShift account: Ensure you have an active SideShift account.
- Account ID: Your unique identifier on SideShift.ai. It can also be used as the affiliateId to receive commissions.
- Private Key: Your API secret key used for authentication.
Both can be acquired from https://sideshift.ai/account.



## Installation 

### Package
The package only requires the fs and SideShift API modules to work.
Use this file from the repo: [sideshiftAPI.js](https://github.com/ryo-ohki-code/sideshift-api-node/blob/main/sideshiftAPI.js)

```bash
wget https://raw.githubusercontent.com/ryo-ohki-code/sideshift-api-node/main/sideshiftAPI.js
npm install fs
```



### Demo server
Simple sample settings of how to use this package on server and client sides.

**Set .env file**
```
SIDESHIFT_ID=Your_Sideshift_ID 
SIDESHIFT_SECRET=Your_Sideshift_Secret
WALLET_ADDRESS=0x...
```

**Star the demo server**
```bash
npm install express pug fs dotenv express-rate-limit
node demo_integration.js
```

📝 Note: It will download and store the coin icons on the first start.
```
// Path to store downloaded icons
const ICON_PATH = './public/icons';
```


## Configuration

### API Credentials
```
const SIDESHIFT_ID = process.env.SIDESHIFT_ID; // "Your_sideshift_ID"; 
const SIDESHIFT_SECRET = process.env.SIDESHIFT_SECRET; //"Your_shideshift_secret";
const SIDESHIFT_CONFIG = {
	secret: SIDESHIFT_SECRET,
	id: SIDESHIFT_ID,
	commissionRate: "0.5", // from 0 to 2 %
	verbose: true
}
```

How to get your API credentials?
Visit [Sideshift Account Page](https://sideshift.ai/account) and dind your SideShift ID and Secret (private key) in the dashboard.


### Payment Settings
```
SHOP_SETTING.currency = "USD"; // Supported currencies: USD, EUR, JPY... (ISO 4217 code standard)
SHOP_SETTING.USD_REFERENCE_COIN = "USDT-bsc"; // Must be a coin-network from the coinList
```

### Wallet Configuration
Important to know: The current version provide a custom and the latest 'checkout' integration.

The custom integration requires two different wallets because the SideShift API doesn't support same-coin-network shifts (e.g., BTC-bitcoin to BTC-bitcoin). Checkout do not have this restriction.

You can use 'custom integration' by setting only one wallet, but same coin shift will throw error.
Using 'checkout integration' require only one wallet setting.

```
const MAIN_WALLET = {
	coin: "USDT",
	network: "bsc",
	address: process.env.WALLET_ADDRESS, // "Your wallet address",
	isMemo: [false, ""] // Set to [false, ""] or if your wallet need a Memo set to [true, "YourMemoHere"]
}

const SECONDARY_WALLET = {
	coin: "BNB",
	network: "bsc",
	address: process.env.WALLET_ADDRESS, // "Your wallet address",
	isMemo: [false, ""]
}

const MAIN_COIN = `${MAIN_WALLET.coin}-${MAIN_WALLET.network}`;
const SECONDARY_COIN = `${SECONDARY_WALLET.coin}-${SECONDARY_WALLET.network}`;

const WALLETS = {
    [MAIN_COIN]: MAIN_WALLET,
    [SECONDARY_COIN]: SECONDARY_WALLET
};
```

⚠️ Important Notes
1. Wallets can be set on different networks (we only use 'bsc' for simplicity in this example, with 2 different coins, this is the easiest setting)
2. You cannot set the same coin-network twice
    - ❌ Invalid: USDT-ethereum and USDT-ethereum
    - ✅ Valid: USDT-ethereum and USDT-bsc


### Load the crypto payment processor
```
const ShiftProcessor = require('./ShiftProcessor.js')
const shiftProcessor = new ShiftProcessor({
  wallets: WALLETS, // optional - needed to receive payment
  sideshiftConfig: SIDESHIFT_CONFIG,
  currencySetting: SHOP_SETTING // optional, default to USD if not set
});
```

If you don't want use wallet you can load the module without wallets setting. Without wallets setting, all wallet related function will be unavailable:
```
const ShiftProcessor = require('./ShiftProcessor.js')
const shiftProcessor = new ShiftProcessor({
  sideshiftConfig: SIDESHIFT_CONFIG // Minimal required setting
});
```


### Load the payment poller system
The custom integration require the polling system. 

Do not set this for checkout integration.

```
const PaymentPoller = require('./CryptoPaymentPoller.js');
const cryptoPoller = new PaymentPoller({
  shiftProcessor,
  intervalTimeout: 120000, // optinal default to 30000 ms
  resetCryptoPayment,
  confirmCryptoPayment
});
```



### Initialization
To work the module needs access to the SideShift coins list, it must be loaded at server start.

parameter
ICON_PATH (save path for the icons)
```
await shiftProcessor.updateCoinsList(ICON_PATH)
```

**Sample integration**
```
// Start server after receiving the coin list from sideshift API
shiftProcessor.updateCoinsList(ICON_PATH).then((response) => {
    console.log('Initial coins list loaded');
	availableCoins = response.availableCoins;

    // Check if configuration coins are supported by SideShift, remove SECONDARY_COIN is using 'checkout integration'
    const isValidCoin_1 = shiftProcessor.isCoinValid(MAIN_COIN);
    const isValidCoin_2 = shiftProcessor.isCoinValid(SECONDARY_COIN);

    if (!isValidCoin_1 || !isValidCoin_2) {
        console.error("Invalid configuration coin", MAIN_COIN, SECONDARY_COIN)
        process.exit(1);
    }
    
    // Start server
    https.createServer(options, app).listen(PORT, () => {
        console.log(`HTTPS Server running at https://localhost:${PORT}/`);
    });
    
    setInterval(async () => {
        const result = await shiftProcessor.updateCoinsList(ICON_PATH);
        // Update global variables every 12h
        availableCoins = result.availableCoins;
    }, 12 * 60 * 60 * 1000);
}).catch(err => {
    console.error('Failed to load initial coins list:', err);
    process.exit(1);
});
```


## Usage

### For custom integration
See '/selection', '/create-quote' and '/create-payment' routes on the demo server.

### For checkout integration
See 'create-checkout', '/checkout', ... routes on the demo server.

Other usage example: '/paywall'

## How to set a payment with 'Checkout integration'
It is simple as this:
```
const checkout = await shiftProcessor.requestCheckout({
    settleCoin: settleCoin,
    settleNetwork: settleNetwork,
    settleAddress: MAIN_WALLET.address,
    settleMemo: null,
    settleAmount: Number(settleAmount),
    successUrl: `${BASE_URL}/success-checkout/${orderId}&secret=${secretHash}`,
    cancelUrl: `${BASE_URL}/cancel-checkout/${orderId}&secret=${secretHash}`,
    externalId: orderId, // Optional
    userIp: shiftProcessor.helper.extractIPInfo(req.ip).address,
})
res.redirect(checkout.link);
```

Users are redirected through SideShift's checkout portal. Manual user cancellations redirect to cancelUrl, while successful payments redirect to successUrl.

This integration does not require the polling system since redirection is handled by SideShift. See /api/webhooks/sideshift route.

Refer to /success-checkout and /cancel-checkout routes.





## How to set a payment with 'Custom integration'
Simply use getSettlementData() to get all necessary data:

**getSettlementData(amountFiat, depositCoinNetwork)**:
The getSettleAmountSettleAddressAndRate function is an asynchronous settlement calculator that determines the appropriate settlement amount, address, and exchange rate for cryptocurrency shift operations based on fiat deposit amounts and deposit coin-network.

Parameters 
- totalFiat (e.g., 100.05)
- depositCoinNetwork (e.g., ETH-ethereum)

```
const data = await shiftProcessor.getDepositAmountAndSettleAddressAndRatio(Number(totalFiat), depositCoinNetwork); 
```

Return
```
{
  settleData: { // Your destination wallet information
    coin: 'USDT',
    network: 'bsc',
    address: '0x...',
    isMemo: [ false, '' ]
  },
  depositAmount: '124.02480000',
  pairData: { // Shift pair data
    min: '7.290191898306',
    max: '72901.91898306',
    rate: '0.403726247797',
    depositCoin: 'ARB',
    settleCoin: 'USDT',
    depositNetwork: 'arbitrum',
    settleNetwork: 'bsc'
  }
}
```
settleData: Destination wallet information from getDestinationWallet()
depositAmount: Calculated cryptocurrency amount to pay
pairData: Exchange pair information including rate, minimum, and maximum limits

And then use createCryptocurrencyPayment() to get the shift object (see point 3 bellow).


### If you want control over each step:
1. Get Destination Wallet: Use getDestinationWallet to obtain the settle wallet details

**getDestinationWallet(depositCoin)**: Test deposit coin to set settle address
The getDestinationWallet function is a wallet selection mechanism that determines which wallet should be used as the destination for settlement operations based on the input coin type and current wallet availability.

```
const depositCoin = ['BNB-bsc', false]; // ['COIN-network', false] or ['COIN-network', "Memo"]
const settleWallet = shiftProcessor.getDestinationWallet(depositCoin); 
```

The function returns the appropriate wallet object based on:
- If input coin matches MAIN_COIN: Returns SECONDARY_COIN
- If input coin matches SECONDARY_COIN: Returns MAIN_COIN


2. Convert Fiat Amount: Use calculateCryptoFromFiat to convert the fiat amount into the equivalent cryptocurrency deposit amount. You can use getPair to get complementary data like min/max supported amount for the shift.

**calculateCryptoFromFiat(amountToShift, depositCoin, settleCoin)**: Convert FIAT amount to cryptocurrency amount
The calculateCryptoFromFiat function is an asynchronous cryptocurrency conversion utility that calculates the appropriate cryptocurrency amount to shift based on a fiat deposit amount, considering exchange rates and network costs.

Functionality:
- Converts the input fiat amount to USD (from currencySetting.currency to USD)
 using the current exchange rate from getCurrencyConvertionRate()
- Applies a 0.02% buffer to compensate for network fees and shift costs
- Directly returns USD amount for stablecoins (USD-based coins)
- For non-stablecoins, calculates the appropriate conversion ratio using _getRatio() method

Parameters 
- amount FIAT currency (e.g., 100.54)
- from (e.g., BTC-bitcoin)
- to (e.g., ETH-ethereum)
```
const amount = await shiftProcessor.calculateCryptoFromFiat(amount, from, to);
```

return
```
1.23456789
```

**Get shift pair information**
Get all information about a pair, rate, minimum and maximum deposit, ...

Parameters 
- from (e.g., BTC-bitcoin)
- to (e.g., ETH-ethereum)
```
const getPairData = await shiftProcessor.sideshift.getPair(from, to);
```

returns pair object from the SideShift API:
```
{
  "min": "0.0.00010771",
  "max": "1.43608988",
  "rate": "17.298009817772",
  "depositCoin": "BTC",
  "settleCoin": "ETH",
  "depositNetwork": "bitcoin",
  "settleNetwork": "ethereum"
}
```


3. Create Shift: Generate a shift using the SideShift API, this create the fixed shift operation with settlement details

**createCryptocurrencyPayment({ depositCoin, depositNetwork, amountFiat, refundAddress = null, refundMemo = null, userIp = null, externalId = null })**: 
The createCryptocurrencyPayment function is an asynchronous cryptocurrency shift creation utility that processes fiat deposits into cryptocurrency settlements through the SideShift API. It Handles all necessary step to set the shift.

Parameters
- depositCoin: The deposit coin symbol (e.g., 1INCH)
- depositNetwork: The deposit network identifier (e.g., ethereum)
- amountFiat: The FIAT amount to be payed (e.g., 124.0248)
- userIp (optional): IP address for user tracking and security (e.g., 123.123.123.123)
- externalId (optional): External identifier for tracking purposes

```
const shift = await shiftProcessor.createCryptocurrencyPayment({depositCoin, depositNetwork, amountFiat, userIp});
```

return
```
{
  id: '8c9ba87d02a801a2f254',
  createdAt: '2025-09-25T22:20:54.256Z',
  depositCoin: '1INCH',
  settleCoin: 'USDT',
  depositNetwork: 'ethereum',
  settleNetwork: 'bsc',
  depositAddress: '0x...',
  settleAddress: '0...',
  depositMin: '545.71286601',
  depositMax: '545.71286601',
  type: 'fixed',
  quoteId: '32e676d3-56c2-4c06-a0cd-551a9d3db18b',
  depositAmount: '545.71286601',
  settleAmount: '124.0248',
  expiresAt: '2025-09-25T22:35:51.182Z',
  status: 'waiting',
  averageShiftSeconds: '198.338602',
  rate: '0.227271167174'
}
```

After receiving shift data, you must activate the background polling system.

```
cryptoPoller.addPayment(shift, shift.settleAddress, shift.settleAmount, customerOrderId);

```
Refer to the handleCryptoShift middleware and routes: /payment-status, /success/, /cancel/.

Use the resetCryptoPayment and confirmCryptoPayment functions to handle the polling system response.


## Detailed Features

### Shift function:

**requestQuoteAndShift()**
```
requestQuoteAndShift({
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
})
```
return fixed shift response


**createFixedShiftFromUsd()**
```
createFixedShiftFromUsd({
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
})
```
return fixed shift response


**createVariableShift({depositCoin, depositNetwork, userIp = null, externalId = null})**:
return variable shift response


**requestCheckout()**
```
requestCheckout({
    settleCoin,
    settleNetwork,
    settleAddress,
    settleAmount,
    successUrl,
    cancelUrl,
    settleMemo = null,
    externalId = null,
    userIp = null,
})
```
return fixed checkout response


**Full SideShift API integration**
You can also call any SideShift API endpoint by using (see [sideshift-api-node](https://github.com/ryo-ohki-code/sideshift-api-node) )
```
shiftProcessor.sideshift['endpoint_name']
```


### Coin helpers function

**updateCoinsList(destination)**:
The updateCoinsList function is an asynchronous utility that refreshes the system's coin database with the latest information from the SideShift API, including coin details, network information, and icon downloads.

Parameter
destination: The file path or destination where coin icons should be downloaded

return
```
{ availableCoins: [availableCoins], lastCoinList: [lastCoinList], rawCoinList: {rawCoinList}, networkExplorerLinks: {networkLinks} }
```
availableCoins: Complete list of available coin-network ([['COIN-network', false], ['COIN-network', "Memo"], ...])
lastCoinList: Most recent coin list for comparison purposes
rawCoinList: Raw coin data from the API
networkExplorerLinks: Generated explorer links for all networks


**getAvailablecoins()**: Fetches full list of supported coins from SideShift.

Processes each coin into format: ['coin-network', hasMemo, "Memo"].
Stores raw coin data (rawCoinList) and processed lists (availableCoins, lastCoinList).
Filters USD-based coins (USD_CoinsList).

returns same as updateCoinsList.


**isCoinValid(coinNetwork)**:
The isCoinValid function is a coin validation utility that checks whether a specified coin-network combination exists in the available coins list from the SideShift API.

```
shiftProcessor.isCoinValid("ETH-bitcoin") // false
shiftProcessor.isCoinValid("ETH-ethereum") // true
```


**isSettleCoinOnline()**:
The isSettleCoinOnline function is a coin availability checker that determines whether the main and secondary coins are currently online and available for settlement operations. Configuration relies on MAIN_COIN and SECONDARY_COIN constants for identification.
This function has a locking mechanism using _lockNoWallet() to prevent concurrent access if MAIN_COIN or MAIN_COIN are not configured.

return: 
```
[true, true]
```


**isShiftAvailable(depositCoin, depositNetwork, settleCoin, settleNetwork, settleAmount = null)**
Group all tests to verify shift availability


**testMinMaxDeposit(depositCoinNetwork, settleCoinNetwork, settleAmount)**
Test if amount is min < amount < max and return pair data

return error or pairData


**isUsdStableCoin(coin)**
Test is coin is USD stable coin



**isCoinMemo(coinNetwork)**



**isThisCoinOrToken(coin, network)**:
The isThisCoinOrToken function is a utility that determines whether a specified coin-network combination represents a token (as opposed to a native coin) within the system.

Parameters
coin: The coin symbol or identifier
network: The network identifier (e.g., "ethereum", "bsc")

Returns a boolean value:

- true if the specified coin-network combination is identified as a token
- false if the coin is a native coin or if the coin/network combination cannot be found


**getTokenAddress(coin, network)**:
The getTokenAddress function is a utility that retrieves the contract address for a specific token on a given network, providing access to token-specific blockchain information.

Parameters
coin: The coin symbol or identifier
network: The network identifier (e.g., "ethereum", "bsc")

Returns false if:
- The coin is not found
- The coin is not a token
- The network is not supported
- No contract address exists for the specified network


**getDecimals(coin, network)**
get the decimal of a coin/token if available else return null
return null or decimal


**usdToSettleCoin**
Convert an USD amount to a settle coin-network cryptocurrency amount



### Other helpers function:
 
**getCoinNetwork(coin, network)** 
return "coin-network" string


**getCurrencyConvertionRate()**:
The getUSDRate function is an asynchronous currency conversion rate fetcher that retrieves the current USD exchange rate from an external API endpoint.

 
**extractIPInfo(ipAddress)**:
Express helper to extract IP address for userIp input

Parameters 
- ipAddress (e.g., 123.123.123.123)

The extractIPInfo function is a comprehensive IP address validator and parser that processes incoming IP addresses and returns structured information about their type and validity. It handles both IPv4 and IPv6 addresses, including IPv4-mapped IPv6 addresses (prefixed with ::ffff:)

```
shiftProcessor.extractIPInfo(req.ip)
```


**Sanitize or validate String or Number input**
To sanitize string and number input
```
shiftProcessor.sanitizeString(input)
shiftProcessor.sanitizeNumber(input)
```

To validate string and number input
```
shiftProcessor.validateString(input)
shiftProcessor.validateNumber(input)
```


**isSettleOnline(depositCoin, depositNetwork, settleCoin, settleNetwork)**
Check the online status for deposit and settle coin-network.

return object with Boolean
```
{ isDepositOffline: false, isSettleOffline: false, isShiftOnline: true };
or
{ isDepositOffline: false, isSettleOffline: true, isShiftOnline: false };
```
isShiftOnline indicate if both deposit and settle are online.



**sortCoinsAndTokens()**
Sort coins and token into a comprehensive list.

Return an object with supportedNetworks, mainnetCoins and tokenByChain
```
{ 
    supportedNetworks: supportedNetworksArray,
    mainnetCoins: mainnetCoinsArray,
    tokenByChain: tokenGroupsArray
}
```



### Explorer Links Generation

**getNetworkExplorer(network)**
Maps blockchain network names (e.g., "ethereum") to standardized formats.
Generates explorer URLs for supported networks via https://3xpl.com/{network}/address/.

