const logger = require('../../config/logger');

/**
 * Mock IBKR Client — simulates the Client Portal Web API for local development.
 * Enable by setting IBKR_MOCK=true in your .env file.
 *
 * All methods mirror IBKRClient's interface but return fake data
 * with random fills, realistic conids, and simulated latency.
 */

let orderCounter = 100000;

class MockIBKRClient {
  constructor(apiKey, accountId) {
    this.apiKey = apiKey;
    this.accountId = accountId || 'U9999999';
    this.authenticated = false;
    this.tickleInterval = null;
    logger.info(`[MOCK IBKR] Client created for account ${this.accountId}`);
  }

  async authenticate() {
    await this._delay(200);
    this.authenticated = true;
    logger.info(`[MOCK IBKR] Authenticated account ${this.accountId}`);
    return true;
  }

  startTickle() {
    // no-op in mock mode
  }

  stopTickle() {
    if (this.tickleInterval) {
      clearInterval(this.tickleInterval);
      this.tickleInterval = null;
    }
  }

  /**
   * Simulates placing an order.
   * ~90% chance of FILLED, ~10% chance of a simulated failure.
   */
  async placeOrder({ symbol, action, quantity, orderType, limitPrice }) {
    await this._delay(300 + Math.random() * 500);

    const orderId = String(++orderCounter);
    const shouldFail = Math.random() < 0.1; // 10% failure rate

    if (shouldFail) {
      logger.warn(`[MOCK IBKR] Order FAILED — ${action} ${quantity} ${symbol}`);
      throw new Error(`Mock IBKR: Simulated order rejection for ${symbol}`);
    }

    const basePrice = this._fakePrice(symbol);
    const filledPrice = orderType === 'LIMIT' && limitPrice
      ? limitPrice
      : +(basePrice * (1 + (Math.random() * 0.002 - 0.001))).toFixed(2);

    logger.info(
      `[MOCK IBKR] Order FILLED — ${action} ${quantity} ${symbol} @ $${filledPrice} (orderId: ${orderId})`
    );

    return {
      order_id: orderId,
      order_status: 'Filled',
      encrypt_message: '1',
    };
  }

  async _resolveConid(symbol) {
    await this._delay(100);
    // Deterministic fake conid based on symbol characters
    const hash = [...symbol].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return hash * 1000 + 265598;
  }

  async getOrderStatus(orderId) {
    await this._delay(150);
    return {
      orderId,
      status: 'Filled',
      filledQuantity: 100,
      avgPrice: 150.25,
      side: 'BUY',
      ticker: 'MOCK',
    };
  }

  async getPositions() {
    await this._delay(200);
    return [
      {
        conid: 265598,
        contractDesc: 'AAPL',
        position: 100,
        mktPrice: 178.50,
        avgCost: 165.30,
        unrealizedPnl: 1320.00,
        currency: 'USD',
      },
      {
        conid: 272093,
        contractDesc: 'MSFT',
        position: 50,
        mktPrice: 415.20,
        avgCost: 380.10,
        unrealizedPnl: 1755.00,
        currency: 'USD',
      },
    ];
  }

  async getAccount() {
    await this._delay(150);
    return {
      accounts: [this.accountId],
      selectedAccount: this.accountId,
    };
  }

  destroy() {
    this.stopTickle();
    this.authenticated = false;
    logger.info(`[MOCK IBKR] Client destroyed for account ${this.accountId}`);
  }

  // --- Helpers ---

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _fakePrice(symbol) {
    const prices = {
      AAPL: 178.50, MSFT: 415.20, GOOGL: 141.80, AMZN: 182.30,
      TSLA: 245.60, META: 505.70, NVDA: 890.40, SPY: 512.30,
    };
    return prices[symbol.toUpperCase()] || 100 + Math.random() * 200;
  }
}

module.exports = MockIBKRClient;
