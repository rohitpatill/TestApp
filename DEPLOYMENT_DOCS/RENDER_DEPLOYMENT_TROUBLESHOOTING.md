# Render Deployment Troubleshooting Guide

Complete reference for debugging and fixing deployment issues with a Full-Stack Todo App on Render.

---

## Table of Contents

1. [Problem Summary](#problem-summary)
2. [Root Causes](#root-causes)
3. [Solutions Applied](#solutions-applied)
4. [Render API Reference](#render-api-reference)
5. [Code Fixes](#code-fixes)
6. [Testing & Verification](#testing--verification)
7. [Future Reference Checklist](#future-reference-checklist)

---

## Problem Summary

### Error Message
```
Invalid Host header
```

### Where It Appeared
- Frontend URL: `https://testapp-1-e0pc.onrender.com`
- Error occurred when frontend tried to fetch data from backend
- Page loaded but data wouldn't display

### Impact
- Frontend couldn't reach backend API
- Todo app completely non-functional
- Users couldn't add, view, or delete todos

---

## Root Causes

### Root Cause #1: Frontend Environment Variable Not Set
**Problem:**
- Backend URL was hardcoded as fallback: `http://localhost:5000`
- When deployed, frontend couldn't reach the backend (different domains)
- Frontend tried to call localhost from production environment

**Why This Happened:**
```javascript
// frontend/src/App.js (BEFORE FIX)
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
```
- Environment variable `REACT_APP_API_URL` was never set on Render
- Fallback value was used instead
- Frontend made requests to wrong URL

**Verification:**
```bash
# Check what env vars are set on Render
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services/{serviceId}/env-vars

# Result BEFORE fix: [] (empty - no env vars!)
# Result AFTER fix: [{"envVar":{"key":"REACT_APP_API_URL","value":"https://testapp-fiec.onrender.com"}}]
```

---

### Root Cause #2: Backend Not Trusting Proxy Headers
**Problem:**
- Express backend wasn't configured to trust Render's reverse proxy
- Express was rejecting requests with invalid Host headers
- Request headers from proxy didn't match what Express expected

**Why This Happened:**
```javascript
// backend/server.js (BEFORE FIX)
app.use(cors());  // Generic CORS, doesn't handle proxy headers
```
- Missing: `app.set('trust proxy', 1)`
- Render uses reverse proxies, sends X-Forwarded-* headers
- Express must be told to trust these headers

**Technical Background:**
When Render proxies a request:
```
Client Browser → Render Proxy → Your Express App
                                ↑
                    Host header is proxy's header
                    Real domain in X-Forwarded-Host
```
Express needs to trust the proxy to read the real domain.

---

### Root Cause #3: Frontend Using Development Server in Production
**Problem:**
- Frontend was running `react-scripts start` (development server)
- Had `"proxy": "http://localhost:5000"` configuration
- Development proxy doesn't work in production
- React dev server caused "Invalid Host header" errors

**Why This Happened:**
```json
// frontend/package.json (BEFORE FIX)
"scripts": {
  "start": "react-scripts start",  // ❌ Development server
  ...
},
"proxy": "http://localhost:5000"   // ❌ Dev-only proxy
```

**The Issue:**
- React dev server expects `localhost:3000`
- Proxy tries to forward to localhost backend
- On Render, neither localhost works
- Causes "Invalid Host header" because dev server rejects non-localhost connections

---

## Solutions Applied

### Solution #1: Set Frontend Environment Variable via Render API

**What We Did:**
Added the backend URL as an environment variable on the frontend Render service.

**Implementation:**

#### Step 1: Authenticate & Get Service ID
```bash
# Store these in your local .env file:
RENDER_API_KEY=rnd_xxxxxxxxxxxxxxxxxxxxx
```

#### Step 2: List Services to Find Service IDs
```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services | \
  grep -E '"name"|"id"|"url"'

# Output shows:
# Frontend: srv-d5ub6u94tr6s739f12k0 (testapp-1-e0pc.onrender.com)
# Backend: srv-d5ub2vsr85hc73a2sms0 (testapp-fiec.onrender.com)
```

#### Step 3: Check Current Environment Variables
```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services/{FRONTEND_SERVICE_ID}/env-vars

# Returns: [] (empty if not set)
```

#### Step 4: Set Environment Variable (Using PUT Method)
**Important:** Render API uses `PUT`, not `POST` for env vars!

```bash
curl -X PUT \
  https://api.render.com/v1/services/{FRONTEND_SERVICE_ID}/env-vars \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{
    "key": "REACT_APP_API_URL",
    "value": "https://testapp-fiec.onrender.com"
  }]'

# Note the array format: [{ key, value }]
```

#### Step 5: Verify Environment Variable Was Set
```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services/{FRONTEND_SERVICE_ID}/env-vars

# Output shows: [{"envVar":{"key":"REACT_APP_API_URL","value":"https://testapp-fiec.onrender.com"}}]
```

**Code Change (frontend/src/App.js):**
```javascript
// BEFORE
const response = await axios.get('/api/todos');

// AFTER
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const response = await axios.get(`${API_BASE_URL}/api/todos`);
```

---

### Solution #2: Trust Proxy in Backend

**What We Did:**
Configured Express to trust Render's reverse proxy and handle CORS properly.

**Code Change (backend/server.js):**
```javascript
// BEFORE
const app = express();
app.use(cors());
app.use(express.json());

// AFTER
const app = express();

// Trust Render's proxy
app.set('trust proxy', 1);

// Explicit CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'https://testapp-1-e0pc.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Todo API is running' });
});
```

**What Each Line Does:**
```javascript
app.set('trust proxy', 1);
// Tells Express: "I'm behind a proxy, trust X-Forwarded-* headers"
// This fixes the "Invalid Host header" error

const corsOptions = {
  origin: [...],      // Only allow these domains
  credentials: true,  // Allow cookies/auth headers
  methods: [...],     // Explicit allowed HTTP methods
  allowedHeaders: [...] // Explicit allowed headers
};
// Provides explicit CORS configuration instead of allowing everything
```

---

### Solution #3: Use Production Server for Frontend

**What We Did:**
Replace React development server with a proper Express server that serves static files.

**Step 1: Create Production Server (frontend/server.js)**
```javascript
const express = require('express');
const path = require('path');
const app = express();

// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'build')));

// Handle all routes by serving index.html (for client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Frontend server running on port ${PORT}`);
});
```

**How This Works:**
1. `npm run build` creates static files in `/build` directory
2. Express serves these static files (HTML, JS, CSS)
3. All unknown routes redirect to `index.html` (React client-side routing)
4. No proxying issues because it's just static files + React SPA

**Step 2: Update frontend/package.json**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.3.0",
    "react-scripts": "5.0.1",
    "express": "^4.18.2"  // ✅ Added
  },
  "scripts": {
    "dev": "react-scripts start",           // ✅ For local development
    "build": "react-scripts build",         // ✅ Build static files
    "start": "node server.js",              // ✅ For production on Render
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  }
  // ✅ Removed: "proxy": "http://localhost:5000"
}
```

**Render Build & Start Commands:**
- **Build:** `npm install && npm run build`
- **Start:** `npm start` (now runs server.js, not react-scripts)

---

## Render API Reference

### Authentication
```bash
# All Render API requests require Bearer token
-H "Authorization: Bearer $RENDER_API_KEY"

# Get key from: Render Dashboard → Account Settings → API Keys
```

### Key Endpoints Used

#### 1. List Services
```bash
GET https://api.render.com/v1/services

curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services
```
Returns: Array of all your services with IDs, names, URLs, git repos

#### 2. Get Service Environment Variables
```bash
GET https://api.render.com/v1/services/{serviceId}/env-vars

curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services/{serviceId}/env-vars
```
Returns: Array of env var objects with keys and values

#### 3. Set Service Environment Variables
```bash
PUT https://api.render.com/v1/services/{serviceId}/env-vars

# ⚠️ IMPORTANT: Use PUT, not POST!
# ⚠️ IMPORTANT: Use array format: [{ "key": "...", "value": "..." }]

curl -X PUT \
  https://api.render.com/v1/services/{serviceId}/env-vars \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"key":"KEY_NAME","value":"KEY_VALUE"}]'
```

#### 4. Trigger Deployment
```bash
POST https://api.render.com/v1/services/{serviceId}/deploys

curl -X POST \
  https://api.render.com/v1/services/{serviceId}/deploys \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json"
```
Returns: Deployment object with status (queued, build_in_progress, live, failed)

#### 5. List Deployments
```bash
GET https://api.render.com/v1/services/{serviceId}/deploys

curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services/{serviceId}/deploys

# Or get latest deployment only:
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services/{serviceId}/deploys?limit=1
```

### How to Find Service IDs

**Method 1: From Render Dashboard**
- Go to dashboard.render.com
- Click on service
- URL shows: `https://dashboard.render.com/web/srv-xxxxx`
- `srv-xxxxx` is the service ID

**Method 2: Via API**
```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services | \
  grep -B2 "testapp"  # Search for your service
```

---

## Code Fixes

### Summary of All Code Changes

| File | Change | Reason |
|------|--------|--------|
| `frontend/src/App.js` | Use `process.env.REACT_APP_API_URL` for API URL | Pass backend URL from environment |
| `frontend/server.js` | Created new file | Serve static React build in production |
| `frontend/.env.example` | Created new file | Document required env vars |
| `frontend/package.json` | Add express dep, change start script | Use production server |
| `backend/server.js` | Add `trust proxy`, explicit CORS | Handle Render proxy correctly |
| `backend/.env.example` | Already existed | Document required env vars |

### Detailed Code Changes

#### frontend/src/App.js
```javascript
// OLD: Hardcoded localhost
const response = await axios.get('/api/todos');

// NEW: Use environment variable
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const response = await axios.get(`${API_BASE_URL}/api/todos`);
```

**Apply to all API calls:**
- `GET /api/todos` → `GET ${API_BASE_URL}/api/todos`
- `POST /api/todos` → `POST ${API_BASE_URL}/api/todos`
- `PUT /api/todos/:id` → `PUT ${API_BASE_URL}/api/todos/:id`
- `DELETE /api/todos/:id` → `DELETE ${API_BASE_URL}/api/todos/:id`

#### backend/server.js
```javascript
// OLD
const app = express();
app.use(cors());

// NEW
const app = express();
app.set('trust proxy', 1);  // ✅ CRITICAL for Render

const corsOptions = {
  origin: ['http://localhost:3000', 'https://your-frontend-url.onrender.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
};
app.use(cors(corsOptions));
```

#### frontend/server.js (NEW FILE)
```javascript
const express = require('express');
const path = require('path');
const app = express();

// Serve static files (HTML, JS, CSS)
app.use(express.static(path.join(__dirname, 'build')));

// SPA fallback: send index.html for all unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Frontend running on port ${PORT}`);
});
```

---

## Testing & Verification

### Step 1: Verify Frontend Loads
```bash
curl -s https://testapp-1-e0pc.onrender.com | head -20
# Should see HTML with React app (not error)
```

### Step 2: Verify Backend Accessible
```bash
curl -s https://testapp-fiec.onrender.com/
# Should return: {"message":"Todo API is running"}
```

### Step 3: Verify Environment Variable
```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services/{FRONTEND_SERVICE_ID}/env-vars | \
  grep REACT_APP_API_URL
# Should show: "key":"REACT_APP_API_URL","value":"https://testapp-fiec.onrender.com"
```

### Step 4: Test Frontend API Call
1. Visit: `https://testapp-1-e0pc.onrender.com`
2. Open browser DevTools (F12)
3. Go to Network tab
4. Try adding a todo
5. Check network request:
   - URL should be: `https://testapp-fiec.onrender.com/api/todos` ✅
   - Status should be: 200 or 201 ✅
   - No "Invalid Host header" error ✅

---

## Future Reference Checklist

### For Similar Deployment Issues, Follow This Checklist:

#### 1. Diagnose the Problem
- [ ] Check browser console for errors
- [ ] Check Render deployment logs
- [ ] Use curl to test backend API directly
- [ ] Verify frontend can reach backend URL
- [ ] Check environment variables are set on Render

#### 2. Check Environment Variables
```bash
# Get your service IDs
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services | grep -E '"name"|"id"'

# Check frontend env vars
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services/{FRONTEND_ID}/env-vars

# Check backend env vars
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services/{BACKEND_ID}/env-vars
```

#### 3. If Environment Variables Missing
```bash
# For Frontend: Add REACT_APP_API_URL
curl -X PUT \
  https://api.render.com/v1/services/{FRONTEND_ID}/env-vars \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"key":"REACT_APP_API_URL","value":"https://your-backend.onrender.com"}]'

# For Backend: Add MONGODB_URI, PORT, NODE_ENV
curl -X PUT \
  https://api.render.com/v1/services/{BACKEND_ID}/env-vars \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    {"key":"MONGODB_URI","value":"mongodb+srv://..."},
    {"key":"PORT","value":"5000"},
    {"key":"NODE_ENV","value":"production"}
  ]'
```

#### 4. Check Backend Configuration
Backend server.js should have:
```javascript
✅ app.set('trust proxy', 1);
✅ Explicit CORS configuration
✅ Health check endpoint (GET /)
✅ Error handling middleware
```

#### 5. Check Frontend Configuration
Frontend should have:
```javascript
✅ Use environment variable for API URL
✅ Production server.js for serving static files
✅ No 'proxy' in package.json
✅ 'start' script runs server.js, not react-scripts
```

#### 6. Trigger Redeploy
```bash
# Frontend
curl -X POST \
  https://api.render.com/v1/services/{FRONTEND_ID}/deploys \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json"

# Backend
curl -X POST \
  https://api.render.com/v1/services/{BACKEND_ID}/deploys \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json"

# Wait 3-5 minutes for build to complete
```

#### 7. Verify Fix Works
```bash
# Test frontend loads
curl -s https://your-frontend.onrender.com | head -5

# Test backend responds
curl -s https://your-backend.onrender.com/

# Test API call from frontend (manual test in browser)
# Try adding a todo - should succeed
```

---

## Quick Reference: Common Errors & Fixes

### Error: "Invalid Host header"
**Cause:** One of three things:
1. Frontend env var not set
2. Backend not trusting proxy
3. Frontend using dev server

**Fix:** Follow all 3 solutions above

### Error: "CORS error"
**Cause:** Backend CORS not configured for frontend domain

**Fix:** Update backend CORS to include frontend URL
```javascript
origin: ['https://your-frontend.onrender.com']
```

### Error: "Cannot find module express" (on frontend)
**Cause:** express not in frontend dependencies

**Fix:** Add to frontend/package.json
```json
"dependencies": {
  "express": "^4.18.2"
}
```

### Error: "Frontend build failed"
**Cause:** Usually missing dependencies or broken imports

**Fix:**
1. Check Render build logs
2. Run `npm install && npm run build` locally
3. Fix any errors
4. Push to GitHub
5. Redeploy

---

## Summary: The Complete Flow

```
1. Frontend (React) deployed on Render
   ├─ Builds: npm run build → static files in /build
   ├─ Runs: node server.js (Express static server)
   ├─ Env Var: REACT_APP_API_URL=https://backend.onrender.com
   └─ Makes requests to: https://backend.onrender.com/api/todos

2. Backend (Express) deployed on Render
   ├─ Env Vars: MONGODB_URI, PORT, NODE_ENV
   ├─ Server config: app.set('trust proxy', 1)
   ├─ CORS: Allows https://frontend.onrender.com
   └─ Handles: GET/POST/PUT/DELETE /api/todos

3. Communication
   User Browser → Frontend (static HTML/JS/CSS)
               → User clicks button
               → React makes API call
               → Axios sends request to backend URL (from env var)
               → Backend receives request through Render proxy
               ├─ Trusts proxy headers
               ├─ CORS allows request
               └─ Processes request successfully
               → Backend sends response
               → React updates UI
               → User sees updated todos
```

---

## Additional Resources

- Render Documentation: https://render.com/docs
- Render API Reference: https://api-docs.render.com
- Express Proxy Setup: https://expressjs.com/en/guide/behind-proxies.html
- React Environment Variables: https://create-react-app.dev/docs/adding-custom-environment-variables/
- CORS Issues: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS

---

**Last Updated:** 2026-01-30
**Status:** ✅ All issues resolved and documented
