const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const Joi = require('joi');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3005;

// Allowed origins for CORS
const allowedOrigins = [
  'http://localhost:5173', // Vite default port
  'http://localhost:3000',
  'https://flow-3-ds.vercel.app', // Update with your actual Vercel URL
  process.env.FRONTEND_URL
].filter(Boolean);

// CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'CORS policy does not allow access from the specified origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.options('*', cors());
app.use(express.json());

// Validation schemas
const configSchema = Joi.object({
  merchantId: Joi.string().required().max(40),
  username: Joi.string().required(),
  password: Joi.string().required().min(8),
  apiBaseUrl: Joi.string().uri().required(),
  apiVersion: Joi.string().default('73')
});

const initiateAuthSchema = Joi.object({
  merchantId: Joi.string().required(),
  username: Joi.string().required(),
  password: Joi.string().required(),
  apiBaseUrl: Joi.string().uri().required(),
  apiVersion: Joi.string().default('73'),
  orderId: Joi.string().required(),
  transactionId: Joi.string().required(),
  currency: Joi.string().length(3).required(),
  amount: Joi.string().required(),
  cardNumber: Joi.string().required(),
  expiryMonth: Joi.string().length(2).required(),
  expiryYear: Joi.string().length(2).required(),
  cvv: Joi.string().min(3).max(4).optional()
});

const authenticatePayerSchema = Joi.object({
  merchantId: Joi.string().required(),
  username: Joi.string().required(),
  password: Joi.string().required(),
  apiBaseUrl: Joi.string().uri().required(),
  apiVersion: Joi.string().default('73'),
  orderId: Joi.string().required(),
  transactionId: Joi.string().required(),
  redirectHtml: Joi.string().optional()
});

const authorizePaySchema = Joi.object({
  merchantId: Joi.string().required(),
  username: Joi.string().required(),
  password: Joi.string().required(),
  apiBaseUrl: Joi.string().uri().required(),
  apiVersion: Joi.string().default('73'),
  orderId: Joi.string().required(),
  transactionId: Joi.string().required()
});

// Helper function to create Basic Auth token
function createAuthToken(username, password) {
  return Buffer.from(`${username}:${password}`).toString('base64');
}

// Helper function to mask sensitive data in logs
function maskSensitiveData(data) {
  const masked = { ...data };
  if (masked.password) masked.password = '****';
  if (masked.cvv) masked.cvv = '***';
  if (masked.cardNumber) {
    masked.cardNumber = masked.cardNumber.slice(0, 6) + '******' + masked.cardNumber.slice(-4);
  }
  return masked;
}

