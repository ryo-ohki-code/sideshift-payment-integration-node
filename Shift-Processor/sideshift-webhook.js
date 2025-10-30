const webhookManager = require('./webhook-manager');

async function createNewWebhook(WEBSITE_URL, SIDESHIFT_SECRET) {
    const url = 'https://sideshift.ai/graphql';
    const secretKey = SIDESHIFT_SECRET;
    const targetUrl = `${WEBSITE_URL}/api/webhooks/sideshift`;

    const payload = {
        query: `mutation { createHook(targetUrl: "${targetUrl}") { id createdAt updatedAt targetUrl enabled } }`
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-sideshift-secret': secretKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Webhook connection success:', result);

        return result;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

async function deleteWebhook(SIDESHIFT_SECRET) {
    const url = 'https://sideshift.ai/graphql';
    const secretKey = SIDESHIFT_SECRET;
    const hook = await webhookManager.getWebhookData();
    const hookId = hook.createHook.id;

    const payload = {
        query: `mutation { deleteHook(id: "${hookId}") }`
    };


    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-sideshift-secret': secretKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
    
        webhookManager.deleteData();
        console.log('Webhook connection successfuly deleted:', result);

        return result;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

async function setupSideShiftWebhook(WEBSITE_URL, SIDESHIFT_SECRET) {
  if (webhookManager.isInitialized()) {
    console.log('Webhook already initialized');
    const existingData = webhookManager.getWebhookData();
    console.log('Existing webhook data:', existingData);
    return existingData;
  }

  // Create new webhook
  const webhookData = await createNewWebhook(WEBSITE_URL, SIDESHIFT_SECRET);
  
  // Save the webhook
  webhookManager.saveData(webhookData);
  
  return webhookData;
}

module.exports = {
    setupSideShiftWebhook,
    deleteWebhook
};
