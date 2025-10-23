// SideShift API payment integration Node.js - Demo shop
require('dotenv').config({ quiet: true }); //  debug: true 

const express = require('express');
const fs = require('fs');

// Create Express app
const app = express();
const port = 3003;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'pug');
app.set('views', __dirname + '/views');
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.redirect('selection');
});

// Rate limiter
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

// Path to store downloaded icons
const ICON_PATH = './public/icons';

const BASE_URL = process.env.BASE_URL; // Server URL


// function to Reset/Cancel Crypto payment
function resetCryptoPayment(shiftId, invoiceId, status) {
    if (fakeShopDataBase[invoiceId]) {
        fakeShopDataBase[invoiceId].cryptoPaymentOption = "";
        fakeShopDataBase[invoiceId].cryptoPaymentStatus = status;
        fakeShopDataBase[invoiceId].cryptoTotal = "";
        fakeShopDataBase[invoiceId].payWith = "";
        fakeShopDataBase[invoiceId].isMemo = "";
        fakeShopDataBase[invoiceId].cryptoFailedPayment.push({ type: "crypto", id: shiftId });
        fakeShopDataBase[invoiceId].status = "waiting";
    }
}

// function to Confirm Crypto payment
function confirmCryptoPayment(shiftId, invoiceId) {
    if (fakeShopDataBase[invoiceId]) {
        fakeShopDataBase[invoiceId].paymentId = shiftId;
        fakeShopDataBase[invoiceId].cryptoPaymentStatus = "settled";
        fakeShopDataBase[invoiceId].status = "confirmed";
    }
}

// Shop configuration
const CURRENCY_SETTING = {};
CURRENCY_SETTING.locale = "en-EN";
CURRENCY_SETTING.currency = "USD"; // USD EUR CNY INR JPY ... use ISO4217 currency codes
CURRENCY_SETTING.USD_REFERENCE_COIN = "USDT-bsc"; // Must be a 'coin-network' from the SideShift API
CURRENCY_SETTING.SHIF_LIMIT_USD = 20000; // USD

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
    coin: "CAKE",
    network: "bsc",
    address: process.env.WALLET_ADDRESS, // Your wallet address
    isMemo: [false, ""] // Set to [false, ""] or if your wallet need a Memo set to [true, "YourMemoHere"]
};

// SECONDARY_WALLET is only needed for custom integration if you need to accept payment with same coin as MAIN_WALLET
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
    path: "./Sideshift_API_module/sideshiftAPI.js", // Path to module file
    // iconsPath: ICON_PATH,
    secret: process.env.SIDESHIFT_SECRET, // "Your_SideShift_secret";
    id: process.env.SIDESHIFT_ID, // "Your_SideShift_ID"; 
    commissionRate: "0.5", // Optional - commision rate setting from 0 to 2
    verbose: true // verbose mode true/false
};

// Use SideShift verbose setting
const verbose = SIDESHIFT_CONFIG.verbose;

// Load the crypto payment processor
const ShiftProcessor = require('./Shift-Processor/ShiftProcessor.js');
const shiftProcessor = new ShiftProcessor({ wallets: WALLETS, sideshiftConfig: SIDESHIFT_CONFIG, currencySetting: CURRENCY_SETTING });

// Load the payment poller system
const PaymentPoller = require('./Shift-Processor/CryptoPaymentPoller.js');
const cryptoPoller = new PaymentPoller({ shiftProcessor, intervalTimeout: 30000, resetCryptoPayment, confirmCryptoPayment }); // import SideShift API and set interval delay in ms


// Set basic variables
let availableCoins = null;
let rawCoinList = null; // if you need full coin list data

// Demo variables
let fakeShopDataBase = {}; // Demo object to simulate your storage
const fakeInvoice = {
    id: "",
    total: "",
    cryptoTotal: "",
    payWith: "",
    isMemo: false,
    cryptoPaymentOption: "",
    cryptoPaymentStatus: "",
    paymentId: "",
    cryptoFailedPayment: [],
    status: ""
};