// STEP 1: Initiate Authentication
// Checks if 3DS is available for the card - accepts raw request body from UI
app.post('/api/initiate-authentication', async (req, res) => {
  try {
    console.log('[STEP 1] Initiate Authentication - Request received');

    const {
      merchantId,
      username,
      password,
      apiBaseUrl,
      apiVersion,
      orderId,
      transactionId,
      method = 'PUT',
      url,
      requestBody  // Raw request body from UI
    } = req.body;

    // Validate credentials
    if (!merchantId || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required credentials',
        details: 'merchantId, username, and password are required'
      });
    }

    // Use provided URL or construct default
    const apiUrl = url || `${apiBaseUrl}/api/rest/version/${apiVersion}/merchant/${merchantId}/order/${orderId}/transaction/${transactionId}`;
    
    // Use provided request body or construct default
    let payload;
    if (requestBody) {
      // User provided custom request body - use it as-is
      payload = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
      console.log('[STEP 1] Using custom request body from UI');
    } else {
      // Fallback to default construction (shouldn't happen with new UI)
      console.log('[STEP 1] No request body provided, this should not happen');
      return res.status(400).json({
        success: false,
        error: 'Request body is required'
      });
    }

    console.log('[STEP 1] Method:', method);
    console.log('[STEP 1] API URL:', apiUrl);
    console.log('[STEP 1] Payload:', JSON.stringify(payload, null, 2));

    const authToken = createAuthToken(username, password);
    
    // Use the method from frontend (PUT, POST, etc.)
    const axiosMethod = method.toLowerCase();
    const response = await axios({
      method: axiosMethod,
      url: apiUrl,
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authToken}`,
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    console.log('[STEP 1] Response status:', response.status);
    console.log('[STEP 1] Response data:', JSON.stringify(response.data, null, 2));

    res.json({
      success: true,
      step: 1,
      data: response.data,
      authenticationStatus: response.data.authentication?.status,
      gatewayRecommendation: response.data.response?.gatewayRecommendation
    });

  } catch (error) {
    console.error('[STEP 1] Error:', error.message);
    if (error.response) {
      console.error('[STEP 1] API Error Response:', error.response.data);
      res.status(error.response.status).json({
        success: false,
        step: 1,
        error: 'MPGS API Error',
        details: error.response.data,
        status: error.response.status
      });
    } else if (error.request) {
      res.status(500).json({
        success: false,
        step: 1,
        error: 'Network Error',
        details: 'No response from MPGS API'
      });
    } else {
      res.status(500).json({
        success: false,
        step: 1,
        error: 'Request Error',
        details: error.message
      });
    }
  }
});

// STEP 3: Retrieve Order Details (NEW)
// GET request to retrieve order status
app.post('/api/retrieve-order', async (req, res) => {
  try {
    console.log('[STEP 3] Retrieve Order Details - Request received');

    const {
      merchantId,
      username,
      password,
      apiBaseUrl,
      apiVersion,
      orderId,
      method = 'GET',
      url
    } = req.body;

    // Validate credentials
    if (!merchantId || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required credentials'
      });
    }

    // Use provided URL or construct default
    const apiUrl = url || `${apiBaseUrl}/api/rest/version/${apiVersion}/merchant/${merchantId}/order/${orderId}`;
    
    console.log('[STEP 3] Method:', method);
    console.log('[STEP 3] API URL:', apiUrl);

    const authToken = createAuthToken(username, password);
    
    const response = await axios({
      method: 'GET', // Always GET for this endpoint
      url: apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authToken}`,
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    console.log('[STEP 3] Response status:', response.status);
    console.log('[STEP 3] Order status:', response.data.status);

    res.json({
      success: true,
      step: 3,
      data: response.data,
      orderStatus: response.data.status,
      totalAuthorizedAmount: response.data.totalAuthorizedAmount,
      totalCapturedAmount: response.data.totalCapturedAmount
    });

  } catch (error) {
    console.error('[STEP 3] Error:', error.message);
    if (error.response) {
      console.error('[STEP 3] API Error Response:', error.response.data);
      res.status(error.response.status).json({
        success: false,
        step: 3,
        error: 'MPGS API Error',
        details: error.response.data,
        status: error.response.status
      });
    } else if (error.request) {
      res.status(500).json({
        success: false,
        step: 3,
        error: 'Network Error',
        details: 'No response from MPGS API'
      });
    } else {
      res.status(500).json({
        success: false,
        step: 3,
        error: 'Request Error',
        details: error.message
      });
    }
  }
});

