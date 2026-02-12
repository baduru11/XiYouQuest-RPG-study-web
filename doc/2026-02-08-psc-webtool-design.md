# PSC Web Tool — Design Document

**Date**: 2026-02-08 (last updated: 2026-02-10)
**Project**: GenAI Hackathon — Putonghua Proficiency Test Web Tool (HKUST)
**Status**: All core features implemented

---

## 1. Overview

An AI-powered web tool to help HKUST students prepare for the Putonghua Proficiency Test (PSC). Covers all 5 exam components with speech recognition, AI feedback, and a galgame-style character companion system that gamifies the learning experience.

**Key differentiator:** Anime-style 2D characters with unique personalities and AI-generated voices that act as study companions. Users earn XP, unlock new characters, build affection levels, and earn character skins — turning PSC practice into an engaging, rewarding experience without sacrificing learning quality.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript (strict) + Tailwind CSS 4 + shadcn/ui |
| Database & Auth | Supabase (Postgres + RLS + built-in auth with email + Google OAuth) |
| LLM | Google Gemini 2.0 Flash (feedback + question generation) |
| Speech Recognition | iFlytek ISE WebSocket API (Mandarin pronunciation assessment — read_syllable, read_word, read_chapter) |
| Character Voices | iFlytek TTS WebSocket API (academic + companion voices, PCM 16kHz zh-CN) |
| UI Theme | Pixel-art retro (Press Start 2P, VT323, Noto Sans SC fonts) |
| Deployment | Vercel |

---

See `docs/plans/2026-02-08-psc-webtool-design.md` for the full document. This file is a synced copy.