function createDemoCostumer(orderId, total, settleAmount, payWithCoin, memo = null) {
    fakeShopDataBase[orderId] = fakeInvoice;
    fakeShopDataBase[orderId].id = orderId;
    fakeShopDataBase[orderId].total = total;
    fakeShopDataBase[orderId].status = "created";
    fakeShopDataBase[orderId].cryptoPaymentOption = "crypto";
    fakeShopDataBase[orderId].cryptoPaymentStatus = "waiting";
    fakeShopDataBase[orderId].cryptoTotal = settleAmount;
    fakeShopDataBase[orderId].payWith = payWithCoin;
    fakeShopDataBase[orderId].isMemo = memo ? String(memo) : false;
    fakeShopDataBase[orderId].secretHash = "";
    fakeShopDataBase[orderId].paymentId = "";
}



//-----------------------------
// Chechout payment integration
//-----------------------------

async function generateCheckout({ settleCoin, settleNetwork, settleAddress, settleMemo = null, settleAmount, successUrl, cancelUrl, userIp }) {
    let checkout;
    try {
        checkout = await shiftProcessor.requestCheckout({
            settleCoin,
            settleNetwork,
            settleAddress,
            settleMemo,
            settleAmount,
            successUrl,
            cancelUrl,
            userIp,
        })

    } catch (error) {
        throw new Error('Cannot create checkout', error);
    }

    if (!checkout.link) throw new Error('No sideshift redirection link');

    return checkout;
}

const createSideShiftHook = require('./Shift-Processor/sideshift-webhook.js');
// createSideShiftHook(BASE_URL, process.env.SIDESHIFT_SECRET); // Uncomment to activate webhook

function webhookDataConfirmation(notification, invoice, wallet) {
    if (Number(notification.settleAmount) === Number(invoice.cryptoTotal) && notification.settleCoin.toLowerCase() === MAIN_WALLET.coin.toLowerCase() && notification.settleNetwork.toLowerCase() === MAIN_WALLET.network.toLowerCase()) {
        return true;
    } else {
        return false;
    }
}

// SidesShift notification webhook
app.post('/api/webhooks/sideshift', (req, res) => {
    const notification = req.body;
    if (verbose) console.log('Received webhook notification:', notification);

    const notificationId = notification.id;

    const invoiceId = Object.values(fakeShopDataBase).find(order =>
        order.paymentId === notificationId
    );

    if (!fakeShopDataBase[invoiceId]) return res.status(400).send('Invalid ID');

    if (notification.status === ("completed")) {
        confirmCryptoPayment(notification.id, invoiceId)
    }

    if (notification.status === "cancelled") {
        resetCryptoPayment(notification.id, invoiceId, "cancelled by user")
    }

    // Respond with 200 OK
    res.status(200).send('Webhook received');
});

// Checkout routes
app.post("/create-checkout", paymentLimiter, async function (req, res) {
    try {
        const { total, orderId } = req.body;

        const settleCoin = MAIN_WALLET.coin;
        const settleNetwork = MAIN_WALLET.network;
        const settleAmount = await shiftProcessor.usdToSettleAmount(total, settleCoin, settleNetwork);

        const secretHash = "GenerateYourSecretHash";

        const checkout = await generateCheckout({
            settleCoin: settleCoin,
            settleNetwork: settleNetwork,
            settleAddress: MAIN_WALLET.address,
            settleMemo: null,
            settleAmount: Number(settleAmount),
            successUrl: `${BASE_URL}/checkout/success/${orderId}/${secretHash}`,
            cancelUrl: `${BASE_URL}/checkout/cancel/${orderId}/${secretHash}`,
            userIp: shiftProcessor.helper.extractIPInfo(req.ip).address,
        })

        // Store checkout ID and secret hash
        fakeShopDataBase[orderId].secretHash = secretHash;
        fakeShopDataBase[orderId].paymentId = checkout.id;

        res.redirect(checkout.link);
    } catch (err) {
        if (verbose) console.error("Error in create-checkout:", err);
        return res.render('error', { error: { title: "Error creating checkout", message: err.message } });
    }
});