// STEP 2: Authenticate Payer
// Performs 3DS challenge or frictionless authentication - accepts raw request body
app.post('/api/authenticate-payer', async (req, res) => {
  try {
    console.log('[STEP 2] Authenticate Payer - Request received');

    const {
      merchantId,
      username,
      password,
      apiBaseUrl,
      apiVersion,
      orderId,
      transactionId,
      method = 'PUT',
      url,
      requestBody
    } = req.body;

    // Validate credentials
    if (!merchantId || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required credentials'
      });
    }

    // Use provided URL or construct default
    const apiUrl = url || `${apiBaseUrl}/api/rest/version/${apiVersion}/merchant/${merchantId}/order/${orderId}/transaction/${transactionId}`;
    
    // Use provided request body
    let payload;
    if (requestBody) {
      payload = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
      console.log('[STEP 2] Using custom request body from UI');
    } else {
      return res.status(400).json({
        success: false,
        error: 'Request body is required'
      });
    }

    console.log('[STEP 2] Method:', method);
    console.log('[STEP 2] API URL:', apiUrl);
    console.log('[STEP 2] Payload:', JSON.stringify(payload, null, 2));

    const authToken = createAuthToken(username, password);
    
    const axiosMethod = method.toLowerCase();
    const response = await axios({
      method: axiosMethod,
      url: apiUrl,
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authToken}`,
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    console.log('[STEP 2] Response status:', response.status);
    console.log('[STEP 2] Authentication status:', response.data.authentication?.status);

    // Extract HTML from various possible locations
    let redirectHtml = null;
    if (response.data.authentication?.redirect?.html) {
      redirectHtml = response.data.authentication.redirect.html;
      console.log('[STEP 2] Found HTML in authentication.redirect.html');
    } else if (response.data.authentication?.redirectHtml) {
      redirectHtml = response.data.authentication.redirectHtml;
      console.log('[STEP 2] Found HTML in authentication.redirectHtml');
    }

    res.json({
      success: true,
      step: 2,
      data: response.data,
      authenticationStatus: response.data.authentication?.status,
      redirectHtml: redirectHtml,
      gatewayRecommendation: response.data.response?.gatewayRecommendation
    });

  } catch (error) {
    console.error('[STEP 2] Error:', error.message);
    if (error.response) {
      console.error('[STEP 2] API Error Response:', error.response.data);
      res.status(error.response.status).json({
        success: false,
        step: 2,
        error: 'MPGS API Error',
        details: error.response.data,
        status: error.response.status
      });
    } else if (error.request) {
      res.status(500).json({
        success: false,
        step: 2,
        error: 'Network Error',
        details: 'No response from MPGS API'
      });
    } else {
      res.status(500).json({
        success: false,
        step: 2,
        error: 'Request Error',
        details: error.message
      });
    }
  }
});

// STEP 3: Authorize/Pay
// Complete payment with 3DS authentication result - accepts raw request body
app.post('/api/authorize-pay', async (req, res) => {
  try {
    console.log('[STEP 3] Authorize/Pay - Request received');

    const {
      merchantId,
      username,
      password,
      apiBaseUrl,
      apiVersion,
      orderId,
      transactionId,
      method = 'PUT',
      url,
      requestBody
    } = req.body;

    // Validate credentials
    if (!merchantId || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required credentials'
      });
    }

    // Use provided URL or construct default
    const apiUrl = url || `${apiBaseUrl}/api/rest/version/${apiVersion}/merchant/${merchantId}/order/${orderId}/transaction/${transactionId}`;
    
    // Use provided request body
    let payload;
    if (requestBody) {
      payload = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
      console.log('[STEP 3] Using custom request body from UI');
    } else {
      return res.status(400).json({
        success: false,
        error: 'Request body is required'
      });
    }

    console.log('[STEP 3] Method:', method);
    console.log('[STEP 3] API URL:', apiUrl);
    console.log('[STEP 3] Payload:', JSON.stringify(payload, null, 2));

    const authToken = createAuthToken(username, password);
    
    const axiosMethod = method.toLowerCase();
    const response = await axios({
      method: axiosMethod,
      url: apiUrl,
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authToken}`,
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    console.log('[STEP 3] Response status:', response.status);
    console.log('[STEP 3] Transaction result:', response.data.result);
    console.log('[STEP 3] Gateway code:', response.data.response?.gatewayCode);

    res.json({
      success: true,
      step: 3,
      data: response.data,
      result: response.data.result,
      gatewayCode: response.data.response?.gatewayCode,
      authenticationStatus: response.data.authentication?.status
    });

  } catch (error) {
    console.error('[STEP 3] Error:', error.message);
    if (error.response) {
      console.error('[STEP 3] API Error Response:', error.response.data);
      res.status(error.response.status).json({
        success: false,
        step: 3,
        error: 'MPGS API Error',
        details: error.response.data,
        status: error.response.status
      });
    } else if (error.request) {
      res.status(500).json({
        success: false,
        step: 3,
        error: 'Network Error',
        details: 'No response from MPGS API'
      });
    } else {
      res.status(500).json({
        success: false,
        step: 3,
        error: 'Request Error',
        details: error.message
      });
    }
  }
});

// Test configuration endpoint
app.post('/api/test-config', (req, res) => {
  const { error, value } = configSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: error.details[0].message
    });
  }

  const { merchantId, username, apiBaseUrl, apiVersion } = value;

  res.json({
    success: true,
    message: 'Configuration validated successfully',
    config: {
      merchantId: merchantId,
      username: username,
      password: '✓ Provided (hidden)',
      apiBaseUrl: apiBaseUrl,
      apiVersion: apiVersion
    },
    testUrl: `${apiBaseUrl}/api/rest/version/${apiVersion}/merchant/${merchantId}/order/TEST_ORDER/transaction/TEST_TXN`
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    port: port,
    cors: 'enabled',
    allowedOrigins: allowedOrigins,
    endpoints: {
      step1: '/api/initiate-authentication',
      step2: '/api/authenticate-payer',
      step3: '/api/retrieve-order',
      step4: '/api/authorize-pay',
      testConfig: '/api/test-config'
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    details: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    details: `Route ${req.method} ${req.path} not found`
  });
});

app.listen(port, () => {
  console.log(`🚀 3DS Payment API Server running at http://localhost:${port}`);
  console.log(`📋 Health check: http://localhost:${port}/health`);
  console.log('');
  console.log('🔐 Available Endpoints:');
  console.log('  POST /api/initiate-authentication (Step 1)');
  console.log('  POST /api/authenticate-payer (Step 2)');
  console.log('  POST /api/retrieve-order (Step 3)');
  console.log('  POST /api/authorize-pay (Step 4)');
  console.log('  POST /api/test-config');
  console.log('');
  console.log('🌐 CORS Configuration:');
  console.log('  Allowed Origins:', allowedOrigins.join(', '));
});

module.exports = app;
