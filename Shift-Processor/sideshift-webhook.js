async function createSideShiftHook(BASE_URL, SIDESHIFT_SECRET) {
    const url = 'https://sideshift.ai/graphql';
    const secretKey = SIDESHIFT_SECRET;
    const targetUrl = `${BASE_URL}/api/webhooks/sideshift`;

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
        console.log('Success:', result);
        return result;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

module.exports = createSideShiftHook;