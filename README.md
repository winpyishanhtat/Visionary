# 🔮 Visionary

<div align="center">
  <h3>Contextual Analysis & Narrator</h3>
  <p>
    Turn static pixels into spoken narratives using the power of Multimodal AI.
  </p>

  <p>
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind" />
    <img src="https://img.shields.io/badge/Gemini_API-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Gemini" />
  </p>
</div>

---

## ⚡ Overview

**Visionary** is a next-generation document and image assistant wrapped in a sleek, glassmorphic UI. It doesn't just read text; it *sees* the context.

By chaining Google's **Gemini 3 Flash** (for vision/reasoning) and **Gemini 2.5** (for neural text-to-speech), Visionary creates an immersive loop:
**Capture → Analyze → Translate → Narrate → Visualize.**

## 💎 Features

*   **👁️ Omni-Vision Input:** Snap a photo using your device's camera or upload any image document.
*   **🧠 Contextual OCR:** Extracts text *and* generates a visual description of the scene using `gemini-3-flash-preview`.
*   **🌍 Instant Polyglot:** Automatically detects languages and translates the full narrative into your preferred language (or Spanish fallback).
*   **🗣️ Neural Voice (Kore):** Converts text to lifelike audio using the high-fidelity `gemini-2.5-flash-preview-tts` model.
*   **🌊 Audio Visualization:** Real-time frequency analysis rendered on a canvas for a futuristic playback experience.
*   **🎨 Glassmorphism UI:** Built with Tailwind CSS, featuring backdrop blurs, gradients, and Phosphor icons.

## 🛠️ Tech Stack

*   **Frontend:** React 18 + TypeScript + Vite
*   **Styling:** Tailwind CSS (Custom "Glass" theme)
*   **AI SDK:** `@google/genai` (Official SDK)
*   **Icons:** Phosphor React
*   **Font:** Plus Jakarta Sans & JetBrains Mono

## 🚀 Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/yourusername/visionary.git
cd visionary
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure Environment
Create a `.env` file in the root directory. You will need API keys from Google AI Studio.

> **Note:** This app uses two separate keys in the config to allow for different billing projects or quotas if desired, but you can use the same key for both.

```env
# Key for Vision and Translation (Gemini 3 Flash)
GEMINI_FLASH_API_KEY=your_api_key_here

# Key for Text-to-Speech (Gemini 2.5)
GEMINI_TTS_API_KEY=your_api_key_here
```

### 4. Run the development server
```bash
npm run dev
```

## 🎨 UI & Aesthetics

The interface is designed to feel "alive."
*   **Primary:** `#8b5cf6` (Violet)
*   **Accent:** `#06b6d4` (Cyan)
*   **Background:** Deep slate `#020617` with radial gradient glows.
*   **Components:** Translucent glass panels with `backdrop-filter: blur(16px)`.

---

<div align="center">
  <p>Built with 💜 and Gemini</p>
</div>
