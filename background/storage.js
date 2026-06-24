export const storage = {
  async get(key) {
    const data = await chrome.storage.local.get(key);
    return data[key];
  },

  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },

  async getGroups() {
    return (await this.get('groups')) || [];
  },

  async saveGroups(groups) {
    await this.set('groups', groups);
  },

  async getStats() {
    return (await this.get('stats')) || {
      date: new Date().toDateString(),
      timeSpent: {}, 
      refractoryEnds: {} 
    };
  },

  async saveStats(stats) {
    await this.set('stats', stats);
  }
};