app.get("/checkout/:status/:orderId/:secret", rateLimiter, async (req, res) => {
    try {
        const status = req.params.status;
        const orderId = req.params.orderId;
        const secretHash = req.params.secret;

        if (!secretHash || !orderId) throw new Error('Success-checkout - Missing parameter')
        if (fakeShopDataBase[orderId].secretHash === secretHash) throw new Error('Success-checkout - Invalid secret hash')


        if (status === "success") {
            // Note: You should check shift status as double confirmation before processing

            const successData = {
                order: fakeShopDataBase[invoiceId]
            };
            return res.render('cancel-success', { success: successData });
        } else if(status === "cancel") {
            const cancelData = {
                order: fakeShopDataBase[invoiceId]
            };
            return res.render('cancel-success', { cacel: cancelData });

        } else{
            // error
        }

    } catch (err) {
        if (verbose) console.error("Error in success route:", err);
        return res.status(500).render('error', { error: { title: "Error", message: err.message } });
    }
});


//------------------
// Checkout donation 
//------------------

app.post("/donate-checkout", paymentLimiter, async function (req, res) {
    const { total } = req.body;

    const settleCoin = MAIN_WALLET.coin;
    const settleNetwork = MAIN_WALLET.network;
    const settleAmount = await shiftProcessor.usdToSettleAmount(total, settleCoin, settleNetwork);

    const checkout = await generateCheckout({
        settleCoin: settleCoin,
        settleNetwork: settleNetwork,
        settleAddress: MAIN_WALLET.address,
        settleMemo: null,
        settleAmount: Number(settleAmount),
        successUrl: `${BASE_URL}/thanks`,
        cancelUrl: `${BASE_URL}/cancel`,
        userIp: shiftProcessor.helper.extractIPInfo(req.ip).address,
    })

    res.redirect(checkout.link);
});


//-----------------
// Checkout Paywall
//-----------------

let validHash = {
};

app.get("/paywall", rateLimiter, function (req, res) {
    try {
        // Test if settle Wallets are available on SideShift API
        const settleWalletStatus = shiftProcessor.isSettleCoinOnline();
        if (settleWalletStatus[0] === false) {
            throw new Error('Settle Wallet is unavailable, try later or select another payment method');
        }

        return res.render('paywall');
    } catch (err) {
        return res.render('error', { error: { title: "Settle Wallet Error", message: err.message } });
    }
});

app.get("/content/:id/:hash", rateLimiter, function (req, res) {
    try {
        const hash = req.params.hash
        if (validHash[hash] && validHash[hash] == req.params.id) {
            return res.render('paywall', { data: { contentId: validHash[hash], message: "Good Job Human!" } });
        } else {
            return res.render('paywall');
        }

    } catch (err) {
        return res.render('error', { error: { title: "Settle Wallet Error", message: err.message } });
    }
});

app.post("/paywall", paymentLimiter, async function (req, res) {
    const { total, contentId } = req.body;

    const settleCoin = MAIN_WALLET.coin;
    const settleNetwork = MAIN_WALLET.network;
    const settleAmount = await shiftProcessor.usdToSettleAmount(total, settleCoin, settleNetwork);

    const secretHash = "HereSomeSecretHash"
    // Store Valid hash and associated content
    validHash[secretHash] = contentId; // access content nr 5


    const checkout = await generateCheckout({
        settleCoin: settleCoin,
        settleNetwork: settleNetwork,
        settleAddress: MAIN_WALLET.address,
        settleMemo: null,
        settleAmount: Number(settleAmount),
        successUrl: `${BASE_URL}/content/${contentId}/${secretHash}`,
        cancelUrl: `${BASE_URL}/paywall`,
        userIp: shiftProcessor.helper.extractIPInfo(req.ip).address,
    })

    res.redirect(checkout.link);
});




//---------------------------
// Custom Payment integration
//---------------------------

// Set currency setting on all pages
app.locals.CURRENCY_SETTING = CURRENCY_SETTING;
// or inside next
// app.use((req, res, next) => {
//     res.locals.CURRENCY_SETTING = CURRENCY_SETTING;
//     next();
// });


// Payment creation
// ----------------

app.get("/selection", rateLimiter, function (req, res) {
    try {
        // Test if settle Wallets are available on SideShift API
        const settleWalletStatus = shiftProcessor.isSettleCoinOnline();
        if (settleWalletStatus[0] === false) {
            throw new Error('Settle Wallet is unavailable, try later or select another payment method');
        }

        const coinsList = availableCoins ? availableCoins.sort() : null;

        return res.render('select-payment-method', { coinsDepositList: coinsList, currency: CURRENCY_SETTING.currency });
    } catch (err) {
        return res.render('error', { error: { title: "Settle Wallet Error", message: err.message } });
    }
});

