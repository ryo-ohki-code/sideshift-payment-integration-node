# sideshift-API-payment-wrapper Node.js


This Node.js library enables cryptocurrency payments in your Node.js project by integrating with the [SideShift API](https://sideshift.ai/) using the [sideshift-api-node](https://github.com/ryo-ohki-code/sideshift-api-node) module, allowing you to integrate cryptocurrency payment processing in any Node.js project with just a few tweaks. It supports real-time payment processing, polling for transaction confirmations, 250+ cryptocurrencies and multi-currency support including USD, EUR, JPY, etc.

This library handle both integration method 'Custom integration' and [SideShift Pay](https://pay.sideshift.ai/) 'Checkout integration'.

By nature we recommends to you the Checkout integration as it's permit payment from the same coin without needs to set a secondary wallet.



## Table of Contents
- [Description](#description)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Checkout Integration Guide](#checkout-integration-guide)
  - [Webhook Manager](#webhook-manager)
- [Custom Integration Guide](#custom-integration-guide)
- [Features](#features)
  - [Detailed Shift function](#detailed-shift-function)
  - [Coin helpers](#coin-helpers)
  - [Explorer Links](#explorer-links)



## Description
This library wraps the SideShift API with additional helper functions, validation utilities, and background polling support for tracking payment statuses.

It supports:

- Creating fixed & variable shifts
- Handling checkout flows
- Managing multiple wallets (main + secondary)
- Coin/network validation
- IP address parsing
- SVG icon downloading
- Full API endpoint access
- More


### Components
- `ShiftProcessor`: Handles the creation and management of crypto payments via SideShift API.
- `PaymentPoller`: Polls the SideShift API for payment confirmation and triggers success/failure callbacks.
- `webhook-manager`: SideShift webhook connection manager
- `Helpers`: functions to ease shift processing



## Installation 


### Prerequisites
SideShift account: Ensure you have an active SideShift account.
- Account ID: Your unique identifier on SideShift.ai. It can also be used as the affiliateId to receive commissions.
- Private Key: Your API secret key used for authentication.
Both can be acquired from https://sideshift.ai/account, you will find them on the dashboard


Else the library only requires the fs and SideShift API module to work.
Use this file from the repo: [sideshiftAPI.js](https://github.com/ryo-ohki-code/sideshift-api-node/blob/main/sideshiftAPI.js)

```bash
git clone https://github.com/ryo-ohki-code/sideshift-payment-wrapper-node.git
cd sideshift-payment-wrapper-node/ && npm install fs
cd Shift-Processor/ && wget https://raw.githubusercontent.com/ryo-ohki-code/sideshift-api-node/main/sideshiftAPI.js
```


### Demo Server
Sample configurations for server and client-side usage.


**Set .env file**
```
SIDESHIFT_ID=Your_Sideshift_ID 
SIDESHIFT_SECRET=Your_Sideshift_Secret
WALLET_ADDRESS=0x...
```


**Install and Start Demo Server**
```bash
npm install express pug fs dotenv express-rate-limit
node demo_integration.js
```

📝 Note: At first start, it will download and store the coin icons.

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
Visit [Sideshift Account Page](https://sideshift.ai/account), see "Prerequisites".


### Payment Settings
```
SHOP_SETTING.currency = "USD"; // Supported currencies: USD, EUR, JPY... (ISO 4217 code standard)
SHOP_SETTING.USD_REFERENCE_COIN = "USDT-bsc"; // Must be a coin-network from the coinList
```


### Wallet Configuration
Important to know: The current version provides a custom and the latest 'checkout' integration.

The custom integration requires two different wallets because the SideShift API doesn't support same-coin-network shifts (e.g., BTC-bitcoin to BTC-bitcoin). Checkout does not have this restriction.

You can use 'custom integration' by setting only one wallet, but same coin shifts will throw an error. Using 'checkout integration' requires only one wallet setting.

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

If you don't want to use a wallet, you can load the module without wallet settings. Without wallet settings, all wallet-related functions will be unavailable:

```
const ShiftProcessor = require('./ShiftProcessor.js')
const shiftProcessor = new ShiftProcessor({
  sideshiftConfig: SIDESHIFT_CONFIG // Minimal required setting
});
```


### Load the payment poller system
The custom integration requires the polling system.

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
To work, the module needs access to the SideShift coins list, which must be loaded at server start.

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
    rawCoinList = response.rawCoinList;

    // Check if configuration coins are supported by SideShift
    const isValidCoin_1 = shiftProcessor.helper.isCoinValid(MAIN_COIN);

    if (!isValidCoin_1) {
        console.error("Invalid wallet configuration coin", MAIN_COIN)
        process.exit(1);
    }
    // Uncomment if using 2 wallets configuration
    // const isValidCoin_2 = shiftProcessor.helper.isCoinValid(SECONDARY_COIN);
    // if (!!isValidCoin_2) {
    //     console.error("Invalid wallet configuration coin", SECONDARY_COIN)
    //     process.exit(1);
    // }

    app.listen(port, () => {
        console.log(`HTTP Server running at http://localhost:${port}/`);
    });

    setInterval(async () => {
        const result = await shiftProcessor.updateCoinsList(ICON_PATH);
        // Update global variables
        availableCoins = result.availableCoins;
        rawCoinList = result.rawCoinList;
    }, 12 * 60 * 60 * 1000);

}).catch(err => {
    console.error('Failed to load initial settings:', err);
    process.exit(1);
});
```


## Usage

### For custom integration
See '/selection', '/create-quote' and '/create-payment' routes on the demo server.


### For checkout integration
See 'create-checkout', '/checkout/:status/..."', '/api/webhooks/sideshift' routes on the demo server.

Other usage example: '/paywall'



## Checkout Integration Guide
It is simple as this:
```
const checkout = await shiftProcessor.requestCheckout({
    settleCoin: settleCoin,
    settleNetwork: settleNetwork,
    settleAddress: MAIN_WALLET.address,
    settleMemo: null,
    settleAmount: Number(settleAmount),
    successUrl: `${WEBSITE_URL}/checkout/success/${orderId}/${secretHash}`,
    cancelUrl: `${WEBSITE_URL}/checkout/cancel/${orderId}/${secretHash}`,
    userIp: shiftProcessor.helper.extractIPInfo(req.ip).address,
})
res.redirect(checkout.link);
```

Users are redirected through SideShift's checkout portal. Manual user cancellations redirect to cancelUrl, while successful payments redirect to successUrl.

This integration does not require the polling system since redirection is handled by SideShift. See /api/webhooks/sideshift route.

Refer to /checkout/:status/:orderId/:secret" route for success and cancel status.


### Webhook Manager
Checkout must be used with the webhook notification system. The webhook-manager helps set up the webhook connection and '/api/webhooks/sideshift' POST route. You can use webhookDataConfirmation to validate incoming data.

Create a webhook:
```
setupSideShiftWebhook(WEBSITE_URL, process.env.SIDESHIFT_SECRET); //will set the webhook once and save the response into a file.
```
Delete a webhook:
```
setupSideShiftWebhook(process.env.SIDESHIFT_SECRET); // Delete the saved webhook
```


## Custom Integration Guide
Use getSettlementData() to get all necessary data.
And then use createCryptocurrencyPayment() to get the shift object (see point 3 bellow).


**getSettlementData(amountFiat, depositCoinNetwork)**:
The getSettlementData function is an asynchronous settlement calculator that determines the appropriate settlement amount, address, and exchange rate for cryptocurrency shift operations based on fiat deposit amounts and deposit coin-network.

Parameters 
- totalFiat (e.g., 100.05)
- depositCoinNetwork (e.g., ETH-ethereum)

```
const data = await shiftProcessor.getSettlementData(Number(totalFiat), depositCoinNetwork); 
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
settleData: Destination wallet information from getSettleWallet()
depositAmount: Calculated cryptocurrency amount to pay
pairData: Exchange pair information including rate, minimum, and maximum limits


### If you want control over each step:
1. Get Destination Wallet: Use getSettleWallet to obtain the settle wallet details


**getSettleWallet(depositCoin)**: Test deposit coin to set settle address
The getSettleWallet function is a wallet selection mechanism that determines which wallet should be used as the destination for settlement operations based on the input coin type and current wallet availability.

```
const depositCoin = ['BNB-bsc', false]; // ['COIN-network', false] or ['COIN-network', "Memo"]
const settleWallet = shiftProcessor.getSettleWallet(depositCoin); 
```

The function returns the appropriate wallet object based on:
- If input coin matches MAIN_COIN: Returns SECONDARY_COIN
- If input coin matches SECONDARY_COIN: Returns MAIN_COIN


2. Convert Fiat Amount: Use usdToSettleAmount to convert the fiat amount into the equivalent cryptocurrency deposit amount. You can use getPair to get complementary data like min/max supported amount for the shift.


**usdToSettleAmount(amountToShift, depositCoin, settleCoin)**: Convert FIAT amount to cryptocurrency amount
The usdToSettleAmount function is an asynchronous cryptocurrency conversion utility that calculates the appropriate cryptocurrency amount to shift based on a fiat deposit amount, considering exchange rates and network costs.

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
const amount = await shiftProcessor.usdToSettleAmount(amount, from, to);
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
The createCryptocurrencyPayment function is an asynchronous cryptocurrency shift creation utility that processes fiat amount into cryptocurrency settlements through the SideShift API. It Handles all necessary step to set the shift.

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

After creating a shift, start polling for status updates:

```
cryptoPoller.addPayment(shift, shift.settleAddress, shift.settleAmount, customerOrderId);

```

Handle responses using:

resetCryptoPayment()
confirmCryptoPayment()
These functions manage internal state and trigger success/cancel logic based on the shift status.


Refer to the handleCryptoShift middleware and routes: /payment-status, /success/, /cancel/.



## Features

| Shift Feature	| Description |
|:---------|:-------------|
| requestQuoteAndShift | Manual Single-step fixed shift |
| createFixedShiftFromUsd | Automatic shift from USD to configured wallet |
| createVariableShift | Manual variable shift creation |
| requestCheckout | Manual checkkout creation|
| getSettleWallet | Auto-selects wallet |
| usdToSettleCoin  | Return settleAmount from a USD input |
| isShiftAvailable  | Verify if a shift is posisble |
| testMinMaxDeposit  | Verify if deposit amount is between min and max |

| Coin Feature	| Description |
|:---------|:-------------|
| updateCoinsList | Refresh coin data + icons |
| getAvailableCoins | List of all supported coins |
| isCoinValid | Validate coin-network combo |
| isSettleCoinOnline  | Verify if configured coin-network are available |
| isUsdStableCoin  | Test if coin-network is a stable coin |
| isThisCoinOrToken  | Test if coin-network is a coin or a token |
| getTokenAddress | Get token contract address |
| getDecimals  | Return the decimal for a coin/token|
| getCoinNetwork  | Return "coin-network" in a string |
| isSettleOnline  | Verify if coin-network is online |

| Other Feature	| Description |
|:---------|:-------------|
| getCurrencyConvertionRate  | Get the configured fiat USD convsersion rate|
| extractIPInfo | Parse user IPs |
| sortCoinsAndTokens  | Return organized networks, coins and tokens |
| getNetworkExplorer | Generate blockchain explorer link |



### Detailed Shift function

**requestQuoteAndShift()**
One-step creation of a fixed shift.

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
Create a fixed rate shift using an USD/fiat amount with manual wallet setting.

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
Automatically selects one of the configured wallets and creates a variable shift. (If only one wallet is configured same coin shift are impossible)

return 
```
variable variable response
```


**requestCheckout()**
Initiates a checkout request via SideShift UI.

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
return checkout response


**Full SideShift API integration**
You can also call any SideShift API endpoint by using (see [sideshift-api-node](https://github.com/ryo-ohki-code/sideshift-api-node) )
```
shiftProcessor.sideshift['endpoint_name']
```


### Coin helpers

**updateCoinsList(destination)**:
Refreshes the system's coin database with the latest information from the SideShift API, including coin details, network information, it also downloads missing icons svg images.

Parameter
destination: The file path or destination where coin icons should be downloaded (e.g., "/icons/")

return
```
{ availableCoins: [availableCoins], lastCoinList: [lastCoinList], rawCoinList: {rawCoinList}, networkExplorerLinks: {networkLinks} }
```
availableCoins: Complete list of available coin-network ([['COIN-network', false], ['COIN-network', "Memo"], ...])
lastCoinList: Most recent coin list for comparison purposes
rawCoinList: Raw coin data from the API
networkExplorerLinks: Generated explorer links for all networks


**getAvailablecoins()**
Returns parsed list of SideShift API  supported coins.

Processes each coin into format: ['coin-network', hasMemo, "Memo"].
Stores raw coin data (rawCoinList) and processed lists (availableCoins, lastCoinList).
Filters USD-based coins (USD_CoinsList).

returns same as updateCoinsList.


**isCoinValid(coinNetwork)**:
Check if a coin-network exists in the SideShift API.


```
shiftProcessor.isCoinValid("ETH-bitcoin") // false
shiftProcessor.isCoinValid("ETH-ethereum") // true
```


**isSettleCoinOnline()**:
Determines whether the main and secondary coins are currently online and available for settlement operations. 
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
Determines whether a specified coin-network combination represents a token (as opposed to a native coin) within the system.

Parameters
coin: The coin symbol or identifier
network: The network identifier (e.g., "ethereum", "bsc")

Returns a boolean value:

- true if the specified coin-network combination is identified as a token
- false if the coin is a native coin or if the coin/network combination cannot be found


**getTokenAddress(coin, network)**:
Retrieves the contract address for a specific token on a given network.

Parameters
coin: The coin symbol or identifier
network: The network identifier (e.g., "ethereum", "bsc")

Returns false if:
- The coin is not found
- The coin is not a token
- The network is not supported
- No contract address exists for the specified network


**getDecimals(coin, network)**
Get decimal precision for a coin/token.

return null or decimal


**usdToSettleCoin**
Convert an USD amount to a settle coin-network cryptocurrency amount



## Other helpers function:
 
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


**Sanitization & Validation**
Sanitize string and number:
```
shiftProcessor.sanitizeString(input)
shiftProcessor.sanitizeNumber(input)
```

Validate string and number:
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
Organize networks, coins and tokens into categorized lists.

Return an object with supportedNetworks, mainnetCoins and tokenByChain
```
{ 
    supportedNetworks: supportedNetworksArray,
    mainnetCoins: mainnetCoinsArray,
    tokenByChain: tokenGroupsArray
}
```


### Explorer Links

**getNetworkExplorer(network)**
Generate explorer link for a given network (e.g., Ethereum).
```
https://3xpl.com/{network}/address/
```
