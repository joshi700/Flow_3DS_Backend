# 3DS Payment Backend API

Backend server for the 3D Secure Payment Testing Tool. Provides proxy endpoints for MPGS 3DS authentication flow.

## Features

- ✅ **Step 1**: Initiate Authentication - Check 3DS availability
- ✅ **Step 2**: Authenticate Payer - Handle 3DS challenge/frictionless flow
- ✅ **Step 3**: Authorize/Pay - Complete payment with auth result
- 🔒 **Secure**: API credentials never exposed to frontend
- 📝 **Logging**: Comprehensive logging with sensitive data masking
- ✔️ **Validation**: Input validation using Joi

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **HTTP Client**: Axios
- **Validation**: Joi
- **Security**: CORS, Input sanitization

## Installation

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your configuration (optional)
# Backend can work without .env as credentials come from frontend
```

## Environment Variables

```env
PORT=3005
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

## Running Locally

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

Server will start at `http://localhost:3005`

## API Endpoints

### 1. Initiate Authentication (Step 1)

**POST** `/api/initiate-authentication`

Checks if 3DS is available for the card.

**Request Body:**
```json
{
  "merchantId": "TESTMIDTESTING00",
  "username": "merchant.TESTMIDTESTING00",
  "password": "your_password",
  "apiBaseUrl": "https://mtf.gateway.mastercard.com",
  "apiVersion": "73",
  "orderId": "ORD_123",
  "transactionId": "TXN_456",
  "currency": "USD",
  "amount": "99.00",
  "cardNumber": "5123450000000008",
  "expiryMonth": "12",
  "expiryYear": "25",
  "cvv": "123"
}
```

**Response:**
```json
{
  "success": true,
  "step": 1,
  "data": { /* MPGS response */ },
  "authenticationStatus": "AUTHENTICATION_AVAILABLE",
  "gatewayRecommendation": "PROCEED"
}
```

### 2. Authenticate Payer (Step 2)

**POST** `/api/authenticate-payer`

Performs 3DS challenge or frictionless authentication.

**Request Body:**
```json
{
  "merchantId": "TESTMIDTESTING00",
  "username": "merchant.TESTMIDTESTING00",
  "password": "your_password",
  "apiBaseUrl": "https://mtf.gateway.mastercard.com",
  "apiVersion": "73",
  "orderId": "ORD_123",
  "transactionId": "TXN_456"
}
```

**Response (Challenge Flow):**
```json
{
  "success": true,
  "step": 2,
  "data": { /* MPGS response */ },
  "authenticationStatus": "AUTHENTICATION_SUCCESSFUL",
  "redirectHtml": "<form>...</form>",
  "gatewayRecommendation": "PROCEED"
}
```

**Response (Frictionless Flow):**
```json
{
  "success": true,
  "step": 2,
  "data": { /* MPGS response */ },
  "authenticationStatus": "AUTHENTICATION_SUCCESSFUL",
  "redirectHtml": null,
  "gatewayRecommendation": "PROCEED"
}
```

### 3. Authorize/Pay (Step 3)

**POST** `/api/authorize-pay`

Completes payment with 3DS authentication result.

**Request Body:**
```json
{
  "merchantId": "TESTMIDTESTING00",
  "username": "merchant.TESTMIDTESTING00",
  "password": "your_password",
  "apiBaseUrl": "https://mtf.gateway.mastercard.com",
  "apiVersion": "73",
  "orderId": "ORD_123",
  "transactionId": "TXN_456"
}
```

**Response:**
```json
{
  "success": true,
  "step": 3,
  "data": { /* MPGS response */ },
  "result": "SUCCESS",
  "gatewayCode": "APPROVED",
  "authenticationStatus": "AUTHENTICATION_SUCCESSFUL"
}
```

### 4. Test Configuration

**POST** `/api/test-config`

Validates merchant configuration without making API calls.

**Request Body:**
```json
{
  "merchantId": "TESTMIDTESTING00",
  "username": "merchant.TESTMIDTESTING00",
  "password": "your_password",
  "apiBaseUrl": "https://mtf.gateway.mastercard.com",
  "apiVersion": "73"
}
```

### 5. Health Check

**GET** `/health`

Returns server status and configuration.

## Deployment to Vercel

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Deploy

```bash
# From the backend directory
vercel

# For production
vercel --prod
```

### Step 3: Configure Environment Variables (Optional)

In Vercel Dashboard:
1. Go to your project settings
2. Add environment variables:
   - `FRONTEND_URL` - Your frontend Vercel URL
   - `NODE_ENV` - production

### Step 4: Update Frontend

Update the `VITE_BACKEND_URL` in your frontend's `.env` file with your Vercel backend URL.

## Security Features

- ✅ CORS protection with allowlist
- ✅ Input validation on all endpoints
- ✅ Sensitive data masking in logs (passwords, CVV, card numbers)
- ✅ Request timeout protection
- ✅ Error handling without exposing sensitive details

## Logging

All logs mask sensitive information:
- Passwords → `****`
- CVV → `***`
- Card Numbers → `5123**********0008` (first 6 + last 4 digits)

## Error Handling

The API provides detailed error responses:

```json
{
  "success": false,
  "step": 1,
  "error": "MPGS API Error",
  "details": {
    "cause": "INVALID_REQUEST",
    "explanation": "Invalid merchant credentials"
  },
  "status": 401
}
```

## MPGS API Documentation

For more information about MPGS 3DS API:
- [MPGS Developer Portal](https://mpgs.fingent.wiki/)
- [3DS Integration Guide](https://mpgs.fingent.wiki/integration-guides/3ds)

## Troubleshooting

### CORS Errors

Make sure your frontend URL is in the `allowedOrigins` array in `index.js`:

```javascript
const allowedOrigins = [
  'http://localhost:5173',
  'https://your-frontend.vercel.app'
];
```

### Connection Timeout

Increase timeout if needed:

```javascript
timeout: 30000 // 30 seconds
```

### Invalid Credentials

Verify MPGS credentials:
- Merchant ID format: `TESTMIDTESTING00`
- Username format: `merchant.{merchantId}`
- Password: Minimum 8 characters

## Support

For issues or questions:
1. Check MPGS API documentation
2. Verify credentials and gateway URL
3. Check backend logs for detailed error messages
