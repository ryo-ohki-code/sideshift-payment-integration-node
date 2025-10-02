# sideshift-API-payment-integration package

This Node.js package enables cryptocurrency payments in your Node.js project by integrating with the [Sideshift API](https://sideshift.ai/) using the [sideshift-api-nodejs](https://github.com/ryo-ohki-code/sideshift-api-node) module, allowing you to integrate cryptocurrency payment processing in any Node.js project with just a few tweaks. It supports real-time payment processing, polling for transaction confirmations, 237+ cryptocurrencies and multi-currency support including USD, EUR, JPY, etc.


## Components
- `cryptoProcessor`: Handles the creation and management of crypto payments via Sideshift API.
- `PaymentPoller`: Polls the sideshift API for payment confirmation and triggers success/failure callbacks.


## Installation 

### Package
The package only requires the fs and sideshift API modules to work.
Use this file from the repo: [sideshiftAPI.js](https://github.com/ryo-ohki-code/sideshift-api-node/blob/main/sideshiftAPI.js)
```bash
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

**Star the demo server**
```bash
npm install https express pug fs dotenv express-rate-limit
node demo_shop.js
```


📝 Note: It will download and store the coin icon on the first start.


## Configuration

### API Credentials
```
const SIDESHIFT_ID = "Your_sideshift_ID"; 
const SIDESHIFT_SECRET = "Your_shideshift_secret";
const SIDESHIFT_CONFIG = {
	secret: SIDESHIFT_SECRET,
	id: SIDESHIFT_ID,
	commissionRate: "0.5",
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
Important: The current version requires two different wallets since the Sideshift API doesn't support same-coin-network shifts (e.g., BTC-bitcoin to BTC-bitcoin).

```
const MAIN_WALLET = {
	coin: "USDT",
	network: "bsc",
	address: "Your wallet address",
	isMemo: [false, ""] // Set to [false, ""] or if your wallet need a Memo set to [true, "YourMemoHere"]
}

const SECONDARY_WALLET = {
	coin: "BNB",
	network: "bsc",
	address: "Your wallet address",
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
  WALLETS,
  MAIN_COIN,
  SECONDARY_COIN,
  SIDESHIFT_CONFIG,
  SHOP_SETTING
});
```

### Load the payment poller system
```
const PaymentPoller = require('./CryptoPaymentPoller.js');
const cryptoPoller = new PaymentPoller({
  shiftGateway,
  intervalTimeout: 120000, // ms
  resetCryptoPayment,
  confirmCryptoPayment
});
```


## Usage
See '/selection', '/create-quote' and '/create-payment' route on the demo server.

### Initialization
To work the module needs access to the Sideshift coins list, it must be loaded at server start.

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

    // Check if configuration coins are supported by sideshift
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

### getDestinationWallet - Test deposit coin to set settle address
This function helps to set the right settle coin network and address for the shift, using your wallet configuration.
```
const inputCoin = ['BNB-bsc', false]; // ['COIN-network', "Memo_here" || false]
const outputChoise = shiftGateway.getDestinationWallet(inputCoin); 
```

You can also test if an input coin is a valid Sideshift API coin using, return null if not supported:
```
shiftProcessor.isCoinValid("ETH-bitcoin") // false
shiftProcessor.isCoinValid("ETH-ethereum") // true
```

### Convert FIAT amount to cryptocurrency amount
Parameters 
- amount FIAT currency (e.g., 100.54)
- from (e.g., BTC-bitcoin)
- to (e.g., ETH-ethereum)
```
let amount = await shiftGateway.getAmountToShift(amount, from, to);
```

### Get shift pair information
Get all information about a pair, ratio, minimum and maximum deposit, ...

Parameters 
- from (e.g., BTC-bitcoin)
- to (e.g., ETH-ethereum)
```
const getPairData = await shiftGateway.sideshift.getPair(from, to);
```


### Create quote preview
This function helps to get all necessary data at once

Parameters 
totalFiat (e.g., 100.05)
depositCoinNetwork (e.g., ETH-ethereum)
```
const data = await shiftProcessor.getDepositAmountAndSettleAddressAndRatio(Number(totalFiat), depositCoinNetwork); 
```

return
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


### Create invoice shift 
Parameters 
- coin (e.g., BTC)
- network (e.g., bitcoin)
- amount cryptocurrency (e.g., 0.05)
- userIp (e.g., 123.123.123.123)
```
const shift = await shiftGateway.createFixedShift(depositCoin, depositNetwork, amount, userIp);
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


### Helpers function:
To sanitize string and number input
```
shiftProcessor.sanitizeStringInput(inputHere)
shiftProcessor.sanitizeNumberInput(inputHere)
```

Express helper to extract IP address for optionnal shiftGateway.createFixedShift userIp input
```
shiftProcessor.extractIPInfo(req.ip)
```
