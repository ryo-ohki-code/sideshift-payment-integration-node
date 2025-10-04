// Sideshift API payment integration Node.js - Demo shop
require('dotenv').config({ quiet: true }); //  debug: true 

const express = require('express');
const https = require('https');
const fs = require('fs');

// Create Express app
const app = express();
const PORT = 3003;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'pug');
app.set('views', __dirname+'/views');
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.redirect('selection');
});

// Start HTTPS server
const options = {
  key: fs.readFileSync(__dirname+'/key.pem'),
  cert: fs.readFileSync(__dirname+'/cert.pem')
};

// Path to store downloaded icons
const ICON_PATH = './public/icons';


const rateLimit = require('express-rate-limit');

const rateLimiter = rateLimit({
    windowMs: 3 * 60 * 1000,
    max: 100, 
    message: 'Too many payment requests, please try again later'
});

const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, 
    message: 'Too many payment requests, please try again later'
});


// Demo function to Reset Crypto payment
function resetCryptoPayment(invoiceId, shiftId, cryptoPaymentStatus){
    if (fakeShopDataBase[invoiceId]) {
		fakeShopDataBase[invoiceId].cryptoPaymentOption = "";
		fakeShopDataBase[invoiceId].cryptoPaymentStatus = cryptoPaymentStatus;
		fakeShopDataBase[invoiceId].cryptoTotal = "";
		fakeShopDataBase[invoiceId].payWith = "";
		fakeShopDataBase[invoiceId].isMemo = "";
		fakeShopDataBase[invoiceId].cryptoFailedPayment.push({type: "crypto", id: shiftId});
		fakeShopDataBase[invoiceId].status = "waiting";
	}
}

// Demo function to Confirm Crypto payment
function confirmCryptoPayment(invoiceId, shiftId){
	if (fakeShopDataBase[invoiceId]) {
		fakeShopDataBase[invoiceId].paymentId = shiftId;
		fakeShopDataBase[invoiceId].cryptoPaymentStatus = "settled";
		fakeShopDataBase[invoiceId].status = "confirmed";
	}
}


// Shop configuration
const SHOP_SETTING = {};
SHOP_SETTING.locale = "en-EN";
SHOP_SETTING.currency = "USD"; // USD EUR CNY INR JPY ... use ISO4217 currency codes
SHOP_SETTING.USD_REFERENCE_COIN = "USDT-bsc"; // Must be a 'coin-network' from the sideshift API

const SIDESHIFT_PAYMENT_STATUS = {
    waiting: "waiting",
	pending: "pending",
	processing: "processing",
	settling: "settling",
    expired: "expired",
    settled: "settled"
};


// Wallet configuration - Do not change the object key structure
const MAIN_WALLET = {
	coin: "USDT",
	network: "bsc",
	address: process.env.WALLET_ADDRESS, // Your wallet address
	isMemo: [false, ""] // Set to [false, ""] or if your wallet need a Memo set to [true, "YourMemoHere"]
};

const SECONDARY_WALLET = {
	coin: "BNB",
	network: "bsc",
	address: process.env.WALLET_ADDRESS,
	isMemo: [false, ""]
};



const MAIN_COIN = `${MAIN_WALLET.coin}-${MAIN_WALLET.network}`;
const SECONDARY_COIN = `${SECONDARY_WALLET.coin}-${SECONDARY_WALLET.network}`;

const WALLETS = {
    [MAIN_COIN]: MAIN_WALLET,
    [SECONDARY_COIN]: SECONDARY_WALLET
};

const SIDESHIFT_CONFIG = {
    path: "./sideshiftAPI.js", // Path to module file
	secret: process.env.SIDESHIFT_SECRET, // "Your_shideshift_secret";
	id: process.env.SIDESHIFT_ID, // "Your_shideshift_ID"; 
	commissionRate: "0.5", // Optional - commision rate setting from 0 to 2
	verbose: true // verbose mode true/false
};


// Use sideshift verbose setting
const verbose = SIDESHIFT_CONFIG.verbose;

