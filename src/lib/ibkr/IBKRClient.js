const logger = require('../../config/logger');

/**
 * IBKR Client Portal Web API wrapper.
 * The Client Portal API is session-based REST — each user session
 * must be authenticated and kept alive with a periodic "tickle".
 */
class IBKRClient {
  constructor(apiKey, accountId) {
    this.apiKey = apiKey;
    this.accountId = accountId;
    this.baseUrl = process.env.IBKR_BASE_URL || 'https://localhost:5000/v1/api';
    this.authenticated = false;
    this.tickleInterval = null;
  }

  /**
   * Make an HTTP request to the IBKR Client Portal API.
   * Uses native fetch (Node 18+). IBKR's Client Portal uses self-signed certs
   * in local gateway mode — in production, configure proper TLS.
   */
  async _request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BotifyTrade/1.0',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`IBKR API error ${response.status}: ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  /**
   * Authenticate with IBKR Client Portal.
   * In practice, the Client Portal Gateway handles auth via browser SSO.
   * This method validates that the session is active.
   */
  async authenticate() {
    try {
      // /iserver/auth/status checks if there's an active brokerage session
      const status = await this._request('POST', '/iserver/auth/status');
      this.authenticated = status.authenticated === true;

      if (!this.authenticated) {
        // Attempt to re-authenticate the session
        await this._request('POST', '/iserver/reauthenticate');
        const recheck = await this._request('POST', '/iserver/auth/status');
        this.authenticated = recheck.authenticated === true;
      }

      if (this.authenticated) {
        logger.info(`IBKR session authenticated for account ${this.accountId}`);
        this.startTickle();
      } else {
        logger.warn(`IBKR session not authenticated for account ${this.accountId}`);
      }

      return this.authenticated;
    } catch (error) {
      logger.error(`IBKR auth error for account ${this.accountId}: ${error.message}`);
      this.authenticated = false;
      throw error;
    }
  }

  /**
   * Keep the IBKR session alive by sending a tickle request every 55 seconds.
   * IBKR sessions expire after ~60s of inactivity.
   */
  startTickle() {
    this.stopTickle();
    this.tickleInterval = setInterval(async () => {
      try {
        await this._request('POST', '/tickle');
      } catch (error) {
        logger.error(`IBKR tickle failed for account ${this.accountId}: ${error.message}`);
      }
    }, 55000);
  }

  stopTickle() {
    if (this.tickleInterval) {
      clearInterval(this.tickleInterval);
      this.tickleInterval = null;
    }
  }

  /**
   * Place an order via the IBKR Client Portal API.
   * @param {Object} params - { symbol, action, quantity, orderType, limitPrice }
   * @returns {Object} - IBKR order response containing order ID
   */
  async placeOrder({ symbol, action, quantity, orderType, limitPrice }) {
    // IBKR order format — conid (contract ID) must be resolved from symbol first
    const conid = await this._resolveConid(symbol);

    const orderPayload = {
      orders: [
        {
          conid,
          orderType: orderType === 'MARKET' ? 'MKT' : 'LMT',
          side: action, // BUY or SELL
          quantity,
          tif: 'DAY', // Time in force: DAY order
          ...(orderType === 'LIMIT' && limitPrice ? { price: limitPrice } : {}),
        },
      ],
    };

    // IBKR may return a confirmation message that requires a reply
    const result = await this._request(
      'POST',
      `/iserver/account/${this.accountId}/orders`,
      orderPayload
    );

    // Handle order confirmation reply (IBKR sometimes asks "are you sure?")
    if (result && Array.isArray(result) && result[0]?.id) {
      // Confirm the order if IBKR returns a confirmation prompt
      const confirmed = await this._request(
        'POST',
        `/iserver/reply/${result[0].id}`,
        { confirmed: true }
      );
      return confirmed;
    }

    return result;
  }

  /**
   * Resolve a stock symbol to an IBKR contract ID (conid).
   * Required before placing any order.
   */
  async _resolveConid(symbol) {
    const results = await this._request('GET', `/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}`);

    if (!results || !Array.isArray(results) || results.length === 0) {
      throw new Error(`No IBKR contract found for symbol: ${symbol}`);
    }

    // Return the first matching stock contract ID
    return results[0].conid;
  }

  /**
   * Get the status of a specific order.
   */
  async getOrderStatus(orderId) {
    const orders = await this._request('GET', `/iserver/account/orders`);
    if (orders && orders.orders) {
      return orders.orders.find((o) => o.orderId === orderId) || null;
    }
    return null;
  }

  /**
   * Get current portfolio positions for this account.
   */
  async getPositions() {
    return this._request('GET', `/portfolio/${this.accountId}/positions/0`);
  }

  /**
   * Get account information.
   */
  async getAccount() {
    return this._request('GET', '/iserver/accounts');
  }

  /**
   * Clean up: stop tickle interval.
   */
  destroy() {
    this.stopTickle();
    this.authenticated = false;
  }
}

module.exports = IBKRClient;
