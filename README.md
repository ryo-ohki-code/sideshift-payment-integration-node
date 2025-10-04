# sideshift-API-payment-integration package

This Node.js package enables cryptocurrency payments in your Node.js project by integrating with the [SideShift API](https://sideshift.ai/) using the [sideshift-api-node](https://github.com/ryo-ohki-code/sideshift-api-node) module, allowing you to integrate cryptocurrency payment processing in any Node.js project with just a few tweaks. It supports real-time payment processing, polling for transaction confirmations, 250+ cryptocurrencies and multi-currency support including USD, EUR, JPY, etc.


## Components
- `cryptoProcessor`: Handles the creation and management of crypto payments via SideShift API.
- `PaymentPoller`: Polls the SideShift API for payment confirmation and triggers success/failure callbacks.


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

**Create https certificate**
```bash
openssl req -newkey rsa:2048 -nodes -keyout key.pem -x509 -days 365 -out cert.pem
```

**Set .env file**
```
SIDESHIFT_ID=Your_Sideshift_ID 
SIDESHIFT_SECRET=Your_Sideshift_Secret
WALLET_ADDRESS=0x...
```

How to get your API credentials?
Visit [Sideshift Account Page](https://sideshift.ai/account) and dind your SideShift ID and Secret (private key) in the dashboard.

**Star the demo server**
```bash
npm install https express pug fs dotenv express-rate-limit
node demo_shop.js
```

📝 Note: It will download and store the coin icon on the first start.


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

### Payment Settings
```
SHOP_SETTING.locale = "en-EN"; // Used for the currencie symbol
SHOP_SETTING.currency = "USD"; // Supported currencies: USD, EUR, JPY... (ISO 4217 code standard)
SHOP_SETTING.USD_REFERENCE_COIN = "USDT-bsc"; // Must be a coin-network from the coinList
```

### Wallet Configuration
Important: The current version requires two different wallets since the SideShift API doesn't support same-coin-network shifts (e.g., BTC-bitcoin to BTC-bitcoin).

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
const cryptoProcessor = require('./ShiftProcessor.js')
const shiftGateway = new cryptoProcessor({
  wallets: WALLETS, // optional - needed to receive payment
  sideshiftConfig: SIDESHIFT_CONFIG,
  currencySetting: SHOP_SETTING // optional, default to USD if not set
});
```

If you don't want use wallet you can load the module like this. But all wallets related function will be unavailable:
```
const cryptoProcessor = require('./ShiftProcessor.js')
const shiftGateway = new cryptoProcessor({
  sideshiftConfig: SIDESHIFT_CONFIG // Minimal required setting
});
```


### Load the payment poller system
```
const PaymentPoller = require('./CryptoPaymentPoller.js');
const cryptoPoller = new PaymentPoller({
  shiftGateway,
  intervalTimeout: 120000, // optinal default to 30000 ms
  resetCryptoPayment,
  confirmCryptoPayment
});
```


## Usage
See '/selection', '/create-quote' and '/create-payment' route on the demo server.

### Initialization
To work the module needs access to the SideShift coins list, it must be loaded at server start.

parameter
ICON_PATH (save path for the icons)
```
await shiftProcessor.updateCoinsList(ICON_PATH)
```

**Sample integration**
```
// For production store coins list in DB so no need to reload each server start
shiftProcessor.updateCoinsList(ICON_PATH).then((response) => {
    console.log('Initial coins list loaded');
	availableCoins = response.availableCoins;

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

## How to set a payment
1. Get Destination Wallet: Use getDestinationWallet() to obtain the settle wallet details
2. Convert Fiat Amount: Convert the fiat amount into the equivalent cryptocurrency deposit amount
3. Create Quote and Shift: Generate a quote using the SideShift API, then create the fixed shift operation with settlement details

**getDestinationWallet(depositCoin)**: Test deposit coin to set settle address
The getDestinationWallet function is a wallet selection mechanism that determines which wallet should be used as the destination for settlement operations based on the input coin type and current wallet availability.

```
const depositCoin = ['BNB-bsc', false]; // ['COIN-network', false] or ['COIN-network', "Memo"]
const settleWallet = shiftGateway.getDestinationWallet(depositCoin); 
```

The function returns the appropriate wallet object based on:
- If input coin matches MAIN_COIN: Returns SECONDARY_COIN
- If input coin matches SECONDARY_COIN: Returns MAIN_COIN


**getAmountToShift(amountToShift, depositCoin, settleCoin)**: Convert FIAT amount to cryptocurrency amount
The getAmountToShift function is an asynchronous cryptocurrency conversion utility that calculates the appropriate cryptocurrency amount to shift based on a fiat deposit amount, considering exchange rates and network costs.

Functionality:
- Converts the input fiat amount to USD (from currencySetting.currency to USD)
- Applies a 0.02% buffer to compensate for network fees and shift costs
- Directly returns USD amount for stablecoins (USD-based coins)
- For non-stablecoins, calculates the appropriate conversion ratio using _getRatio() method

Parameters 
- amount FIAT currency (e.g., 100.54)
- from (e.g., BTC-bitcoin)
- to (e.g., ETH-ethereum)
```
const amount = await shiftGateway.getAmountToShift(amount, from, to);
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
const getPairData = await shiftGateway.sideshift.getPair(from, to);
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


**createFixedShift(depositCoin, depositNetwork, amountFiat, userIp = null)**: 
The createFixedShift function is an asynchronous cryptocurrency shift creation utility that processes fiat deposits into cryptocurrency settlements through the SideShift API. It Handles all necessary step to set the shift.

Parameters
- depositCoin: The deposit coin symbol (e.g., 1INCH)
- depositNetwork: The deposit network identifier (e.g., ethereum)
- amountFiat: The FIAT amount to be payed (e.g., 124.0248)
- userIp (optional): IP address for user tracking and security (e.g., 123.123.123.123)
- externalId (optional): External identifier for tracking purposes

```
const shift = await shiftGateway.createFixedShift(depositCoin, depositNetwork, amountFiat, userIp);
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


### Coin Management

**updateCoinsList(destination)**:
The updateCoinsList function is an asynchronous utility that refreshes the system's coin database with the latest information from the SideShift API, including coin details, network information, and icon downloads.

Parameter
destination: The file path or destination where coin icons should be downloaded

return
```
{ availableCoins: [availableCoins], lastCoinList: [lastCoinList] }
```
availableCoins: Complete list of available coin-network ([['COIN-network', false], ['COIN-network', "Memo"], ...])
lastCoinList: Most recent coin list for comparison purposes


**getAvailablecoins()**: Fetches full list of supported coins from SideShift.
returns same as updateCoinsList.



### Helpers function:

**extractIPInfo(ipAddress)**:
Parameters 
- ipAddress (e.g., 123.123.123.123)

The extractIPInfo function is a comprehensive IP address validator and parser that processes incoming IP addresses and returns structured information about their type and validity. It handles both IPv4 and IPv6 addresses, including IPv4-mapped IPv6 addresses (prefixed with ::ffff:)

```
shiftProcessor.extractIPInfo(req.ip)
```


**Sanitize input**
To sanitize string and number use:
```
shiftProcessor.sanitizeStringInput(inputHere)
shiftProcessor.sanitizeNumberInput(inputHere)
```