// Load the crypto payment processor
const ShiftProcessor = require('./ShiftProcessor.js');
const shiftProcessor = new ShiftProcessor({wallets: WALLETS, sideshiftConfig: SIDESHIFT_CONFIG, currencySetting: SHOP_SETTING});

// Load the payment poller system
const PaymentPoller = require('./CryptoPaymentPoller.js');
const cryptoPoller = new PaymentPoller({shiftProcessor, intervalTimeout: 30000, resetCryptoPayment, confirmCryptoPayment}); // import sideshiftAPI and set interval delay in ms

// Set basic variables
let availableCoins = null;

// Demo variables
let fakeShopDataBase = {}; // Demo object to simulate your storage
const fakeInvoice = {
    id: "",
    total: "",
    cryptoTotal: "",
    payWith: "",
    isMemo: "",
    cryptoPaymentOption: "",
    cryptoPaymentStatus: "",
    paymentId: "",
    cryptoFailedPayment: [],
    status: ""
};

// Payment polling system
async function checkOrderStatus(shift, settleAddress, amount, invoiceId) {
  try {
    // your logic here
    cryptoPoller.addPayment(shift, settleAddress, amount, invoiceId);
    
    return true;
  } catch (error) {
    if (verbose) console.error('checkOrderStatus - addPayment failed:', error);
    throw new Error('Cannot initiale polling system');
  }
}


// Demo database
function createDemoCostumer(orderId, total, settleAmount, payWithCoin, memo) {
  		fakeShopDataBase[orderId] = fakeInvoice;
		fakeShopDataBase[orderId].id = orderId;
		fakeShopDataBase[orderId].total = total;
		fakeShopDataBase[orderId].status = "created";
		fakeShopDataBase[orderId].cryptoPaymentOption = "crypto";
		fakeShopDataBase[orderId].cryptoPaymentStatus = "waiting";
		fakeShopDataBase[orderId].cryptoTotal = settleAmount;
		fakeShopDataBase[orderId].payWith = payWithCoin;
		fakeShopDataBase[orderId].isMemo = String(memo);
}


// Website routes

// Redirect to this page if your costumer choose cryptocurrency payment method
app.get("/selection", rateLimiter, function(req,res) {
    try{
    const coinsList = availableCoins ? availableCoins.sort() : null;

    res.render('select-payment-method', { coinsDepositList: coinsList, currency: SHOP_SETTING.currency });
    } catch (err) {
        res.render('error', { error: {title: "Settle Wallet Error", message: err.message} });
    }
});


app.post("/create-quote", paymentLimiter, async function(req,res) {
    try {
        const total = req.body.total; // Demo way to retrieve total amount, use proper method for your setting
        if (!total) throw new Error("Missing total amount");
        if (isNaN(Number(total)) || Number(total) <= 0) {
            return res.status(400).send("Invalid total amount");
        }

		const orderId = shiftProcessor.sanitizeStringInput(req.body.shopOrderID);

        if(!req.body.payWith) throw new Error("Missing input coin");
		const payWith = JSON.parse(req.body.payWith);
        if (!payWith) throw new Error("Can't parse input coin");
		const payWithCoin = shiftProcessor.sanitizeStringInput(payWith[0]);
        if (!payWithCoin) throw new Error("Missing input coin");

        // Get necessary data fron API
        const settleData = shiftProcessor.getDestinationWallet(payWithCoin);
        const settleCoinNetwork = settleData.coin+"-"+settleData.network;
        const settleAmount = await shiftProcessor.getAmountToShift(total, payWithCoin, settleCoinNetwork);
        const pairData = await shiftProcessor.sideshift.getPair(payWithCoin, settleCoinNetwork);

        // Set basic demo costumer data
        createDemoCostumer(orderId, total, settleAmount, payWithCoin, payWith[1]);

		res.render('crypto', { ratio: pairData, invoice: fakeShopDataBase[orderId], SHOP_SETTING });
    } catch (err) {
        if (verbose) console.error("POST create-quote:", err);
        if(err.message.toLowerCase().includes('amount') && (err.message.includes('is below') || err.message.includes('is above'))){
            res.render('error', { error: {title: "Amount error", message: err.message} });
        } else{
            res.render('error', { error: {title: "Error creating quote", message: err.message} });
        }
    }
});

