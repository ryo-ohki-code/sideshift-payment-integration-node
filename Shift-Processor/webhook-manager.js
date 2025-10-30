const fs = require('fs');

class WebhookManager {
  constructor() {
    this.statusFile = __dirname + '/webhook-status.json';
  }

  saveData(data) {
    try {
      const statusData = {
        initialized: true,
        data: data,
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync(this.statusFile, JSON.stringify(statusData, null, 2));
      console.log('Webhook status saved successfully');
    } catch (error) {
      console.error('Failed to save webhook status:', error);
      throw error;
    }
  }

  deleteData(){
    try {
      fs.writeFileSync(this.statusFile, JSON.stringify({}, null, 2));
    } catch (error) {
      console.error('Failed to save webhook status:', error);
      throw error;
    }
  }

  getData() {
    try {
      if (!fs.existsSync(this.statusFile)) {
        return null;
      }
      
      const data = fs.readFileSync(this.statusFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to read webhook status:', error);
      return null;
    }
  }

  isInitialized() {
    const status = this.getData();
    return status && status.initialized;
  }

  getWebhookData() {
    const status = this.getData();
    return status ? status.data : null;
  }
}

module.exports = new WebhookManager();