app.post("/create-quote", paymentLimiter, async function (req, res) {
    try {
        const total = req.body.total; // Demo integration do not use in production
        if (!total) throw new Error("Missing total amount");
        if (isNaN(Number(total)) || Number(total) <= 0) {
            throw new Error("Invalid total amount");
        }

        const orderId = shiftProcessor.helper.sanitizeString(req.body.orderId);
        if (!orderId) throw new Error("Wrong order ID, must be a string");

        // validate selected coin
        if (!req.body.payWith) throw new Error("Missing input coin");

        const payWith = JSON.parse(req.body.payWith);
        if (!payWith) throw new Error("Can't parse input coin");

        const payWithCoin = shiftProcessor.helper.sanitizeString(payWith[0]);
        if (!payWithCoin) throw new Error("Missing input coin");

        // Get necessary data fron API
        const data = await shiftProcessor.getSettlementData(Number(total), payWithCoin);

        // Set basic costumer data
        if (!req.body.memo) {
            createDemoCostumer(orderId, total, data.settleAmount, payWithCoin, payWith[1]);
        } else {
            createDemoCostumer(orderId, total, data.settleAmount, payWithCoin, payWith[1], req.body.memo);
        }

        return res.render('crypto', { ratio: data.pairData, invoice: fakeShopDataBase[orderId] });
    } catch (err) {
        if (verbose) console.error("POST create-quote:", err);
        if (err.message.toLowerCase().includes('amount') && (err.message.includes('is below') || err.message.includes('is above'))) {
            return res.render('error', { error: { title: "Amount error", message: err.message } });
        } else {
            return res.render('error', { error: { title: "Error creating quote", message: err.message } });
        }
    }
});

app.post("/create-payment", paymentLimiter, async function (req, res) {
    try {
        const id = shiftProcessor.helper.sanitizeString(req.body.id);
        const coin = shiftProcessor.helper.sanitizeString(req.body.coin);
        const network = shiftProcessor.helper.sanitizeString(req.body.network);
        const total = req.body.total;

        if (!id || !coin || !network || !total) {
            return res.status(400).send("Missing required parameters");
        }
        if (!fakeShopDataBase[id]) return res.status(400).send("Invalid invoice ID");

        const totalAmountFIAT = Number(total);
        if (isNaN(totalAmountFIAT) || totalAmountFIAT <= 0 || totalAmountFIAT > CURRENCY_SETTING.SHIF_LIMIT_USD) {
            return res.status(400).render('error', { error: { title: "Invalid total amount", message: "Invalid total amount" } });
        }

        // check if coin-network exist on SideShift coin list
        const isValidCoin = shiftProcessor.helper.isCoinValid(`${coin}-${network}`);
        if (!isValidCoin) return res.status(400).render('error', { error: { title: "Invalid coin/network", message: "Invalid coin or network" } });

        // Create shift with memo if needed
        const shift = await shiftProcessor.createCryptocurrencyPayment({
            depositCoin: coin,
            depositNetwork: network,
            amountFiat: totalAmountFIAT,
            userIp: shiftProcessor.helper.extractIPInfo(req.ip).address,
            ...(fakeShopDataBase[id].isMemo !== false && { "refundMemo": fakeShopDataBase[id].isMemo })
        });

        // Activate Polling system
        cryptoPoller.addPayment({ shift, settleAddress: shift.settleAddress, settleAmount: shift.settleAmount, customId: id });

        res.redirect(`/payment-status/${shift.id}/${id}`);
    } catch (err) {
        if (verbose) console.error("Error in create-payment:", err);
        return res.render('error', { error: { title: "Error creating payment", message: err.message } });
    }
});


// Payment Processing
// ------------------

// polling system route
app.get('/polling/api', async (req, res) => {
    const { shiftId } = req.query;

    let results = await cryptoPoller.getPollingShiftData(shiftId);

    res.json(results.shift);
});

