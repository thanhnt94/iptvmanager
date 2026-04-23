# IPTV Project Rules & Principles

This document contains the core development rules for the IPTV system. Every AI coding assistant MUST follow these rules without exception.

## 1. Architectural Integrity
- **Pattern**: Modular Monolith (Hexagonal Style).
- **Organization**: Follow the structures defined in `newmindstack/docs/MODULE_STRUCTURE.md` and `newmindstack/docs/MODULE_REFACTOR_CHECKLIST.md`.
- **Backend**: Flask based. Each module should be self-contained with its own models, routes, and services.

## 2. Frontend Development & Deployment
- **Stack**: React (Vite) + Tailwind CSS + Framer Motion.
- **Aesthetics**: High-end, premium "IPTV Studio" look. Use Glassmorphism, deep gradients, and smooth micro-animations.
- **Responsive Design**: UI MUST be fully responsive, supporting both **Mobile** and **Desktop** layouts seamlessly. Ensure interactive elements are touch-friendly.
- **DEPLOYMENT RULE**: Always run `npm run build` in the `iptv-studio` directory after making changes to ANY frontend/template file to ensure the production bundle is updated.

## 3. Database Management
- **Persistence**: Use Flask-SQLAlchemy and Flask-Migrate.
- **AUTO-MIGRATE**: Whenever models are modified or database structures change, the AI assistant MUST automatically generate and run a database migration (e.g., `flask db migrate` and `flask db upgrade`).

## 3. Scraper / Scanner Optimization (Ultra Scan)
- **Constraint**: Must run on low-RAM VPS environments.
- **Implementation**: Playwright-based scanners must block images, CSS, and media requests to save memory.
- **Memory Management**: Use `--js-flags="--max-old-space-size=256"` for Chromium.
- **Performance**: Use network sniffing to close the browser as soon as the stream link is found.

## 4. Playlist & Registry Management
- **Namespaces**: Support custom Registry Profiles (Playlists) via `PlaylistProfile`.
- **Customization**: Users must be able to:
    - Reorder channels within a playlist (Order Index).
    - Override channel groups locally within a playlist.
    - Rename/Delete groups globally across all channels.
- **Persistence**: Managed through `PlaylistEntry` and `PlaylistGroup` models.

## 5. UI/UX Standards
- Never use generic placeholders.
- Always provide search/filter functionality for large channel lists.
- Interactive elements (buttons, menus) must clearly indicate state (active/inactive) and have smooth transitions.
