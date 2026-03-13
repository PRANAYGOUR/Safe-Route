# SafeRoute – AI Travel Safety Companion

SafeRoute is a Progressive Web Application (PWA) designed as an AI-powered travel safety companion. It provides real-time GPS monitoring, smart halt detection, AI-based risk scoring, and emergency SOS functionalities to ensure a safer travel experience for women and vulnerable commuters.

## 🌟 Key Features

### 📍 Real-Time GPS Tracking
Continuously monitors your active journey with high accuracy. Utilizes Leaflet maps and OpenRouteService (ORS) to track your current location, speed, and standard deviations from the planned route.

### 🛑 Smart Halt Detection
Automatically detects if you've stopped for an unusual amount of time during a journey. 
- **Safety Prompt:** If a halt is detected, the app prompts you on-screen to confirm your safety.
- **Auto-SOS:** If you fail to confirm your safety within a configured countdown, an SOS alert is automatically triggered without requiring any physical interaction.

### 🧠 AI Risk Scoring
Analyzes your current travel metrics (time of day, location, deviations, speed) using Groq AI. 
- Provides dynamic, real-time risk scores.
- Contextualizes environmental factors and automatically adjusts your journey's active safety parameters.

### 🚨 Emergency SOS System
Immediate, multi-faceted emergency response system:
- **Instant Trigger:** Access SOS mode instantly from the navigation bar.
- **Audio Recording:** Automatically starts an ambient audio recording that gets securely uploaded to a Supabase bucket (`sos_audio`) for evidence.
- **Alert Dispatch:** Silently logs your distress location and notifies connected infrastructure or trusted contacts via Supabase.

### 🛡️ Safe Zones
Define and manage personal safe zones for regular commutes (like Home, Office, or University). The system lowers the baseline risk threshold when you are within these zones.

### 📱 Progressive Web App (PWA) Support
Fully installable as an app on iOS and Android devices directly from the browser for seamless, native-like access.

## 🛠️ Technology Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES Modules)
- **Bundler:** Vite
- **Mapping & Routing:** Leaflet.js, OpenRouteService (ORS) API
- **Backend & Database:** Supabase (PostgreSQL, Authentication, Storage Buckets, Row Level Security)
- **AI Integration:** Groq API (acting as the risk assessment engine)

## 🔄 Application Workflow

1. **User Setup**
   - Users authenticate using Supabase Auth.
   - They configure their emergency contacts, which are saved to the `trusted_contacts` table.

2. **Starting a Journey**
   - The user inputs a destination and selects their mode of transportation (walking, bus, etc.).
   - The app fetches the optimal route from the OpenRouteService API and renders it via Leaflet maps.
   - A new record is created in the `journeys` table.

3. **Active Monitoring & Background Pings**
   - The GPS service continuously polls the user's location.
   - Coordinates are routed through the Halt Detector to verify the user isn't lingering unsafely.
   - Pings are simultaneously sent to the Groq AI service to calculate a dynamic, real-time risk score based on environment, time, and behavioral anomalies.
   - Every location update is stored in the `journey_locations` table as a time-series log.

4. **Safety Prompts (Smart Halt)**
   - If the user stops for an unusual amount of time, an on-screen prompt appears.
   - A 60-second countdown begins. The user must actively press the "I'm Safe" button to dismiss the prompt and reset the detector.

5. **SOS Escalation**
   - If the halt countdown expires entirely—or if the user manually triggers the SOS button from the navigation bar—the app enters Emergency Mode.
   - The app transitions the current journey `status` to `emergency`.
   - The device's microphone is accessed to silently record ambient audio.
   - An alert is logged immediately to the `sos_alerts` table.
   - The audio recording is securely uploaded to the `sos_audio` Supabase Storage bucket.

## 🗄️ Database Schema & SQL Tables

SafeRoute relies on a robust schema deployed on PostgreSQL via Supabase. Below are the core tables and their structures:

