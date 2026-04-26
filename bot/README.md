---
title: Bidaya Nihaya Search Bot
emoji: 📖
colorFrom: green
colorTo: blue
sdk: docker
pinned: false
short_description: Telegram bot for searching al-Bidayah wan-Nihayah
---

# Bidaya Nihaya Search Bot

Telegram bot yang mencari kitab al-Bidayah wan-Nihayah karya Ibn Katsir berdasarkan pertanyaan bahasa Indonesia, lalu menjawab dengan kutipan jilid dan halaman.

Bot: https://t.me/bidaya_nihaya_search_bot

## Cara kerja

1. User kirim pertanyaan bahasa Indonesia ke bot.
2. Gemini 2.5 Flash menerjemahkan pertanyaan jadi 5-8 keyword Arab klasik.
3. Bot grep keyword tersebut di full corpus (`corpus/bidaya_arab.txt`, format OpenITI).
4. Top 5 passage (per halaman) di-rank berdasarkan jumlah keyword cocok.
5. Gemini ringkas dalam bahasa Indonesia + cite jilid+halaman.

## Stack

- Python 3.11
- python-telegram-bot 21
- google-generativeai (Gemini 2.5 Flash)
- Flask (port 7860, untuk HF Spaces healthcheck)
- Docker
