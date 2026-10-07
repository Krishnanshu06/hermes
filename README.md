# Hermes - AI Email Organizer

Hermes connects to your Gmail via Google OAuth, pulls your recent inbox communications, and uses **Google Gemini AI** to automatically categorize messages, extract deadlines/action items, and draft responses.

## Architecture

- **Backend:** FastAPI (Python 3.12)
  - Google OAuth 2.0 flow
  - Gmail API integration (messages, labels, batches)
  - Google Gemini integration (classification, task extraction, summaries)
  - Ready for deployment on **Render** (via `render.yaml`)
- **Frontend:** React + Vite
  - Functional barebones dashboard for OAuth login, inbox loading, and testing Gemini organizer capabilities
  - Ready for deployment on **Vercel**

---

## Local Setup

### 1. Prerequisites
- Python 3.10+
- Node.js 18+
- Google Cloud Project with Gmail API enabled
- Gemini API Key from Google AI Studio

### 2. Backend Setup
```bash
# Navigate to backend
cd backend

# Create virtual environment (optional but recommended)
python -m venv venv
venv\Scripts\activate  # On Windows

# Install dependencies
pip install -r requirements.txt

# Ensure root .env has your GEMINI_API_KEY and GOOGLE credentials
# Start backend server
uvicorn app.main:app --reload --port 8000
```
Backend API will be live at `http://localhost:8000` (Swagger docs at `http://localhost:8000/docs`).

### 3. Frontend Setup
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```
Frontend will be accessible at `http://localhost:3000` (or `http://localhost:5173`).

---

## Deployment Instructions

### Deploy Backend to Render:
1. Connect your GitHub repository `Krishnanshu06/Hermes` to Render.
2. Render detects `render.yaml` automatically as a Blueprint.
3. Configure the environment variables in Render dashboard:
   - `GEMINI_API_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (pointing to your Render URL: `https://<render-service-name>.onrender.com/api/auth/callback`)
   - `FRONTEND_URL` (pointing to your Vercel frontend URL)

### Deploy Frontend to Vercel:
1. Import `Krishnanshu06/Hermes` on Vercel.
2. Set root directory to `frontend`.
3. Framework Preset: **Vite**.
4. Deploy!