// Global tracking object (for demo use)
const redirectTracking = new Map(); // Note: need to clean mapping to avoid it going to infinity

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
        // Replace with your invoice tracking and costumer data validation here
        const invoiceId = shiftProcessor.helper.sanitizeString(String(req.params.id_invoice));
        if (!invoiceId) throw new Error("Missing invoice ID");
        if (!fakeShopDataBase[invoiceId]) throw new Error("Invalid invoice ID");

        // Verify Shift ID
        const shiftId = shiftProcessor.helper.sanitizeString(String(req.params.id_shift));
        if (!shiftId) throw new Error("Missing shift ID");

        // Prevent infinite loops
        const tracking = checkInfiniteLoop(shiftId, invoiceId);
        if (tracking.count > 150) {
            console.error(`Redirect loop detected for shift ${shiftId}, invoice ${invoiceId}`);
            return res.status(400).send("Something went wrong, too many refresh - please try again later");
        }

        // Process the shift data
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
            return res.status(400).render('error', { error: { title: "Bad Request", message: err.message } });
        } else {
            // return res.status(500).send("Error: " + err.message);
            return res.status(500).render('error', { error: { title: "Error", message: err.message } });
        }
    }
};


// Payment validation routes
// -------------------------

app.get("/payment-status/:id_shift/:id_invoice", rateLimiter, handleCryptoShift, (req, res) => {
    const { shift, invoice } = req;
    if (!shift || !invoice) {
        return res.status(400).send("Invalid payment data");
    }

    let processedDepositAddress = shift.depositAddress;
    if (processedDepositAddress.includes(':')) {
        const parts = processedDepositAddress.split(':');
        if (parts.length > 1) {
            processedDepositAddress = parts[1];
        }
    }

    const depositLink = shiftProcessor.helper.getNetworkExplorer(shift.depositNetwork) + processedDepositAddress;
    if (req.invoice.cryptoPaymentStatus === "Error_MaxRetryExceeded") return res.redirect(`/cancel/${shift.id}/${invoice.id}`);

    switch (shift.status) {
        case SIDESHIFT_PAYMENT_STATUS.settled:
            return res.redirect(`/success/${shift.id}/${invoice.id}`);
        case SIDESHIFT_PAYMENT_STATUS.expired:
            return res.redirect(`/cancel/${shift.id}/${invoice.id}`);
        default:
            return res.render('crypto', {
                shift,
                invoice,
                CURRENCY_SETTING,
                ...(depositLink && { "depositLink": depositLink }),
            });
    }
});

app.get("/success/:id_shift/:id_invoice", rateLimiter, handleCryptoShift, async (req, res) => {
    try {
        if (req.shift.status !== SIDESHIFT_PAYMENT_STATUS.settled) {
            if (verbose) console.log("Shift not settled yet", req.shift.id, req.invoice.id);
            return res.redirect(`/payment-status/${req.shift.id}/${req.invoice.id}`);
        } else {
            const successData = {
                shift: req.shift,
                order: req.invoice
            };
            return res.render('cancel-success', { success: successData });
        }

    } catch (err) {
        if (verbose) console.error("Error in success route:", err);
        return res.status(500).render('error', { error: { title: "Error", message: err.message } });
    }
});

app.get("/cancel/:id_shift/:id_invoice", rateLimiter, handleCryptoShift, async (req, res) => {
    try {
        const cancelData = {
            shift: req.shift,
            order: req.invoice
        };

        if ((req.invoice.cryptoPaymentStatus === "Error_MaxRetryExceeded" || "Canceled_by_User") || req.shift.status === SIDESHIFT_PAYMENT_STATUS.expired) {
            return res.render('cancel-success', { cancel: cancelData });
        }

        if (req.shift.status !== SIDESHIFT_PAYMENT_STATUS.expired) {
            if (verbose) console.log("Shift not expired yet", req.shift.id, req.invoice.id);
            return res.redirect(`/payment-status/${req.shift.id}/${req.invoice.id}`);
        }

    } catch (err) {
        if (verbose) console.error("Error in cancel route:", err);
        return res.status(500).render('error', { error: { title: "Error", message: err.message } });
    }
});


// Global map to store timeout IDs per shift ID
const shiftTimeouts = new Map();

