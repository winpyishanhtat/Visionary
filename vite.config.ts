import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Expose specific keys for different models
      'process.env.GEMINI_FLASH_API_KEY': JSON.stringify(env.GEMINI_FLASH_API_KEY),
      'process.env.GEMINI_TTS_API_KEY': JSON.stringify(env.GEMINI_TTS_API_KEY)
    }
  }
})