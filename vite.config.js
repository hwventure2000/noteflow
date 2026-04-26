import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({ plugins: [react(), VitePWA({ registerType: 'autoUpdate', manifest: { name: 'NoteFlow', short_name: 'NoteFlow', description: 'Your personal note workspace', theme_color: '#7c6af7', background_color: '#0d0d12', display: 'standalone', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] } }) ] })