app.get("/cancel-shift/:id_shift/:id_invoice", rateLimiter, handleCryptoShift, async (req, res) => {
    try {
        const shiftId = req.shift.id;
        const invoiceId = req.invoice.id;

        // If there's already a timeout for this shift, skip setting a new one
        if (shiftTimeouts.has(shiftId)) {
            if (verbose) console.log(`Timeout already exists for shift ${shiftId}, skipping...`);
            return res.redirect(`/cancel/${shiftId}/${invoiceId}`);
        }

        if (req.shift.status === SIDESHIFT_PAYMENT_STATUS.waiting) {
            const shiftCreatedAt = new Date(req.shift.createdAt);
            const now = new Date();
            const timeDiffMinutes = (now - shiftCreatedAt) / (1000 * 60);

            if (timeDiffMinutes > 5) {
                // More than 5 minutes old - cancel immediately
                await shiftProcessor.sideshift.cancelOrder(shiftId);
                resetCryptoPayment(shiftId, invoiceId, "Canceled_by_User");
                await cryptoPoller.stopPollingForShift(shiftId);
                res.redirect(`/cancel/${shiftId}/${invoiceId}`);
            } else {
                if (verbose) console.log(`Setting delayed cancellation for shift ${shiftId}`);

                const timeLeftMs = Math.max(0, (5 * 60 * 1000) - (timeDiffMinutes * 60 * 1000));

                const timeoutId = setTimeout(async () => {
                    try {
                        if (verbose) console.log(`Executing delayed cancellation for shift ${shiftId}`);
                        // Clean up before execution
                        shiftTimeouts.delete(shiftId);
                        await shiftProcessor.sideshift.cancelOrder(shiftId);
                        if (verbose) console.log(`Successfully cancelled shift ${shiftId}`);
                    } catch (err) {
                        if (verbose) console.error("Error in delayed cancellation:", err);
                    }
                }, timeLeftMs);

                // Store timeout ID so we don't create another one
                shiftTimeouts.set(shiftId, timeoutId);

                // Set cancel status immediately for UI feedback
                resetCryptoPayment(shiftId, invoiceId, "Canceled_by_User");
                await cryptoPoller.stopPollingForShift(shiftId);
                res.redirect(`/cancel/${shiftId}/${invoiceId}`);
            }
        } else {
            res.redirect(`/payment-status/${shiftId}/${invoiceId}`);
        }
    } catch (err) {
        if (verbose) console.error("Error in cancel-shift route:", err);
        return res.status(500).render('error', { error: { title: "Error", message: err.message } });
    }
});


//---------------------------
// Custom integration - Donation using variable shift
//---------------------------

app.post("/donate-custom", paymentLimiter, async function(req,res) {
    const { payWith } = req.body;

    const settleCoin = MAIN_WALLET.coin;
    const settleNetwork = MAIN_WALLET.network;

    const [depositCoin, depositNetwork] = JSON.parse(payWith)[0].split('-');

    const donation = await shiftProcessor.createVariableShift({
        depositCoin,
        depositNetwork,
        settleCoin: settleCoin,
        settleNetwork: settleNetwork,
        settleAddress: MAIN_WALLET.address,
        userIp: shiftProcessor.helper.extractIPInfo(req.ip).address,
    })

    res.redirect(`/donation-status/${donation.id}`);
});

app.get("/donation-status/:shiftId", rateLimiter, async (req, res) => {
    const shift = await shiftProcessor.sideshift.getShift(req.params.shiftId);

    switch (shift.status) {
        case SIDESHIFT_PAYMENT_STATUS.settled:
            return res.redirect(`/success/${shift.id}`); // You need to adapt the landing page to work without invoiceId
        case SIDESHIFT_PAYMENT_STATUS.expired:
            return res.redirect(`/cancel/${shift.id}`); // You need to adapt the landing page to work without invoiceId
        default:
            return res.render('crypto', { // You need to adapt crypto.pug and remove the invoice variable
                shift,
                invoice: {id: "donation"}
            });
    }
});



//--------------------------------------------------------------
// Start server after receiving the coin list from sideshift API
//--------------------------------------------------------------

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
        // Update global variables if needed
        availableCoins = result.availableCoins;
        rawCoinList = result.rawCoinList;
    }, 12 * 60 * 60 * 1000);

}).catch(err => {
    console.error('Failed to load initial settings:', err);
    process.exit(1);
});