app.post("/create-payment", paymentLimiter, async function(req, res) {
	try {
        const id = shiftProcessor.sanitizeStringInput(req.body.id);
        const coin = shiftProcessor.sanitizeStringInput(req.body.coin);
        const network = shiftProcessor.sanitizeStringInput(req.body.network);
        const total = req.body.total;

		if (!id || !coin || !network || !total) {
            return res.status(400).send("Missing required parameters");
        }
		if (!fakeShopDataBase[id]) return res.status(400).send("Invalid invoice ID");
        
        const totalAmountFIAT = Number(total);
        if (isNaN(totalAmountFIAT) || totalAmountFIAT <= 0 || totalAmountFIAT > 1000000) {
            return res.status(400).send("Invalid total amount");
        }

        // Create shift
        const shift = await shiftProcessor.createFixedShift(coin, network, totalAmountFIAT, shiftProcessor.extractIPInfo(req.ip).address);

        // Activate Polling system
        await checkOrderStatus(shift, shift.settleAddress, shift.settleAmount, id);

        res.redirect(`/payment-status/${shift.id}/${id}`);
    } catch (err) {
        if (verbose) console.error("Error in create-payment:", err);
        res.render('error', { error: {title: "Error creating payment", message: err.message} });
    }
});



// Global tracking object (for demo use)
const redirectTracking = new Map();

function checkInfiniteLoop(shiftId, invoiceId) {
    const key = `${shiftId}_${invoiceId}`;
    let tracking = redirectTracking.get(key) || { count: 0, lastRedirect: Date.now() };

    // Reset counter after 2 minutes of inactivity
    if (Date.now() - tracking.lastRedirect > 120000) {
        tracking.count = 0;
    }

    tracking.count++;
    tracking.lastRedirect = Date.now();
    redirectTracking.set(key, tracking);

    return tracking;
}


const handleCryptoShift = async (req, res, next) => {
    try {
        // Your invoice tracking and costumer data validation here
        const invoiceId = shiftProcessor.sanitizeStringInput(String(req.params.id_invoice));
        if (!invoiceId) throw new Error("Missing invoice ID");
        if (!fakeShopDataBase[invoiceId]) throw new Error("Invalid invoice ID");

        // Shift ID
        const shiftId = shiftProcessor.sanitizeStringInput(String(req.params.id_shift));
        if (!shiftId) throw new Error("Missing shift ID");

        // Prevent infinite loops
        const tracking = checkInfiniteLoop(shiftId, invoiceId);
        if (tracking.count > 50) {
            console.error(`Redirect loop detected for shift ${shiftId}, invoice ${invoiceId}`);
            return res.status(400).send("Something went wrong, too many refresh - please try again later");
        }

        // Process the data
        let shift;
        let shiftData = cryptoPoller.getPollingShiftData(shiftId);
        
        if (shiftData) {
            // Use existing polling data
            shift = { ...shiftData.shift };
            if (verbose) console.log(`Using cached polling data for ${shiftId}`);
        } else {
            try {
                // Try to get fresh data from API first
                shift = await shiftProcessor.sideshift.getShift(shiftId);
                if (verbose) console.log(`Fetched fresh data for ${shiftId} from API`);
            } catch (apiError) {
                if (verbose) console.log(`API fetch failed for ${shiftId}, trying failed data...`);
                
                // Fallback to failed data if available
                const failedData = cryptoPoller.getFailedShiftData(shiftId);
                if (failedData) {
                    shift = { ...failedData.shift };
                    if (verbose) console.log(`Using failed data as fallback for ${shiftId}`);
                } else {
                    // If no failed data, re-throw the API error
                    throw new Error(`Failed to fetch shift data: ${apiError.message}`);
                }
            }
        }
            
        req.shift = shift;
        req.invoice = fakeShopDataBase[invoiceId];
        next();
    } catch (err) {
        if (verbose) console.error("Error - handleCryptoShift:", err);

        if (err.message.includes('Missing')) {
            return res.status(400).send("Bad Request: " + err.message);
        } else {
            return res.status(500).send("Error: " + err.message);
        }
    }
};