### 1. `trusted_contacts`
Stores the emergency contacts configured by the user.
- **Fields:** `id` (UUID, PK), `user_id` (UUID, FK to auth.users), `name`, `email`, `phone`, `created_at`

### 2. `journeys`
Manages all active and historical trips explicitly started by the user.
- **Fields:** `id` (UUID, PK), `user_id`, `mode` (TEXT e.g., walking, bus, train), `start_lat`, `start_lng`, `dest_lat`, `dest_lng`, `dest_name`, `status` (active, completed, cancelled, emergency), `risk_score_max`, `created_at`

### 3. `journey_locations`
A time-series table logging consecutive GPS pings for any active journey. Used to trace path history and audit anomalies.
- **Fields:** `id` (UUID, PK), `journey_id` (UUID, FK to journeys), `user_id`, `latitude`, `longitude`, `speed`, `accuracy`, `risk_score`, `timestamp`

### 4. `risk_events`
When the AI Risk Engine pinpoints an anomaly (e.g., sudden deviation, unusually high risk area), it creates an explicit event log here.
- **Fields:** `id` (UUID, PK), `journey_id`, `user_id`, `risk_score`, `reason`, `factors` (JSONB), `latitude`, `longitude`, `created_at`

### 5. `sos_alerts`
The definitive log of any SOS action, tracking precisely where it happened and what triggered it.
- **Fields:** `id` (UUID, PK), `user_id`, `journey_id`, `latitude`, `longitude`, `trigger_reason` (manual, halt, voice), `message`, `status`, `created_at`

### 🔒 Row Level Security (RLS)
Security is paramount. `schema.sql` enforces Supabase Row Level Security (RLS) on **all** tables listed above. Built-in policies dictate that users can only select, insert, update, or delete rows where `auth.uid() = user_id`.

### 🪣 Storage Buckets
- **Bucket:** `sos_audio`
- Securely accepts uploads of audio captured during an SOS event. Policies restrict insertions to authenticated users only.

## 🚀 Prerequisites

Before running the project locally, ensure you have the following installed:
- Node.js (v16 or higher)
- npm (or yarn/pnpm)
- API Keys for:
  - Supabase (URL & Anon Key)
  - OpenRouteService
  - Groq

## 💻 Getting Started

1. **Clone the repository:**
   ```bash
   git clone <your-repository-url>
   cd women-safety
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory. You can use the provided `.env.example` as a template and fill in your API keys:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_ORS_API_KEY=your_openrouteservice_key
   VITE_GROQ_API_KEY=your_groq_api_key
   ```

4. **Database Setup:**
   - Go to your Supabase project dashboard.
   - Navigate to the SQL Editor.
   - Copy the contents of `schema.sql` and execute it to create the necessary tables, relationships, and Row Level Security (RLS) policies.
   - The script also creates a public Storage Bucket (`sos_audio`) for emergency recordings.

5. **Start the development server:**
   ```bash
   npm run dev
   ```
   The application will be accessible at `http://localhost:5173`.

## 📂 Project Structure

- `index.html`: Main application entry point and UI shell.
- `src/app.js`: Core application logic, routing, and initialization.
- `src/screens/`: Individual screen modules (`home.js`, `journey.js`, `sos.js`, `settings.js`, etc.).
- `src/services/`: Core background services (`gps.js`, `halt-detector.js`, `groq.js`, `supabase.js`).
- `src/styles/`: CSS stylesheets for components and layout.
- `sw.js`: Service Worker for offline capabilities and PWA functionality.
- `vite.config.js`: Configuration for the Vite development server and builder.
- `schema.sql`: Database definitions for the Supabase backend.

## 📜 Available Scripts

- `npm run dev`: Start the local development server on `0.0.0.0`.
- `npm run build`: Build the application for production.
- `npm run preview`: Preview the production build locally.

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change. 

## ⚖️ License

This project is licensed under the MIT License.
