# Project Setup Guide

This document provides step-by-step instructions to set up the Flow Builder project locally.

## Prerequisites

Before you begin, ensure you have the following installed on your machine:

- **Node.js**: v18 or higher
- **npm**: v8 or higher
- **Docker**: (Recommended) For running Redis and MongoDB easily

---

## 1. External Infrastructure Setup

The project requires **MongoDB** (for data persistence) and **Redis** (for session locking and background jobs via BullMQ).

### Using Docker (Simplest)

The backend includes a `docker-compose.yml` file that can spin up Redis.

```bash
cd backend
docker-compose up -d redis
```

*Note: MongoDB is currently expected to be running locally or via a connection string.*

### Local Installation (Manual)

#### Redis
- **macOS**: `brew install redis` then `brew services start redis`
- **Linux**: `sudo apt install redis-server`
- **Windows**: Use WSL2 or Docker.

#### MongoDB
- **macOS**: `brew tap mongodb/brew` then `brew install mongodb-community` and `brew services start mongodb-community`
- **Connection**: By default, it looks for `mongodb://localhost:27017/flowbuilder`.

---

## 2. Backend Setup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and fill in the required values:
   - `MONGODB_URI`: Your MongoDB connection string.
   - `REDIS_URL`: Your Redis URL (e.g., `redis://localhost:6379`).
   - `WHATSAPP_API_TOKEN`: Your Meta Cloud API token.
   - `JWT_SECRET`: A secure random string (min 32 chars).

4. **Seed Initial Data**:
   To populate the database with initial node types and example flows:
   ```bash
   npm run seed
   ```

5. **Start the development server**:
   ```bash
   npm run dev
   ```
   The backend will be available at `http://localhost:3000`.

---

## 3. Frontend Setup

1. **Navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   The frontend will be available at `http://localhost:5173`.

### Environment Variables (Optional)

If you need to change the backend API URL, create a `.env` file in the `frontend` directory:

```bash
VITE_API_URL=http://localhost:3000/api
```

---

## 4. Environment Variables Reference

| Variable | Description | Default / Example |
|----------|-------------|-------------------|
| `PORT` | Backend server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/flowbuilder` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `WHATSAPP_API_URL` | Meta Graph API URL | `https://graph.facebook.com/v18.0` |
| `WHATSAPP_API_TOKEN` | WhatsApp Access Token | `your_whatsapp_access_token` |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Phone ID | `your_phone_number_id` |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification token | `your_verify_token` |
| `JWT_SECRET` | Secret for auth tokens | `min_32_characters_secret` |
| `MAX_FLOW_STEPS` | Maximum steps per flow execution | `100` |
| `SESSION_TIMEOUT_SECS` | Session expiration time | `300` |

---

## Troubleshooting

- **Redis Connection Error**: Ensure Redis is running and the `REDIS_URL` in `.env` matches your setup.
- **MongoDB Connection Error**: Check if MongoDB is started and accessible via the provided URI.
- **WhatsApp Webhook**: To test webhooks locally, use a tool like **ngrok** to expose your local port 3000 to the internet.