app.get("/payment-status/:id_shift/:id_invoice", rateLimiter, handleCryptoShift, (req, res) => {
    const { shift, invoice } = req;
    if (!shift || !invoice) {
        return res.status(400).send("Invalid payment data");
    }
    if(req.invoice.cryptoPaymentStatus === "Error_MaxRetryExceeded") return res.redirect(`/cancel/${shift.id}/${invoice.id}`);

    switch(shift.status) {
        case SIDESHIFT_PAYMENT_STATUS.settled:
            return res.redirect(`/success/${shift.id}/${invoice.id}`);
        case SIDESHIFT_PAYMENT_STATUS.expired:
            return res.redirect(`/cancel/${shift.id}/${invoice.id}`);
        default:
            return res.render('crypto', {
                shift,
                invoice,
                SHOP_SETTING,
            });
    }
});

app.get("/success/:id_shift/:id_invoice", rateLimiter, handleCryptoShift, async (req, res) => {
    try {
        if (req.shift.status !== SIDESHIFT_PAYMENT_STATUS.settled) {
            if (verbose) console.log("Shift not settled yet", req.shift.id, req.invoice.id);
            res.redirect("/payment-status/" + req.shift.id + "/" + req.invoice.id);
        } else {
            const successData = {
                shift: req.shift,
                order: req.invoice
            };
            res.render('cancel-success', { success: successData, SHOP_SETTING });
        }

    } catch (err) {
        if (verbose) console.error("Error in success route:", err);
        res.status(500).send("Error: " + err.message);
    }
});

app.get("/cancel/:id_shift/:id_invoice", rateLimiter, handleCryptoShift, async (req, res) => {
    try {
        const cancelData = {
            shift: req.shift,
            order: req.invoice
        };

        if((req.invoice.cryptoPaymentStatus === "Error_MaxRetryExceeded" || "Canceled_by_User") || req.shift.status === SIDESHIFT_PAYMENT_STATUS.expired){
            return res.render('cancel-success', {cancel: cancelData, SHOP_SETTING});
        }
        
        if (req.shift.status !== SIDESHIFT_PAYMENT_STATUS.expired) {
            if(verbose) console.log("Shift not expired yet", req.shift.id, req.invoice.id);
            return res.redirect("/payment-status/"+req.shift.id+"/"+req.invoice.id);
        } 

    } catch (err) {
        if (verbose) console.error("Error in cancel route:", err);
        res.status(500).send("Error: " + err.message);
    }
});

app.get("/cancel-shift/:id_shift/:id_invoice", rateLimiter, handleCryptoShift, async (req, res) => {
    try {
        if (req.shift.status === SIDESHIFT_PAYMENT_STATUS.waiting) {

            // TODO check if more than 5min since creation, then set timer before cancel on serverside.

            resetCryptoPayment(req.invoice.id, req.shift.id, "Canceled_by_User");
            await cryptoPoller.stopPollingForShift(req.shift.id);
            res.redirect(`/cancel/${req.shift.id}/${req.invoice.id}`);
        } else{
            res.redirect("/payment-status/"+req.shift.id+"/"+req.invoice.id)
        }
    } catch (err) {
        if (verbose) console.error("Error in cancel-shift route:", err);
        res.status(500).send("Error: " + err.message);
    }
});



// For production store coins list in DB so no need to reload each server start
shiftProcessor.updateCoinsList(ICON_PATH).then((response) => {
    console.log('Initial coins list loaded');
	availableCoins = response.availableCoins;

    https.createServer(options, app).listen(PORT, () => {
        console.log(`HTTPS Server running at https://localhost:${PORT}/`);
    });

    setInterval(async () => {
        const result = await shiftProcessor.updateCoinsList(ICON_PATH);
        // Update global variables if needed
        availableCoins = result.availableCoins;
    }, 12 * 60 * 60 * 1000);
}).catch(err => {
    console.error('Failed to load initial coins list:', err);
    process.exit(1);
});
